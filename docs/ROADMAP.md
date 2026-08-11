# SetTimes.ca Roadmap

Canonical active roadmap for SetTimes.ca. Use this file for handoffs between Claude, OpenCode, and humans.

Last updated: 2026-08-11

## Mission

Build SetTimes.ca into the best multi-venue and multi-artist event platform for Waterloo Region. Next edition: Long Weekend Band Crawl Vol. 18 on October 11, 2026.

## Fixed Context

- Region: Waterloo Region only, with current focus on Kitchener-Waterloo. No non-Waterloo references in new code/docs.
- Brand: SetTimes.ca. Do not rebrand.
- Next event: Long Weekend Band Crawl Vol. 18, October 11, 2026 (event 37, `lwbc18`, single day). Currently `status = 'draft'` with an empty lineup.
- Shipped editions (both archived): Vol. 17 (event 21, 2026-08-02, 22 bands / 6 venues) and Buddies Fest 2 (event 36, 2026-08-07→09, Tillsonburg — the first multi-day production event). Lineups and venue rosters are live D1 data now, not spec.
- Venues used by Vol. 17: Blue Room (inside Revive Karaoke), Princess Cafe, Prohibition Warehouse, Revive Karaoke, Room 47, Roost — all King St N, Waterloo.
- Priority balance: fan-facing experience and admin tooling are both critical.
- SEO: event pages, band pages, local discovery, and structured data matter.
- Media model: one photo per band via existing `photo_url` and R2 upload flow. No video embeds.
- Theme model: four user-selectable themes via Tailwind v4 CSS custom properties and `data-theme` on `<html>`, persisted in localStorage.

## Operating Rules

- Never merge with failed CI. CodeRabbit (`make review`) is the standing pre-PR review gate; the `code-reviewer` agent is trigger-only (documented invariants, migrations, architectural decisions). Reply to *and resolve* review threads — a reply alone does not clear the merge block.
- Add or update tests for behavior changes where testable. Keep changes small and focused.
- Track remaining/deferred work as GitHub issues (`gh issue create`); reference from PRs (`Closes #N`).
- Avoid direct writes to localStorage schedule keys; use `frontend/src/utils/scheduleStorage.js` (YYYY-MM-DD lexicographic compare, never `new Date('YYYY-MM-DD')`).
- Preserve after-midnight sorting from `frontend/src/utils/bandUtils.js` (`AFTER_MIDNIGHT_THRESHOLD_HOUR = 6`, never remove/lower).
- Multi-day: single-day events stay byte-identical (NULL `performance_date`); never show a "Day 1" label on single-day events (gate on `isMultiDay`).

## Status Summary (2026-08-11)

