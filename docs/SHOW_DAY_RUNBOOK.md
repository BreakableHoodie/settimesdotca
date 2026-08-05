# Show-day runbook

What to do when something changes during an event, and which actions silently do nothing.

Written 2026-08-05, before Buddies Fest 2 (event 36, Aug 7–9). Everything here was verified against the code and production data at that date — if a procedure stops matching the code, fix this file in the same change.

---

## A band drops

**Cancel the set. Do not un-announce it, and do not delete it.**

Admin → the event's **Lineup** tab → find the set → **Cancel**. It is reversible; **Restore** puts it back.

What that does for fans:

- the set stays visible, struck through, with a "Cancelled" label — on the schedule, the artist page, the venue page and the event page
- it stops being offered as "up next", never shows "Live Now" or "starts in N minutes", and cannot be added to a route
- calendar subscribers get `STATUS:CANCELLED`, which Google and Apple render natively
- **no announcement email can go out** for it, even if someone announces it afterwards

Why not the alternatives:

| Action | What actually happens |
|---|---|
| Set `is_announced = 0` | **Nothing visible.** See "Silent no-ops" below |
| Delete the performance row | Hides it, but a fan who already saw the lineup gets no signal, and the band's name is left stranded on already-shared routes |

**A band with two sets needs each one cancelled separately.** At BF2, ALL and Kepi Ghoulie each play twice.

## A set time changes

Admin → Lineup tab → edit the set's start/end time.

**If the new time is after midnight, check the date field.** `performance_date` stores **the evening the set belongs to**, not the wall-clock calendar date. A set at 00:25 on the night of Saturday the 8th is stored as `2026-08-08`, not the 9th. Getting this wrong makes the set sort to the top of the wrong day.

The cutover is 6 AM: anything starting before 06:00 belongs to the previous evening.

## A band is added last minute

Admin → Lineup tab → add the artist, venue, and set time. If the artist has no profile yet, one is created.

For a multi-day event, set the correct **performance date** — it is not inferred from the time.

## Doors / gates times change

Doors are stored per day on the event as `doors_json`, e.g. `{"2026-08-07":"15:00","2026-08-08":"15:00","2026-08-09":"15:00"}`.

This drives the "Live Tonight" / "Happening Now" edge on an event's **first day only** — the earliest of doors time, first set, or local midnight wins. Day 2+ is never re-gated.

## Silent no-ops — things that look like they worked

**Un-announcing a set on a published lineup.** Every public query guards with `AND (e.reveal_mode = 0 OR p.is_announced = 1)`. When `reveal_mode = 0` — the normal state for a published event, and BF2's state — that condition is already true, so `is_announced` is never consulted. The set stays fully visible. Nothing errors.

`is_announced` is only meaningful on a `reveal_mode = 1` event, where the lineup is revealed act by act.

**Editing a shared route.** `share_links` stores a snapshot of the band names taken when the link was created. Changing the lineup afterwards does not rewrite existing share links; the page resolves live data for times and venues, and drops sets that no longer exist.

**A fan's saved schedule.** Selections live in the fan's own browser (`localStorage`), not on the server. You cannot edit or clear someone's saved route, and cancelling a set deliberately does **not** remove it from theirs — they see it struck through and remove it themselves.

## If something looks wrong on the live site

1. **Check the API before the page.** `https://settimes.ca/api/events/<id>/details` and `/api/venues/<id>` show exactly what the frontend receives. Most "the page is wrong" reports are the payload being wrong.
2. **Deploys are automatic on merge to `main`**, including database migrations. There is no manual apply step. A change that is merged but not visible is usually a deploy still running — check Actions.
3. **The API caches for 5 minutes** (`Cache-Control: public, max-age=300` on the public read endpoints). A correct-looking database and a stale page is usually this; wait it out rather than re-editing.
4. **Times are Toronto-local everywhere.** If something classifies as the wrong day, suspect the after-midnight rule (above) before suspecting a timezone bug.

## What to avoid mid-event

- **Do not run migrations or dependency upgrades during an event.** Both deploy automatically on merge.
- **Do not delete a venue or an event** that has performances attached.
- **Do not bulk-edit the lineup** while people are using the site; per-set edits are safe and immediate.

---

## Related

- `CLAUDE.md` → "Pulling a band from a live lineup" — the same rule with the code paths
- `docs/ADMIN_HANDBOOK.md` — general admin usage, not show-day specific
