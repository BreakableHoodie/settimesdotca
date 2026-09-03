# Public-facing performance cancellation

**Date:** 2026-08-02
**Status:** Design approved, not yet implemented
**Origin:** Vol. 17 show day — a band was pulled hours before doors and the only
available action was deleting the performance row.

---

## Problem

`performances` models two states: scheduled, or absent. There is no way to say
"this was going to happen and isn't." Pulling a band therefore means deleting the
row, which is lossy in ways that hurt fans:

- The set silently vanishes from the schedule. A fan who already saw the lineup
  has no way to learn it was cancelled — they just find the venue dark.
- `share_links` stores a `band_names` snapshot alongside `performance_ids`, so a
  deleted performance leaves the band's **name** on already-shared lineups with a
  null time and venue — a confusing half-state that reads as a rendering bug.

`is_announced` is not a workaround. Every public query guards with
`AND (e.reveal_mode = 0 OR p.is_announced = 1)`, so on a `reveal_mode = 0` event
the guard short-circuits true and un-announcing changes nothing on the live site.
The failure is invisible until fans arrive at the venue.

## Scope

**In:** a cancelled state on a performance, rendered on every fan-facing surface
while the event is current.

**Out (deliberate):**

- Replacement bands. If someone covers the slot they are added as a normal new
  performance; the cancelled row stays struck through beside it. Two rows at one
  venue-time is an honest record of what happened.
- Suggesting alternatives to fans whose lineup lost a set ("Room 47 is dark until
  00:15 — Princess Cafe has X at 22:40"). Genuinely useful, but it needs gap
  detection and venue proximity, and belongs in its own issue.
- Auto-removing cancelled sets from saved lineups. Editing a fan's saved choices
  without asking is worse than showing them the strikethrough.
- A public cancellation *reason*. Cancellations are frequently not the artist's
  fault and the reason is often not ours to share.

## Data model

Migration adds one column:

```sql
ALTER TABLE performances ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0;
```

This matches the existing convention (`is_announced`, `is_published`,
`band_follow_notified`). Rejected alternatives:

- `cancelled_at TEXT` — carries the timestamp too, but breaks the `is_*` naming
  convention and puts every write in reach of the SQLite datetime trap (space
  separator, never `toISOString()`).
- `status TEXT CHECK(...)` — more extensible, but replacement is explicitly out
  of scope, and altering a CHECK constraint in SQLite means rebuilding the table.

After the migration, run `node scripts/regenerate-setup-complete.mjs` then
`node scripts/check-schema-drift.mjs` (CI enforces this via `quality.yml`).

## API changes

Eight endpoints, in two distinct modes. The distinction matters: **returning a
field is safe; gating a row is where this codebase has been bitten.**

| Endpoint | Behaviour |
|---|---|
| `api/schedule.js` | Return `is_cancelled`. Row always included. |
| `api/events/[id]/details.js` | Return `is_cancelled`. Row always included. |
| `api/venues/[id].js` | Return `is_cancelled`. Row always included. |
| `api/schedule/share/[slug].js` | Return `is_cancelled` on each `bands[]` entry. |
| `api/bands/[name].js` | Return for current events; **exclude for past events**. |
| `api/bands/stats/[name].js` | **Exclude** — a cancelled set must not inflate play counts. |
| `api/events/timeline.js` | **Exclude** from "Happening Now" / "Up Next". |
| `api/feeds/ical.js` | Emit RFC 5545 `STATUS:CANCELLED` on the VEVENT. |

`STATUS:CANCELLED` is native to RFC 5545, so Google and Apple Calendar render the
entry as cancelled without any custom handling.

### The one risky gate

"Drops from history" is the only place this feature *excludes* rows, and it is
therefore the only place it can fail silently. The past/current determination
**must** use `eventLocalToday()` from `functions/utils/eventDay.js`. A
`toISOString().slice(0, 10)` comparison flips to tomorrow at 8 PM Eastern — the
exact bug class fixed in #568 — which would make cancelled sets vanish from the
live schedule mid-evening, on the night they matter most.

The after-midnight convention applies unchanged: a cancelled 00:15 set belongs to
the previous evening (`AFTER_MIDNIGHT_THRESHOLD_HOUR`, canonically in
`frontend/src/utils/festivalDays.js`).

## Rendering

Semantic markup, not a CSS-only class:

- **`<s>` on the band name.** `<s>` means "no longer accurate or relevant," which
  is precisely a cancelled set. `<del>` means removed from a document — wrong.
- **A visible "Cancelled" pill**, reusing the existing warning-pill pattern at
  `BandCard.jsx:155–168`, with `text-text-primary` on a `warning`-tinted
  background per the status-colour convention.

The visible label is the accessible carrier, not the strikethrough:
`text-decoration: line-through` is not announced by NVDA or JAWS by default, and
conveying state through styling alone fails WCAG 1.4.1 (Use of Colour).

The band name stays at `text-text-secondary`. Not `text-text-disabled` — that
token (`#6b7280`) is tuned for disabled controls and will not clear 4.5:1 on the
light themes. The set is being *marked*, not hidden.

### Behavioural suppressions

In descending order of how badly each would bite:

1. **Never "up next."** `NextMove.jsx`, `ComingUp.jsx`, `LiveContextBar.jsx`, and
   `events/timeline.js` must skip cancelled sets. Directing a fan across King St
   for a band that isn't playing is the worst possible failure of this feature.
2. **Never "Live Now" or "starts in N minutes."** Both are pure time math
   (`BandCard.jsx:97`, `:145`) and will happily light up a cancelled row.
3. **Not selectable.** The toggle button is hidden and the card is not clickable.
   A set already in a saved lineup still renders struck through in My Schedule;
   the fan removes it themselves.

## Admin

There is no `functions/api/admin/performances/` route — performance writes
currently go through `functions/api/admin/bands/[id].js` (single) and
`functions/api/admin/bands/bulk.js` (bulk). The cancel toggle extends the single
handler rather than adding a route, guarded by
`checkPermission(context, "editor")` like every other mutating endpoint.

`LineupTab` gets the toggle in the UI. Cancelling is reversible — un-cancelling
restores the set — which is the whole point of not deleting.

## Testing

Each endpoint test asserts on **what changes**: flip `is_cancelled` and prove the
response differs. Per the defect class seen three times in #712/#714, an
assertion that passes against both the correct and the broken implementation is
worth nothing; prove each test fails by mutating the implementation.

The three behavioural suppressions get explicit tests. They are behaviour, not
rendering, and are exactly where a to-spec implementation stops short.

Playwright covers the strikethrough visually plus an a11y pass — the `<s>` +
visible-label combination is what an axe colour-alone check would otherwise flag.

## Rollout

Normal migration → merge → auto-apply on deploy. Nothing is required for Vol. 17:
the lifecycle rule means that by the time this ships, Vol. 17 will be past and a
cancelled set would be excluded from history anyway, so the hard delete performed
on show day is retroactively consistent with this design.
