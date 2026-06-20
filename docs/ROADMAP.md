# SetTimes.ca Roadmap

Canonical active roadmap for SetTimes.ca. Use this file for handoffs between Claude, OpenCode, and humans.

Last updated: 2026-06-19

## Mission

Build SetTimes.ca into the best multi-venue and multi-artist event platform for Waterloo Region, starting with Long Weekend Band Crawl Vol. 17 on August 2, 2026.

## Fixed Context

- Region: Waterloo Region only, with current focus on Kitchener-Waterloo.
- Brand: SetTimes.ca. Do not rebrand.
- Event: Long Weekend Band Crawl Vol. 17, August 2, 2026.
- Venues: Blue Room, Princess Cafe, Prohibition Warehouse, Revive Karaoke, Room 47, Roost.
- Lineup: 22 bands, doors 6:30 PM, show 6:45 PM, ages 19+.
- Priority balance: fan-facing experience and admin tooling are both critical.
- SEO: event pages, band pages, local discovery, and structured data matter.
- Media model: one photo per band via existing `photo_url` and R2 upload flow. No video embeds.
- Theme model: four user-selectable themes via Tailwind v4 CSS custom properties and `data-theme` on `<html>`, persisted in localStorage.

## Operating Rules

- Never merge with failed CI.
- Read review comments carefully, including line-level PR comments.
- Reply to review comments when addressed.
- Add or update tests for behavior changes where testable.
- Keep changes small and focused. Avoid mixing roadmap/docs, dependency work, and feature work in one PR.
- Avoid direct writes to localStorage schedule keys; use `frontend/src/utils/scheduleStorage.js`.
- Preserve after-midnight sorting behavior from `frontend/src/utils/bandUtils.js`.

## Immediate Merge Queue

1. Merge roster formatting follow-up if still open.
   - Purpose: keep `main` format-clean after the follower count roster change.
   - Verify: all CI green.

2. Merge frontend dependency remediation if still open.
   - Purpose: clear current frontend dependency alerts.
   - Verify: `npm audit --audit-level=low` passes in `frontend/` and CI is green.

3. Merge announcement resend/backfill work if still open.
   - Purpose: per-follower announcement delivery tracking and resend recovery.
   - Verify: backfill migration, resend race fix, backend tests, and CI green.

## Track A: Vol. 17 Public Experience

Goal: make the public event page useful before, during, and after the crawl.

P0:

- Redesign event page into lifecycle states: preview, live, recap, archive.
- Build a mobile-first live schedule with Now Playing, Starting Soon, and My Next Set.
- Rename and refine My Schedule into My Route.
- Improve save/remove actions and overlap warnings.
- Preserve offline-readable schedule and saved route state.

P1:

- Add venue-lane schedule view.
- Add walking-time hints between King Street venues.
- Add map-aware next-stop suggestions.
- Improve post-event archive and recap modules.

## Track B: Visual Identity And Themes

Goal: deliver a fresh Vol. 17 identity while preserving readable, fast UI.

Done:

- Theme foundation with four palettes via `data-theme`.
- LocalStorage persistence and FOUC prevention script.
- Dynamic `theme-color` metadata.
- Visible public header theme toggle.

Next:

- Ensure all admin and public surfaces use semantic theme tokens.
- Tune mobile contrast for low-light event conditions.

## Track C: Band And Event SEO

Goal: make SetTimes.ca discoverable for local artists, venues, and event searches.

P0:

- Improve band profile metadata and structured data.
- Improve event page structured data.
- Ensure Waterloo Region language is consistent.
- Remove or avoid non-Waterloo references in new docs/code.

P1:

- Add better archive pages for recurring events.
- Add stronger internal links between bands, venues, events, and recaps.

## Track D: Admin Tooling

Goal: make event setup and live operations reliable and fast for organizers.

Done or in flight:

- Bulk band import.
- Bulk band delete fixes.
- Per-band verified follower counts in roster.
- Per-follower announcement tracking with resend recovery.

Next:

- Improve roster mobile view and sorting quality.
- Improve lineup management for reveal-mode events.
- Surface follower engagement where it helps announcement planning.
- Keep viewer/editor/admin RBAC boundaries explicit on every mutating endpoint.

## Track E: Performance And Reliability

Goal: keep the site fast on mobile and safe to operate under event load.

P0:

- Code-split `AdminApp` to reduce the large admin chunk.
- Keep build warnings visible and actionable.
- Re-run ZAP baseline after CSP/header changes.
- Keep dependency alerts at zero where practical.

P1:

- Review caching and offline behavior for the schedule.
- Improve observability around metrics ingestion and email delivery failures.

## Reference Docs

- `CLAUDE.md`: assistant context, invariants, stack, and safety rules.
- `docs/SETTIMES_V2_UX_BRIEF.md`: UX direction and product experience details.
- `docs/TESTING.md`: testing strategy and known test categories.
- `docs/DATABASE.md`: schema and database implementation notes.