**Two editions have now shipped on this platform and the season is over.** Vol. 17 ran 2026-08-02 and Buddies Fest 2 ran 2026-08-07→09 — the latter proving the multi-day epic (#543) in production. Both are archived. Vol. 18 is drafted for 2026-10-11 and not yet published.

**The site is between seasons, which is a supported state.** Every "upcoming" surface is legitimately empty until Vol. 18 is published: `/api/events/public` defaults to `upcoming=true`, and the iCal feed only emits future events, so both correctly return zero while `/api/stats/public` and the sitemap stay fully populated from the archive. `EventTimeline` has a dedicated between-seasons state and auto-expands Past for this window. Check whether anything is `published` before treating such a zero as a bug.

**Postmortem worth carrying forward (2026-08-10, #800):** archiving BF2 took the public site dark. `events.is_published` was deprecated by migration 0005 but never dropped, and `archive.js` zeroes it alongside setting `status='archived'` — so when the last un-archived event was closed out, 13 public read paths gated on the dead column all returned zero rows at once. Every public read is now behind `functions/utils/eventVisibility.js`, with source-scanning guard tests on both sides of the build boundary. The column drop itself is #799.

The pre-event backlog is closed out; remaining work is correctness debt and Vol.-18 prep. See "Next Up".

### Shipped since 2026-06-19 (highlights)

- **Public experience:** event lifecycle states (Upcoming/Live/Recap via `eventLifecycle.js` + `LiveContextBar`); live companion (`ComingUp`, `EventTimeline`, "Next Move"); My Route with walk-time + buffer itinerary; ForkCard conflict chooser; genre-led discovery wall; full crawl history on landing; PWA network-first + offline schedule.
- **New pages:** About, Contact, public Stats (privacy-safe aggregates), Event Recap, artist directory + search, venue directory + detail, Terms/Privacy (+ one-click PDF).
- **SEO:** SSR meta + JSON-LD on band/event/venue pages, site-wide Organization/WebSite JSON-LD, sitemap content pages, per-page meta/titles, Waterloo-consistent language.
- **Multi-day epic (Phase 1, #543):** per-set `performance_date`, day-aware grouping/conflicts, per-set-date APIs + `COALESCE(end_date,date)` windows, admin day selector, day-separated fan display. Invisible to single-day events.
- **Admin:** bulk import/delete, reveal-mode embargo, per-follower announcement tracking + resend, batch follow / "Lock in your lineup", digest emails, venueless-performance edit fix.
- **Themes:** light-theme WCAG-AA sweep across public surfaces; semantic tokens.
- **Perf/reliability/security:** lazy-loaded admin + non-primary routes, batched D1 reads, service-worker cache, schema-drift guard (generated `setup-complete.sql`), CSP/Turnstile hardening, rate-limit + body-size + social-link/ticket-url validation, observability for silent metrics/email failures.
- **Infra/docs:** MkDocs docs site at docs.settimes.ca; consolidated docs index; ICS feed correctness (America/Toronto).

## Track A: Public Experience — delivered, proven in production

Done: lifecycle states, mobile live schedule (Now Playing / Coming Up / My Next), My Route rename + walk-time itinerary, save/remove + overlap warnings (ForkCard), offline/PWA, venue-lane view, King St venue strip, post-event recap page, day-of readiness pass (#554). All of it ran live through Vol. 17 and Buddies Fest 2.

Next:
- Between-season surfaces: the homepage now has a dedicated between-seasons state and auto-expands Past (#800). Keep this working — it is the state the site sits in for most of the year.
- Map-aware next-stop suggestions — deferred/optional: low ROI for a 6-venue single-street crawl already covered by `VenueStrip` + walk-times.

## Track B: Visual Identity And Themes — delivered

Done: four-palette `data-theme` foundation, FOUC script, dynamic `theme-color`, header toggle, light-theme WCAG-AA sweep across public surfaces, semantic tokens (admin dark-pinned by design).

Next: opportunistic contrast tuning as new surfaces land; keep the semantic-token discipline on every new public component.

## Track C: Band And Event SEO — P0 delivered

Done: SSR structured data + local signals on band/event/venue pages, site-wide Organization/WebSite JSON-LD, sitemap, per-page meta, Waterloo-consistent language.

Also delivered since: internal linking + recurring-edition archive (#555), and SSR as the single owner of identity meta and JSON-LD on `/band/*` and `/venue/*` (#784, #790, #798).

Next:
- **#787** — recap gating disagreement, now capable of producing indexable soft-404s. Highest-value SEO item and time-boxed to before 2026-10-11.
- The sitemap gained ~268 URLs on 2026-08-11 when #800 restored archived editions to it (8 → 276, including 218 artist and 12 venue pages that had effectively never been submitted). Resubmit in Search Console and watch indexing.

## Track D: Admin Tooling — core delivered

Done: bulk import/delete, per-band verified follower counts, per-follower announcement tracking + resend, reveal-mode embargo, RBAC on every mutating endpoint, roster sorting.

Also delivered since: follower-engagement surfacing (#556), the reversible cancel toggle for pulling a set from a live lineup (#732 — never un-announce, never delete the row), and the `bandFields.js` link registry driving both the Links column and the gap filter (#712).

Next:
- Roster mobile-view polish; reveal-mode lineup management refinements.
- Vol.-18 lineup entry once acts are booked.

## Track E: Performance And Reliability — delivered / continuous

Done: admin + route code-splitting, batched D1 reads, service-worker caching, schema-drift guard, observability for metrics/email failures, ZAP baseline documented.

Continuous: keep build warnings actionable and dependency alerts near zero (Dependabot); re-run ZAP after CSP/header changes.

## Track F: Multi-day / Multi-event Platform (new)

Delivered and now proven in production: Phase 1 foundation (#543), Phase 2 polish (#542), day-scoped bulk conflict detection (#551), and the unified 6 AM festival-day boundary (#550). Buddies Fest 2 (2026-08-07→09) was the first multi-day event to run on it.

Next:
- **#746** — two files still re-encode the 6 AM threshold privately (`api/events/timeline.js` as `"06:00"`, `event/[slug].js` as `6`) instead of importing a canonical home. There are deliberately two homes, one per side of the build boundary (`frontend/src/utils/festivalDays.js`, `functions/utils/eventDay.js`); do not add a third.

## Next Up (live backlog — see GitHub issues)

The tracker is the source of truth. Every item from the previous (2026-07-07) list has since closed — #554, #555, #556, #542, #551, #550, #466, #510. The current queue is correctness debt plus Vol.-18 prep:

1. **#787** — recap publish gating disagrees across sitemap, SSR, and the JSON API. **#800 armed this rather than closing it:** the sitemap now emits a recap URL per past event while the data API still requires `archived`, so a published-but-not-yet-archived past event becomes an indexable soft-404. Dormant today (all past events are archived); **fires when Vol. 18 concludes — must land before 2026-10-11.**
2. **#799** — drop the dead `events.is_published` column and its two indexes, and stop the admin writes #800 deliberately kept for rollback safety.
3. **#746** — the 6 AM after-midnight threshold is still re-encoded privately in `api/events/timeline.js` and `event/[slug].js` instead of importing a canonical home.
4. **#766** — `functions/api/test-utils.js` hand-maintains a third, ungated copy of the schema.
5. **#797** — drop the ignored `<meta name="keywords">` from `BandProfilePage`.
6. **Vol. 18 prep** — publish event 37, then book and announce the lineup. Publishing is what re-populates every "upcoming" surface.

Parked (do not resurface unprompted): band photo drives (explicitly deprioritized).

## Reference Docs

- `CLAUDE.md`: assistant context, invariants, stack, and safety rules.
- `docs/INDEX.md`: documentation index.
- `docs/DATABASE.md`: schema and database implementation notes.
- `docs/TESTING.md`: testing strategy and known test categories.
