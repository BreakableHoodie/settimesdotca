# SetTimes.ca Roadmap

Canonical active roadmap for SetTimes.ca. Use this file for handoffs between Claude, OpenCode, and humans.

Last updated: 2026-08-11

## Mission

Build SetTimes.ca into the best multi-venue and multi-artist event platform for Waterloo Region. Next edition: Long Weekend Band Crawl Vol. 18 on October 11, 2026.

## Fixed Context

- Region: Waterloo Region, currently focused on Kitchener-Waterloo. This governs **product language** — marketing copy, meta descriptions, SEO targeting, statements about who the site is for. It does not override fact: the platform has hosted an event outside the region (Buddies Fest 2, Tillsonburg, 2026-08-07→09) and that record stays accurate wherever it appears.
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

**Postmortem worth carrying forward (2026-08-10, #800):** archiving BF2 took the public site dark. `events.is_published` was deprecated by migration 0005 but never dropped, and `archive.js` zeroed it alongside setting `status='archived'` — so when the last un-archived event was closed out, 13 public read paths gated on the dead column all returned zero rows at once. Every **public event-visibility query** now goes through `functions/utils/eventVisibility.js`. Two source-scanning guards enforce it: no `is_published` read or write anywhere outside `__tests__/**` and `utils/eventVisibility.js` itself (both sides of the build boundary — the admin exemptions came out with #799 part 1, and the shared-test-schema exemption came out with #799 part 2 once migration 0059 dropped the column, which is what proves the retirement complete), and no non-admin file querying `events` without importing the shared visibility helper (the scan matches the helper *names* — `…EventStatusSql`, `concludedEventSql` — so a hand-written inline `status` predicate does not satisfy it; one canonical home is the point). Two files are exempt by design and named in that guard — `api/metrics.js` (a write-path existence check projecting only `id`) and `utils/timeConflicts.js` (imported solely by admin, which must see drafts). The column and its two indexes are dropped as of migration 0059 (#799 part 2); both guards stay in the suite permanently as regression protection, not merely historical record.

The review of that work turned up one route the original sweep missed: `functions/s/[slug].js`, the OG card social crawlers fetch for a shared schedule link, joined `events` ungated while both of its siblings for the same slug gated correctly — so an event unpublished *after* a link was shared still produced a crawler-facing card naming it and its bands. Fixed, and the hand sweep that found it is now the second guard above.

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

Also delivered since the last revision: internal linking + recurring-edition archive (#555), SSR as the single owner of identity meta and JSON-LD on `/band/*` and `/venue/*` (#784, #790, #798), and the recap-gating fix (#787, via #802) that removed the indexable-soft-404 risk before Vol. 18 concludes.

Next:
- **Watch indexing.** The sitemap gained ~268 URLs on 2026-08-11 when #800 restored archived editions to it (8 → 276, including 218 artist pages and 12 venue pages that had effectively never been submitted). Resubmitted to Search Console 2026-08-11 21:35 — 0 errors, 0 warnings. **Google's last fetch before that was 2026-08-10 08:42, i.e. the pre-#800 sitemap: 45 URLs, 0 indexed.** Re-check the indexed count once Google re-crawls; if it is still 0 against 276 submitted, that is a real signal rather than reporting lag.

Issue-tracked SEO work lives in the **Next Up** queue below, not here — one status per issue, in one place.

## Track D: Admin Tooling — core delivered

Done: bulk import/delete, per-band verified follower counts, per-follower announcement tracking + resend, reveal-mode embargo, RBAC on every mutating endpoint, roster sorting.

Also delivered since the last revision: follower-engagement surfacing (#556), the reversible cancel toggle for pulling a set from a live lineup (#732 — never un-announce, never delete the row), and the `bandFields.js` link registry driving both the Links column and the gap filter (#712).

Next:
- Roster mobile-view polish; reveal-mode lineup management refinements.
- Vol.-18 lineup entry once acts are booked.

## Track E: Performance And Reliability — delivered / continuous

Done: admin + route code-splitting, batched D1 reads, service-worker caching, schema-drift guard, observability for metrics/email failures, ZAP baseline documented.

Continuous: keep build warnings actionable and dependency alerts near zero (Dependabot); re-run ZAP after CSP/header changes.

## Track F: Multi-day / Multi-event Platform (new)

Delivered and now proven in production: Phase 1 foundation (#543), Phase 2 polish (#542), day-scoped bulk conflict detection (#551), and the unified 6 AM festival-day boundary (#550). Buddies Fest 2 (2026-08-07→09) was the first multi-day event to run on it.

Also delivered since the last revision: retiring the two private re-encodings of the 6 AM threshold (#746) — `api/events/timeline.js` and `event/[slug].js` both now import from the canonical server-side home (`functions/utils/eventDay.js`, which exports both the numeric hour and a derived `"HH:MM"` string) instead of typing the literal locally. A source-scanning guard (`functions/utils/__tests__/afterMidnightThreshold.test.js`) keeps a third private copy from creeping back in.

Next: none currently open in this track. There remain deliberately two canonical homes, one per side of the build boundary (`frontend/src/utils/festivalDays.js`, `functions/utils/eventDay.js`); do not add a third.

## Next Up (live backlog — see GitHub issues)

The tracker is the source of truth. Every item from the previous (2026-07-07) list has since closed — #554, #555, #556, #542, #551, #550, #466, #510. The current queue is correctness debt plus Vol.-18 prep:

1. **#766** — `functions/api/test-utils.js` hand-maintains a third, ungated copy of the schema.
2. **#797** — drop the ignored `<meta name="keywords">` from `BandProfilePage`.
3. **Vol. 18 prep** — publish event 37, then book and announce the lineup. Publishing is what re-populates every "upcoming" surface.

Closed since the last revision: **#787** (recap gating, fixed by #802 — the sitemap, SSR and the JSON API now share one `concludedEventSql()` definition of "concluded", so a published-but-unarchived past event is no longer an indexable soft-404 when Vol. 18 ends); **#799** (dead `events.is_published` column retired — part 1 stopped every read/write, part 2 dropped the column and its two indexes via migration 0059, replacing them with `idx_events_status_date` on `(status, date)`); **#746** (the two private re-encodings of the 6 AM after-midnight threshold now import from the canonical server-side home instead).

Parked (do not resurface unprompted): band photo drives (explicitly deprioritized).

## Reference Docs

- `CLAUDE.md`: assistant context, invariants, stack, and safety rules.
- `docs/INDEX.md`: documentation index.
- `docs/DATABASE.md`: schema and database implementation notes.
- `docs/TESTING.md`: testing strategy and known test categories.
