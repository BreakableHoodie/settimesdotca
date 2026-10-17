# Lineup cancellation

Moved verbatim from `CLAUDE.md` on 2026-10-16, when it passed the 150k-character
limit. `CLAUDE.md` keeps the rules; this file keeps the incidents, measurements
and reasoning behind them. Read it before changing the code a section guards.

## Pulling a band from a live lineup
**Use the cancel toggle (`is_cancelled = 1`). Do not un-announce, and do not delete the row.**

`is_announced = 0` is **not** a way to hide a set. Every public read path **that returns per-performance rows** guards with `AND (e.reveal_mode = 0 OR p.is_announced = 1)` — **10 files**, and three of them bind `reveal_mode` as a parameter (`AND (? = 0 OR p.is_announced = 1)`): `api/events/[id]/details.js`, `api/schedule.js`, and `event/[slug].js`, which uses both forms. Grep for `is_announced = 1` rather than the literal `e.reveal_mode` form or you will undercount:

`api/bands/[name].js`, `api/bands/[name]/stage-mates.js`, `api/bands/stats/[name].js`, `api/events/[id]/details.js`, `api/events/timeline.js`, `api/feeds/ical.js`, `api/schedule.js`, `api/schedule/share/[slug].js`, `api/venues/[id].js`, `event/[slug].js`

**The grep over-reports, so check the projection before adding a file here.** `is_announced = 1` also appears in `api/bands/follow-batch.js` (`SELECT DISTINCT p.band_profile_id` — band-level, not per-performance), `api/schedule/build.js` (`SELECT p.id` only) and `s/[slug].js` (id + name for the OG card). None returns per-performance rows, so none belongs in the list above. `api/schedule/share/[slug].js` does — it projects `start_time`, `end_time`, `performance_date`, `is_cancelled` and `venue` — and was missing from this list until 2026-09-20, even though that file's own comment already described itself as joining "the nine other public read paths."

On a `reveal_mode = 0` event the left side short-circuits **true**, so `is_announced` is never consulted for visibility. The set stays on the schedule, the artist page, the venue page and the iCal feed. Nothing errors; the failure is invisible until fans arrive at a dark venue.

`is_announced` is not meaningless on such an event, though — the **`0 → 1` transition still drives the follower announcement email** (see "Band Announcements" below). Un-announcing and re-announcing a set on a `reveal_mode = 0` event changes nothing publicly while still being capable of sending mail.

`reveal_mode = 0` is the normal state for a published lineup — Buddies Fest 2 (event 36) is `reveal_mode = 0`. So this trap applies to exactly the events you are most likely to be editing during a show.

Deleting the performance row does hide it, but it is lossy: a fan who already saw the lineup gets no signal the set was cancelled, and since #733 the set is **dropped entirely** from already-shared routes — `schedule/share/[slug].js` resolves live performances and filters out ids that no longer exist, so a fan reopening their shared link finds the stop silently gone rather than marked off. (Before #733 it left an orphaned name with no time or venue, which read as a rendering bug; dropping it is better, but neither tells the fan the set was cancelled.)

Since #732 the correct action is the reversible cancel toggle in LineupTab (`PATCH /api/admin/bands/:id` with `is_cancelled: true`, `editor` role or above). It keeps the set visible and struck through with a "Cancelled" label on every fan surface, suppresses it from "up next" routing and live/starting-soon time math, makes it unselectable, emits `STATUS:CANCELLED` to calendar subscribers, and **blocks the announcement email** — a cancelled performance can neither queue nor send a follower notification.

**Un-cancelling does not resend anything.** The announce path fires only on an `is_announced` `0 → 1` transition (`hasAnnounced && newValue === 1 && isCancelled === 0 && performance.is_announced === 0 && !performance.band_follow_notified`). Restoring a set leaves `is_announced` untouched, so a performance that was already announced before being cancelled produces no new transition, no `band_announce_queue` rows, and no follower email. Un-cancel restores visibility and selectability only. **It is also the one transition that can double-book**, because a cancelled set frees its slot (decided 2026-09-22): the PATCH runs `checkConflicts` on a `1 → 0` `is_cancelled` change and answers 409 naming whoever now holds the slot, never auto-resolving which act keeps it. Keep `docs/SHOW_DAY_RUNBOOK.md` in step.

Operational detail: cancelling is scoped to _one performance_. A band playing two sets (ALL and Kepi Ghoulie each play twice at BF2) needs each set cancelled separately.

**The iCal feed omits a set with no `start_time` rather than inventing one (#1079).** It
used to substitute `"20:00"`, which on 2026-09-02 put all 15 of Vol 18's announced
sets in subscribers' calendars stacked at 8:00 PM -- the entire content of the feed,
fabricated -- while `/event/lwbc18` correctly said "Time To Be Announced". Two public
surfaces stating different things about the same rows.

Omitting is both the honest shape and the consistent one: the feed is
_performance_-driven, so it already reports an event with no lineup as no `VEVENT`s,
and an unscheduled set is that same case one row down. An absent entry is
recoverable; a wrong entry in a calendar someone trusts is not. A missing `end_time`
is never a constant -- a literal `"21:00"` against a 23:00 start is _before_ it,
which the midnight-straddle roll then reads as spanning into the next day, turning an
absent end time into a 22-hour event. In the calendar files it is stated as
`DURATION:PT1H`, not a computed `DTEND`: on the night Toronto repeats 01:00, 01:30
plus one wall-clock hour is a two-hour event, while a `DURATION` is elapsed time.

**The frontend derives it the same way** (`DEFAULT_SET_DURATION_MS` in
`frontend/src/utils/bandUtils.js`, applied in `prepareBands`). Until the Vol. 18
readiness pass it left `endMs = 0`, so an open-ended closer ("12:25 – END") was
"upcoming" forever, never "playing now", and dropped from My Route as finished.
Keep the surfaces in step: one hour from the start.

**A third surface: the My Route calendar export** (`frontend/src/utils/routeIcs.js`, #1251). It builds an `.ics` of only the fan's picked sets, entirely in the browser, and must follow the feed's rules exactly: after-midnight sets dated on the next calendar day, no start time omitted, a missing end stated as a one-hour `DURATION`, cancelled sets as `STATUS:CANCELLED`, and the same UID scheme. Change one and you change both. `DESCRIPTION` lines are joined with a real newline and escaped ONCE; joining with a literal `"\\n"` and then escaping produced `\\n`, which calendars show as the text "\n" (the server feed shipped that bug).

The server feed's two fallbacks -- an unscheduled set is omitted, and a missing end
is never a constant (`ical-no-fabricated-start-time`, `ical-end-time-derived-not-constant`)
-- are in the mutation gate. The My Route export is NOT: the gate covers `functions/`
only, so its tests in `frontend/src/utils/__tests__/routeIcs.test.js` are the guard
there. A fallback is invisible to every happy-path test by construction, which is how
the constant survived in a file that already had four describe blocks.

**Every calendar time is bound to Toronto (`DTSTART;TZID=America/Toronto` plus a
`VTIMEZONE`), never floating.** A DTSTART without a TZID floats under RFC 5545,
so a subscriber travelling west saw each set at the right hour in the WRONG zone;
`X-WR-TIMEZONE` is a non-standard hint that does not prevent it. Two homes again,
for the build-boundary reason: `functions/api/feeds/ical.js` and the on-device
"add my route to calendar" export (#1261). Keep the blocks identical.

The human-facing version of this, plus what to do when a set time changes or something looks wrong mid-event, is `docs/SHOW_DAY_RUNBOOK.md`. Keep the two in step — if a procedure changes, change both in the same commit.
