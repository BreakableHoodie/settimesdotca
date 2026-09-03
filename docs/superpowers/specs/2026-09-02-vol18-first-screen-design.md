# Vol. 18 first screen — Board wearing Flyer

Design for the `/event/:slug` above-the-fold experience, targeting Long Weekend
Band Crawl Vol. 18 (event 37, `lwbc18`, 2026-10-11) and every volume after it.

Status: agreed 2026-09-02. Not yet planned or implemented.

## Problem

Two problems, and they are the same problem.

**Nothing on the first screen is content.** Measured on a 390 px viewport against
production: a fan passes roughly 1,300 px of controls before the first act name.
In order — header, lifecycle pill, clock, title block, poster chip, Live
Lineup/My Route toggle, "How it works" banner, "Full Lineup" heading, By
Time/By Venue toggle, Copy Visible Schedule, Select All, genre dropdown, and a
privacy banner pinned to the bottom. **Nine controls before one band.** The
person this hurts most is standing on King St N at 21:30 holding a phone in one
hand.

**The site inherits none of the event's identity.** The poster is a hand-drawn
punk flyer and it is the most characteristic thing about the night. The page
renders it at 54 px and then presents the lineup in generic dark-UI chrome —
rounded grey pills, system sans, neutral cards. The `SETTIMES` wordmark is
strong and nothing else descends from it. The result reads as a competent
listings site for any city.

Vol. 18 is also a different shape from Vol. 17: 15 acts across 4 venues on one
block, rather than 22 across 6. Denser, more walkable, and a fan can realistically
catch more of it — which raises the cost of a bad routing decision and makes the
first screen matter more, not less.

## Decisions taken

Agreed with the owner on 2026-09-02, after comparing three directions
(Flyer / Board / Street) as phone-width mockups:

| Decision | Choice |
|---|---|
| Direction | **Board structure, Flyer skin** |
| Poster's reach | **Accent + texture per edition**; one shared display face across all editions |
| Above the fold | **Lineup only** |
| Street direction | Kept in reserve for a volume where the walk is the story |

**Why the combination rather than either alone.** Board decides what earns the
first screen; Flyer decides what it feels like. They were never really competing.
Board alone is cooler than the event actually is; Flyer alone bets the page on
every volume's poster being strong and legible, which we cannot guarantee.

**Why lineup-only forces the skin to be ambient.** With no room for a hero block,
edition identity cannot be a banner — it has to arrive as accent, texture and
type. That constraint is what makes the two directions compose instead of
collide.

## Scope

In scope:

- The `/event/:slug` above-the-fold layout and its control furniture
- A board-style schedule row
- Per-edition accent + texture, set in admin and validated on write
- A fold regression guard

Out of scope, deliberately:

- The Street (venue-led) direction
- Drift / late-start signalling. The footer already says "Times are subject to
  change - late starts happen!" — the expectation is set socially, which is
  cheaper and better than building it.
- `/s/:slug`, `/embed/:slug`, recap and directory pages. They inherit the tokens
  but their layout is unchanged.

## The fold

Target: an act name rendered within ~130 px of the viewport top.

1. **Header line** — wordmark, live status, clock. Collapsed from today's two rows.
2. **Edition line** — `VOL. 18 · SUN OCT 11 · DOORS 6:30 · KING ST N`, mono,
   uppercase, sitting on the edition's texture. One line, not a card.
3. **Board rows** — immediately.

Displaced furniture:

| Control | Where it goes |
|---|---|
| By Time / By Venue | Compact toolbar, sticky on scroll |
| Genre filter | Same toolbar |
| Copy Visible Schedule | Overflow menu |
| Select All | Overflow menu |
| "How it works" | First visit only, not permanent furniture |
| My Route | Remains reachable, below the fold |

The privacy banner is unchanged in behaviour but must not overlap the first
board rows on a short viewport.

## The board row

A three-column grid: time · act + sub · venue code.

- **Time** — mono, `font-variant-numeric: tabular-nums`, the largest numeral on
  the row. Times are the data on this page, so they get the weight.
- **Act** — the shared display face, uppercase.
- **Sub** — minutes left for the live set, walk time otherwise. Reuses the
  existing walk-time calculation from My Route; this is a new presentation of
  data we already compute, not a new capability.
- **Venue code** — a short chip, e.g. `PROH` / `REVI` / `BLUE` / `PRIN`.
- The live row is lit with the edition accent.

