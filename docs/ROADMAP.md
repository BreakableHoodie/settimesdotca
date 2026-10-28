# SetTimes.ca Roadmap

Canonical active roadmap for SetTimes.ca. Use this file for handoffs between Claude, OpenCode, and humans.

Last updated: 2026-10-28

## Mission

Build SetTimes.ca into the best lean, multi-venue and multi-artist event platform for Waterloo Region. Fan-facing and admin tooling are equal priorities. The next edition is expected in February 2027; no edition is published now.

## Current State

- Long Weekend Band Crawl Vol. 18 (event 37, `lwbc18`, 2026-10-11) ran and was archived on 2026-10-13.
- Vol. 17 and Buddies Fest 2 are archived editions with live historical data.
- The site is between seasons: event-driven surfaces have 0 upcoming events and a first page of 10 past events (the timeline default; 20 archived editions in total); the iCal feed has 0 `VEVENT`s because it joins performances.
- When the next edition is published before its lineup is announced, the same iCal zero means "published event, lineup not announced". Always check event status and performance rows separately.
- Archived events remain visible on browse and history surfaces. Public visibility is governed by `status`, not a retired publication column.

## Operating Rules

- Never merge with failed CI. `make review` is the standing pre-PR review gate.
- Track remaining work in GitHub issues and reference issues from pull requests.
- Preserve the after-midnight rule: sets starting before 06:00 belong to the previous evening.
- The two canonical threshold homes are `frontend/src/utils/festivalDays.js` and `functions/utils/eventDay.js`; do not add a third.
- Use `docs/index.md` as the documentation index. There is no `docs/INDEX.md`.

## Delivered Foundations

- Public event lifecycle, archive history, live schedule, My Route, offline/PWA behavior, and venue-aware navigation.
- SSR identity metadata and JSON-LD for band, event, and venue pages, plus sitemap and internal-link coverage.
- Admin bulk operations, reveal mode, per-follower announcement tracking and resend, batch follows, digest email, and reversible per-set cancellation.
- Four theme palettes with semantic tokens and a light-theme accessibility sweep.
- Multi-day event dates, day-aware schedule conflict checks, and the unified six-o'clock festival-day boundary.
- CI schema migration and verification, D1 batch atomicity tests, mutation gate, coverage floor, security scanning, and edge E2E authentication coverage.

## Open Work

### Privacy and security (from the 2026-10-28 report card)

- #1414 — the share-link visitor code is an unsalted hash of IP + user agent
- #1415 — CASL sender footer, a dead `sessions` table holding IPs, the last plaintext email tokens
- #1413 — workers-mcp 0.0.13 is abandoned and fronts production D1

### Performance and metrics

- #1246 — question-driven metrics plan
- #1411 — the metrics beacon awaits six sequential D1 writes; the artist batch is not isolated
- #1412 — the home timeline re-downloads every past edition every 60 s between seasons

### CI and tests

- #1410 — Dependabot merges skip the edge suite; it is not required; iCal rendering is not exercised on the edge
- #1416 — a frontend mutation gate
- #1395 — ci(e2e): remove the hosted-runner apt path once the Playwright image has been stable
- #1409 — ci(edge-e2e): pages stuck on the "Loading..." shell on the preview (one occurrence)

### Code health

- #1417 — the event wizard's private conflict checker and UTC date cutoff

## Reference Docs

- `CLAUDE.md`: assistant context, invariants, stack, and safety rules.
- `docs/index.md`: published documentation index.
- `docs/DATABASE.md`: schema and database implementation notes.
- `docs/TESTING.md`: testing strategy and gate commands.
- `docs/SHOW_DAY_RUNBOOK.md`: operator procedure for live show changes.
