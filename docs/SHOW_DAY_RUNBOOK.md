# Show-day runbook

What to do when something changes during an event, and which actions silently do nothing.

Written 2026-08-05, before Buddies Fest 2 (event 36, Aug 7–9). Re-verified 2026-09-30 for **Vol. 18 (event 37, `lwbc18`, single day, Oct 11)**. If a procedure stops matching the code, fix this file in the same change.

---

## A band drops

**Cancel the set. Do not un-announce it, and do not delete it.**

Admin → the event's **Lineup** tab → find the set → **Cancel**. It is reversible; **Restore** puts it back.

**Replacing the act:** a cancelled set frees its slot, so the replacement can be booked at the exact same venue and time. Once it is, **Restore** on the pulled act is refused ("now holds this slot") rather than double-booking it — move one of the two sets first if the original act is back on.

What that does for fans:

- the set stays visible, struck through, with a "Cancelled" label — on the schedule, the artist page, the venue page and the event page
- it stops being offered as "up next", never shows "Live Now" or "starts in N minutes", and cannot be added to a route
- calendar subscribers get `STATUS:CANCELLED`, which Google and Apple render natively
- **no announcement email can go out** for it, even if someone announces it afterwards

Why not the alternatives:

| Action | What actually happens |
|---|---|
| Set `is_announced = 0` | **No public change at all** on a published lineup. See "Silent no-ops" below. It can still send email if re-announced |
| Delete the performance row | Hides it — but a fan who already saw the lineup gets no signal, and the stop vanishes from their shared route without explanation |

**A band with two sets needs each one cancelled separately.** At BF2, ALL and Kepi Ghoulie each play twice.

## A set time changes

Admin → Lineup tab → edit the set's start/end time.

**If the new time is after midnight, check the date field.** `performance_date` stores **the evening the set belongs to**, not the wall-clock calendar date.

Worked example: a set that starts at **00:25 in the early hours of Sunday, August 9** — i.e. the tail of **Saturday, August 8's** night — is stored as `performance_date = 2026-08-08`. Where's Shane? is exactly this case at BF2.

Getting it wrong sorts the set to the top of the wrong day instead of the end of the right one.

The cutover is 6 AM: anything starting before 06:00 belongs to the previous evening.

**Moving several sets at once** (e.g. swapping two acts): use the event's **Schedule** grid, which saves every changed row together and checks the *final* arrangement for clashes. Saving the rows one at a time would refuse a swap, because each half clashes with the other's old time.

**A set with no end time** (a closing act billed "12:25 – END"): leave the end blank. The site treats it as one hour long for "playing now", "up next" and the calendar feed, so it shows as live once it starts. Enter a real end time only if the organizers give one.

## A band is added last minute

Admin → Lineup tab → add the artist, venue, and set time. If the artist has no profile yet, one is created.

For a multi-day event, set the correct **performance date** — it is not inferred from the time.

## Doors / gates times change

Doors are stored per day on the event as `doors_json`, e.g. `{"2026-08-07":"15:00","2026-08-08":"15:00","2026-08-09":"15:00"}`.

This drives the "Live Tonight" / "Happening Now" edge on an event's **first day only** — the earliest of doors time, first set, or local midnight wins. Day 2+ is never re-gated.

## Silent no-ops — things that look like they worked

**Un-announcing a set on a published lineup.** Every public read path that returns per-performance rows guards with `AND (e.reveal_mode = 0 OR p.is_announced = 1)`. When `reveal_mode = 0` — the normal state for a published event, and BF2's state — that condition is already true, so `is_announced` is never consulted **for visibility**. The set stays fully visible. Nothing errors.

Two things follow, and they are easy to conflate:

- **Visibility:** un-announcing hides nothing on a `reveal_mode = 0` event. Only the cancel toggle does that. Hiding act-by-act is what `reveal_mode = 1` is for.
- **Email:** `is_announced` going `0 → 1` is still what triggers the follower announcement email, on *any* reveal mode. So un-announcing and re-announcing a set here is publicly invisible **and** capable of sending mail. (A *cancelled* set cannot send — that guard is separate and holds regardless.)

**Editing a shared route.** `share_links` stores a snapshot of the band names taken when the link was created. Changing the lineup afterwards does not rewrite existing share links; the page resolves live data for times and venues, and drops sets that no longer exist.

**A fan's saved schedule.** Selections live in the fan's own browser (`localStorage`), not on the server. You cannot edit or clear someone's saved route, and cancelling a set deliberately does **not** remove it from theirs — they see it struck through and remove it themselves.

## If something looks wrong on the live site

1. **Check the API before the page.** `https://settimes.ca/api/events/{id}/details` and `https://settimes.ca/api/venues/{id}` show exactly what the frontend receives (Vol. 18 is event `37`). Most "the page is wrong" reports are the payload being wrong.
2. **Deploys are automatic on merge to `main`**, including database migrations. There is no manual apply step. A change that is merged but not visible is usually a deploy still running — check Actions.
3. **Set times, cancellations and venues cache for about a minute** (`Cache-Control: public, max-age=60` on show-critical endpoints; browse-only pages cache 5 minutes). A correct-looking database and a stale page is usually this: wait a minute rather than re-editing.
4. **Times are Toronto-local everywhere.** If something classifies as the wrong day, suspect the after-midnight rule (above) before suspecting a timezone bug.

## Telling fans about a change

Nothing emails anyone automatically when a set moves or is cancelled.

- **Calendar subscribers** see changes late: the feed is cached for **up to an hour** (`max-age=3600`), and each calendar app then refreshes on its own schedule (often every few hours). Times move and a cancelled set shows as cancelled, but not quickly.
- **Band followers** are emailed when a set is first *announced*. There is no email for a later change. The Lineup tab's **Resend announcement** only reaches followers the *original* announcement missed (a partial send); it never re-mails anyone and never describes a change.
- **Subscribers** get the admin **Notify** broadcast, and each kind of notice ("lineup is live", "set times are up") goes to a subscriber **at most once**. Pressing it again after a change sends nothing to people who already had it.

So for a change on the day, **post it on Instagram** (@settimes.ca, and ask the organizers to share). The site itself shows the change within about a minute; calendars and email will not keep up.

## What to avoid mid-event

- **Do not run migrations or dependency upgrades during an event.** Both deploy automatically on merge.
- **Do not delete a venue or an event** that has performances attached.
- **Do not bulk-edit the lineup** while people are using the site; per-set edits are safe and immediate.

---

## Related

- `CLAUDE.md` → "Pulling a band from a live lineup" — the same rule with the code paths
- `docs/ADMIN_HANDBOOK.md` — general admin usage, not show-day specific