**Venue codes are derived in the frontend from the venue name to start — no
migration.** Add a real `short_code` column only if derivation produces
collisions or something ugly. **The test case is Blue Room and Revive Karaoke**,
which share an address (28 King St N) and whose names both reduce awkwardly;
if the derivation cannot separate those two cleanly it has failed and the column
is the answer.

Cancelled sets keep their existing struck-through treatment and Cancelled label
(#732). The board must not suppress them — see the cancellation invariant in
CLAUDE.md.

## Per-edition skin

Two nullable columns on `events`:

- `accent_color` — hex, the edition's accent
- `texture` — one of a small fixed set (`halftone`, `riso`, `xerox`, `none`)

**Set explicitly in admin, never sampled from the poster.** Sampling is fragile
and unpredictable, and it would have to be fought every volume. An explicit
value is also the only kind that can be validated before it ships.

When both are null the page renders exactly as it does with the current default
accent. That is the required fallback, not a nicety: every archived edition has
null values and must keep rendering correctly.

### The sharp risk — a data-borne accessibility failure

**A per-edition accent is data, not source.** The contrast guards added in #1075
and #1077 are source scans; they read declared class names and theme tokens out
of the repository. They **cannot see a hex typed into an admin form.** A bad
accent would ship an AA failure straight past every test in the suite.

So the validation has to move to the write path:

- **Reject on save** any `accent_color` that fails 4.5:1 **in all four themes**,
  in both roles it plays. The accent is used two ways and each is a distinct
  check: as the **lit live-row background** (validate against the row's text
  token) and as the **time/label text** on the board (validate against the row's
  surface token). A hex can pass one and fail the other, so checking a single
  pairing is not enough. Same maths as the guards, enforced server-side.
- The maths already exists in `frontend/src/test/contrastMath.js`. Pages
  Functions cannot import from `frontend/`, so the server needs its own copy —
  this is the same build-boundary situation as the after-midnight threshold,
  which has two canonical homes by necessity. **Two homes, not three**, and the
  server copy is the authority for the write path.
- Admin shows live contrast feedback per theme while picking, so the rejection
  is never a surprise.

A test must prove the rejection fires, seeded with an accent that passes on the
dark themes and fails on a light one — the asymmetric case is the one that
actually occurs, and a fixture that fails everywhere would pass a broken
validator.

## Files touched

- `frontend/src/App.jsx` — fold restructure
- New board row component (and the extraction of schedule rendering that implies)
- `frontend/src/components/LiveContextBar.jsx` — collapse to one line
- New edition-skin token application
- Admin event form — accent picker with per-theme contrast feedback
- `functions/` — write-path contrast validation, and its server-side colour maths
- One migration — `events.accent_color`, `events.texture`

`App.jsx` and `LiveContextBar.jsx` are both large. The fold work is a reasonable
moment to extract the schedule rendering into its own component rather than grow
either file further.

## Testing

- **Fold guard.** A Playwright assertion that an act name renders above 844 px at
  390 px width. This turns "nine controls before one band" into a test that fails
  if it ever returns. It is the durable guard this whole design earns.
- **Contrast validation.** Mutation-proven: removing the rejection must turn a
  test red, using the asymmetric fixture described above.
- **Null-skin fallback.** An event with no accent or texture renders correctly —
  every archived edition is this case.
- **Cancelled sets** still render struck-through in the board layout.
- The existing theme and link-button contrast guards continue to pass.

## Rollout — two phases, planned separately

This is more than one implementation plan's worth of work, and the two halves are
cleanly separable. **Phase 1 does not depend on Phase 2 in either direction**, so
Phase 1 can ship and be judged on a real phone before Phase 2 is written.

**Phase 1 — the fold.** Header collapse, edition line, board row, venue-code
derivation, displaced control furniture, and the fold guard. No migration, no
admin change, no write-path validation. Renders on the current default accent.
This is the half that fixes "nine controls before one band", and it is the half
with a deadline.

**Phase 2 — the skin.** The two `events` columns, the admin picker, the
server-side contrast validation and its tests. Additive and nullable, so it is
safe to land at any point; until an edition sets values, Phase 1 keeps rendering
on the default.

The Phase 1 restructure should land with enough runway to be seen on a real phone
at a real venue before doors — not in the final week. Phase 2 has no such
constraint and may land after Vol. 18 without loss.

## Open questions

None blocking. Two to settle during planning:

- Whether the sticky toolbar collapses further once scrolled past the lineup.
- Whether `texture` belongs on the event or is better expressed as a named preset
  shared across volumes that reuse a look.
