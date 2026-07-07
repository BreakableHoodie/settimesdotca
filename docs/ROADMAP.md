# SetTimes.ca Roadmap

Canonical active roadmap for SetTimes.ca. Use this file for handoffs between Claude, OpenCode, and humans.

Last updated: 2026-07-07

## Mission

Build SetTimes.ca into the best multi-venue and multi-artist event platform for Waterloo Region, starting with Long Weekend Band Crawl Vol. 17 on August 2, 2026.

## Fixed Context

- Region: Waterloo Region only, with current focus on Kitchener-Waterloo. No non-Waterloo references in new code/docs.
- Brand: SetTimes.ca. Do not rebrand.
- Event: Long Weekend Band Crawl Vol. 17, August 2, 2026 (single day, ~4 weeks out).
- Venues: Blue Room (Inside Revive Karaoke), Princess Cafe, Prohibition Warehouse, Revive Karaoke, Room 47, Roost — all King St N, Waterloo.
- Lineup: 22 bands, doors 6:30 PM, show 6:45 PM, ages 19+.
- Priority balance: fan-facing experience and admin tooling are both critical.
- SEO: event pages, band pages, local discovery, and structured data matter.
- Media model: one photo per band via existing `photo_url` and R2 upload flow. No video embeds.
- Theme model: four user-selectable themes via Tailwind v4 CSS custom properties and `data-theme` on `<html>`, persisted in localStorage.

## Operating Rules

- Never merge with failed CI. Vera (code-reviewer) is the primary review gate; reply to and resolve review threads.
- Add or update tests for behavior changes where testable. Keep changes small and focused.
- Track remaining/deferred work as GitHub issues (`gh issue create`); reference from PRs (`Closes #N`).
- Avoid direct writes to localStorage schedule keys; use `frontend/src/utils/scheduleStorage.js` (YYYY-MM-DD lexicographic compare, never `new Date('YYYY-MM-DD')`).
- Preserve after-midnight sorting from `frontend/src/utils/bandUtils.js` (`AFTER_MIDNIGHT_THRESHOLD_HOUR = 6`, never remove/lower).
- Multi-day: single-day events stay byte-identical (NULL `performance_date`); never show a "Day 1" label on single-day events (gate on `isMultiDay`).

## Status Summary (2026-07-07)

**The platform is largely feature-complete for Vol. 17.** The June–July sprint (140+ commits) delivered nearly every P0/P1 across all tracks, plus surfaces the old roadmap never listed. The issue backlog is effectively clear; remaining work is polish, pre-event hardening, and forward-looking (multi-day Phase 2, future editions). See "Next Up" for the live backlog.

### Shipped since 2026-06-19 (highlights)

- **Public experience:** event lifecycle states (Upcoming/Live/Recap via `eventLifecycle.js` + `LiveContextBar`); live companion (`ComingUp`, `EventTimeline`, "Next Move"); My Route with walk-time + buffer itinerary; ForkCard conflict chooser; genre-led discovery wall; full crawl history on landing; PWA network-first + offline schedule.
- **New pages:** About, Contact, public Stats (privacy-safe aggregates), Event Recap, artist directory + search, venue directory + detail, Terms/Privacy (+ one-click PDF).
- **SEO:** SSR meta + JSON-LD on band/event/venue pages, site-wide Organization/WebSite JSON-LD, sitemap content pages, per-page meta/titles, Waterloo-consistent language.
- **Multi-day epic (Phase 1, #543):** per-set `performance_date`, day-aware grouping/conflicts, per-set-date APIs + `COALESCE(end_date,date)` windows, admin day selector, day-separated fan display. Invisible to single-day events.
- **Admin:** bulk import/delete, reveal-mode embargo, per-follower announcement tracking + resend, batch follow / "Lock in your lineup", digest emails, venueless-performance edit fix.
- **Themes:** light-theme WCAG-AA sweep across public surfaces; semantic tokens.
- **Perf/reliability/security:** lazy-loaded admin + non-primary routes, batched D1 reads, service-worker cache, schema-drift guard (generated `setup-complete.sql`), CSP/Turnstile hardening, rate-limit + body-size + social-link/ticket-url validation, observability for silent metrics/email failures.
- **Infra/docs:** MkDocs docs site at docs.settimes.ca; consolidated docs index; ICS feed correctness (America/Toronto).

## Track A: Vol. 17 Public Experience — largely delivered

Done: lifecycle states, mobile live schedule (Now Playing / Coming Up / My Next), My Route rename + walk-time itinerary, save/remove + overlap warnings (ForkCard), offline/PWA, venue-lane view, King St venue strip, post-event recap page.

Next:
- **Vol-17 day-of readiness pass** — end-to-end verify + harden the live experience for Aug 2 (lifecycle transitions at real times, live clock/timezone, offline resilience, mobile in a loud low-light venue). Highest pre-event value. *(#554)*
- Map-aware next-stop suggestions — deferred/optional: low ROI for a 6-venue single-street crawl already covered by `VenueStrip` + walk-times.

## Track B: Visual Identity And Themes — delivered

Done: four-palette `data-theme` foundation, FOUC script, dynamic `theme-color`, header toggle, light-theme WCAG-AA sweep across public surfaces, semantic tokens (admin dark-pinned by design).

Next: opportunistic contrast tuning as new surfaces land; keep the semantic-token discipline on every new public component.

## Track C: Band And Event SEO — P0 delivered

Done: SSR structured data + local signals on band/event/venue pages, site-wide Organization/WebSite JSON-LD, sitemap, per-page meta, Waterloo-consistent language.

Next:
- Stronger internal linking between bands, venues, events, and recaps, plus archive pages for recurring editions. *(#555)*

## Track D: Admin Tooling — core delivered

Done: bulk import/delete, per-band verified follower counts, per-follower announcement tracking + resend, reveal-mode embargo, RBAC on every mutating endpoint, roster sorting.

Next:
- Surface follower engagement where it helps announcement planning. *(#556)*
- Roster mobile-view polish; reveal-mode lineup management refinements.

## Track E: Performance And Reliability — delivered / continuous

Done: admin + route code-splitting, batched D1 reads, service-worker caching, schema-drift guard, observability for metrics/email failures, ZAP baseline documented.

Continuous: keep build warnings actionable and dependency alerts near zero (Dependabot); re-run ZAP after CSP/header changes.

## Track F: Multi-day / Multi-event Platform (new)

Phase 1 foundation delivered (#543 closed). Forward-looking:
- **Phase 2 polish (#542):** day tabs, `?day=N` deep-links, per-day SEO/ICS/hours.
- **#551:** day-scope bulk conflict detection.
- **#550 (deferred):** unify the 6 AM festival-day boundary into one util — only when a second consumer (server-side derivation for import/backfill) exists.

## Next Up (live backlog — see GitHub issues)

The tracker is the source of truth. As of 2026-07-07 the actionable queue is short and mostly forward-looking:

1. **#554** — Vol-17 day-of readiness / live-experience hardening (top pre-event value, p1).
2. **#555** — internal linking + recurring-event archive (Track C P1).
3. **#556** — follower-engagement surfacing for announcement planning (Track D).
4. Multi-day Phase 2 (#542), bulk conflict day-scoping (#551) — forward-looking.

Parked (do not resurface unprompted): #466 (Vol-17 venue data — organizer's task), #510 (multi-day scoping — superseded by delivered #543).

## Reference Docs

- `CLAUDE.md`: assistant context, invariants, stack, and safety rules.
- `docs/INDEX.md`: documentation index.
- `docs/DATABASE.md`: schema and database implementation notes.
- `docs/TESTING.md`: testing strategy and known test categories.
