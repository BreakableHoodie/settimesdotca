# Email delivery

Moved verbatim from `CLAUDE.md` on 2026-10-16, when it passed the 150k-character
limit. `CLAUDE.md` keeps the rules; this file keeps the incidents, measurements
and reasoning behind them. Read it before changing the code a section guards.

## A claim is not a delivery record (#1152)
`band_follow_notifications` used **one** row to mean two things: _"I am sending
to this person"_ and _"this person has been sent to."_ A Worker that died
between the two -- and the gap is a live network round-trip wide -- left a row
that every later reader, **resends included**, read as "already notified." The
follower was dropped permanently and silently. Silence is the worst shape a mail
bug can take: nothing errors, nothing retries, and the fan simply never hears.

Migration 0065 splits the row into `claimed_at` (NOT NULL, defaults to now) and
`delivered_at` (nullable, set **only** on provider confirmation). It drops
`notified_at`, which could only ever have restated one of the two.

**The two rules are a PAIR, and the second is not optional:**

1. An **undelivered** claim past its lease is abandoned, and must be retried.
2. A **delivered** row is never retried, however old.

Rule 1 alone is satisfied by making _everything_ retryable -- which would
re-mail the entire history on the first resend. That is why every test here
comes in twos.

Failed-send release is attempt-specific: it matches that attempt's `claimed_at`
and `delivered_at IS NULL`, so a later takeover or delivery can never be removed.

`CLAIM_LEASE_MINUTES` (15) and `claimIsLiveSql(alias)` live in
`functions/utils/bandFollowNotify.js` and are the single home for "does this row
still speak for the follower?". The sender and **every reader** must agree
exactly; when they drift, one side is silently wrong about who has been mailed,
and the symptom is a dropped fan or a duplicate. Current readers:
`api/admin/bands/[id]/resend-announcement.js` (recipient filter) and
`api/admin/events/[id]/metrics.js` (`would_notify_count`). A third reader
imports the helper -- it does not hand-write the predicate.

**Marking `delivered_at` on success is mandatory, not bookkeeping.** Once an
undelivered claim past its lease is retryable, a successful send left unmarked
is indistinguishable from a crashed one and gets re-mailed fifteen minutes
later -- strictly worse than the bug this fixes. `announceDigest.js` is the easy
one to miss: it claims conditionally (on `is_cancelled`, a _different_ concern)
and had no delivery marking at all.

**Why the guard tests live at the SENDER, not the handler.** The read filter and
the takeover's own `delivered_at IS NULL` check are each _independently_
sufficient to stop a re-send. So breaking either one alone leaves every
handler-level test green -- verified by mutation, not assumed: the first draft
of "never retries a delivered row" was written against the endpoint and survived
both mutations, proving nothing. Calling `notifyBandFollowers` directly puts
exactly one guard in play, which is what lets the test fail. Defence in depth and
mutation-testability pull against each other here; prove each guard at the layer
where it stands alone, and keep the endpoint test as documentation of the
combined guarantee rather than evidence for it.

Both sender-level tests are in the mutation gate.

**A confirmation write must never be able to fail a delivered send.** Sending
and recording are two phases with no atomicity between them. If the
confirmation write throws and the throw ESCAPES, the caller's
`Promise.allSettled` tally counts a **delivered** email as failed -- which
invites the resend that turns a lost write into a duplicate. So each of these
is caught locally, logged, and still counted as sent, because it was.

There were **three** such sites at once, and the count is the lesson:
`bandFollowNotify.js`, `announceDigest.js` and `subscriberNotify.js`. Only the
first was written guarded; the second was named by review, and the third --
shipped in #1149 -- was found only by sweeping the class afterwards. Nothing
about an unguarded `await` at one of those call sites looks wrong locally.

`functions/utils/__tests__/deliveryConfirmationGuard.test.js` retires the class:
it discovers every non-test `SET delivered_at` write, asserts each is enclosed
by a `try` (by brace depth, so a try block that _ended_ earlier in the same
function does not count), asserts it still finds at least three, and asserts its
own detector can return **false** -- otherwise every case passes vacuously.

The provider window is closed on the Resend path by an `Idempotency-Key`: band
follow mail uses `band-follow:<performanceId>:<followerId>`, subscriber mail uses
`subscriber:<eventId>:<kind>:<subscriptionId>`, and each digest email uses
`announce-digest:<sha256>` over its recipient and sorted performance ids. A
same-payload retry gets Resend's original success back and sends nothing twice.
**Both 409s are undelivered.** `concurrent_idempotent_requests` is a send still in
flight. `invalid_idempotent_request` (same key, different payload) is tempting to
read as "already sent", but Resend stores a key's first response _whatever it
was_, so a reused key cannot prove a send; counting it delivered would silently
drop a follower whose first attempt was rejected. It is logged at `error` and
retried after the 24h key expiry: a possible late duplicate, never a silent drop.
Postmark and MailChannels do not receive the key because they have no equivalent.
