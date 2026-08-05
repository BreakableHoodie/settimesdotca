# CLAUDE.md — settimesdotca

AI assistant context for this codebase. Captures non-obvious invariants, known gotchas, and conventions that aren't derivable from reading the code.

---

## Proactive Quality Gates

Invoke these without being asked — don't wait for the user to request them:

| Trigger | Action |
|---------|--------|
| **Before opening any PR** | `make review` (CodeRabbit) — the standing review gate |
| Multi-file feature touching a documented invariant, a migration, or an architectural decision | Invoke `pr-review-toolkit:code-reviewer` agent **in addition** to CodeRabbit |
| **Any bug you diagnose** | Sweep for other instances of the same class before calling it fixed — see "Sweep for siblings" below |
| After editing `functions/utils/auth.js`, session endpoints (`sessions/`), or follow/unfollow/confirm-follow flows | Invoke `cloudflare-security-reviewer` agent |
| After writing or modifying error handling (`catch` blocks, `.catch()`, `try/finally`) in `functions/` | Invoke `pr-review-toolkit:silent-failure-hunter` agent |
| After editing `frontend/src/` public pages (outside `admin/`) | Scan for `text-white`/`bg-white` theme violations before finishing |
| After adding/editing anything in `migrations/` | Run `node scripts/regenerate-setup-complete.mjs` then `node scripts/check-schema-drift.mjs` — `setup-complete.sql`'s schema section is generated, never hand-edit it (CI enforces via quality.yml) |
| When SEO-relevant pages change (band pages, event pages, venue pages) | Check structured data and `document.title` assignments |

The `hooks` in `.claude/settings.local.json` automate the mechanical parts (prettier, ESLint, pre-PR gate). The triggers above require judgment — apply them proactively.

**CodeRabbit is the standing gate; the code-reviewer agent is trigger-only.** CodeRabbit is diff-scoped and reliably catches convention breaks, unscoped test selectors, dead code, and latent time-bombs — and it runs on the PR regardless, so `make review` beforehand only saves a force-push cycle. The code-reviewer agent reads across files and earns its cost when the question is "does this violate an invariant or drift from the architecture." Don't block on Copilot; in practice it duplicates CodeRabbit.

### Sweep for siblings

**When you diagnose a bug, find every other instance of that class before declaring it fixed** — and report the sweep, whether or not it found anything. No line-level reviewer does this; it sees only the diff in front of it.

The worked example is `performance_date` (#739 → #741 → #743). One endpoint dropped the field from its projection, so a multi-day event's sets all rendered with the event's start date. Fixing that one endpoint felt complete. It wasn't: the same defect was live on the venue page, on GenreDiscovery, and in the event recap's sort. Three more surfaces, found only because the class was swept afterwards — and one of them had already been stumbled on by hand.

The mechanical form is usually one grep. "Which files select `p.start_time` but never mention `performance_date`?" turns a vague worry into a table.

Prefer a durable guard over a repeat audit: a source-scanning test (as `bandFields.test.js` does for Tailwind class literals) collapses a whole bug class into one failing test.

---

## Agent Delegation Workflow (standing default)

**Delegate by default — do not do everything inline.** This is a permanent preference and overrides any base "don't spawn agents unless asked" default.

- **Opus / Fable ("big brain")** → engineering design, architecture, planning, and code/security review.
- **Sonnet** → implementation / mechanical coding (well-specified edits, test writing).
- **Orchestrator (Opus) still verifies:** read the diffs, run tests/lint/build, and run the security/code-review gates above before declaring anything done. Delegation never removes the verification step.

When a task has a clear implementation spec, dispatch a Sonnet agent to build it; reserve Opus/Fable for the design up front and the review after. Always follow a Sonnet implementation with a big-brain review pass — that second perspective catches whole bug classes a to-spec implementer stops short of.

---

## Mission & Scope

settimes.ca is evolving into the best multi-venue/multi-artist event platform for **Waterloo Region** (Kitchener-Waterloo, ON), starting with **Long Weekend Band Crawl Vol. 17** on **August 2, 2026**.

- **Focus:** Waterloo Region only (not Ottawa — do not reference Ottawa in new code/docs)
- **Brand:** settimes.ca — no rebranding
- **Target event:** Vol. 17, August 2, 2026. Urgency applies to all work.
- **Venues (6, King St N, Waterloo):** Blue Room, Princess Cafe, Prohibition Warehouse, Revive Karaoke, Room 47, Roost
- **Bands:** 22, doors 6:30PM / show 6:45PM, ages 19+
- **Both fan-facing and admin tooling are equal priority**
- **SEO is a priority** (band pages, event pages, local discovery, structured data)
- **Colour themes:** 4 user-selectable (dark + light presets) via Tailwind v4 CSS custom properties + `data-theme` on `<html>`, persisted in localStorage
- **Single photo per band** — extends existing `photo_url` / R2 upload flow; no video embeds
- **Design:** Fresh visual identity for Vol. 17 using Tailwind v4 `@theme`

Canonical active roadmap: `docs/ROADMAP.md`. Use it for handoffs between Claude, OpenCode, and humans.

**Track remaining/deferred work as GitHub issues** (`gh issue create`) — not just chat threads or ad-hoc lists — so nothing is lost across sessions and contributors. Reference issues from PRs (`Closes #N`).

---

## Stack

- **Frontend**: React 19, Vite 8, Tailwind 4, React Router 7 (`frontend/`)
- **Backend**: Cloudflare Pages Functions (edge serverless, `functions/`)
- **Database**: Cloudflare D1 (SQLite-compatible), numbered migrations in `migrations/`
- **Auth**: Direct D1 session manager (`functions/utils/auth.js`), CSRF double-submit, TOTP MFA, trusted devices, RBAC
- **Storage**: Cloudflare R2 (band photos)
- **Email**: Postmark/Resend/MailChannels
- **Tests**: Vitest (unit, frontend), Playwright (E2E + a11y + visual regression)
- **CI/CD**: GitHub Actions (12 workflows), CodeQL, Dependabot

---

## Critical Invariants

### After-midnight band sorting — recurring bug class

Bands starting before 6 AM are "after-midnight" sets that belong to the *previous evening*. They must be offset by +1 day so they sort after the evening lineup, not at the top of the schedule.

- Threshold: `AFTER_MIDNIGHT_THRESHOLD_HOUR = 6`. There are **two** canonical homes, one per side of the build boundary — Pages Functions cannot import from `frontend/`, so a single definition is impossible:
  - **Frontend:** `frontend/src/utils/festivalDays.js` (#550). `frontend/src/utils/bandUtils.js` and `frontend/src/admin/utils/timeUtils.js` (`AFTER_MIDNIGHT_THRESHOLD_MINUTES = AFTER_MIDNIGHT_THRESHOLD_HOUR * 60`) both import it rather than re-encoding `6`.
  - **Server:** `functions/utils/eventDay.js`, which also exports `eventLocalFestivalToday()` — the festival-day equivalent of `eventLocalToday()`, stepping back one calendar day when the Toronto-local hour is below the threshold. Use it for any "which festival day is it?" question server-side; a plain calendar-day comparison flips at midnight while the festival day is still running (bug class fixed in #751).
- **Two homes, not more.** `functions/api/events/timeline.js` and `functions/event/[slug].js` still re-encode the threshold privately (as `"06:00"` and `6` respectively) instead of importing it — tracked in #746. Do not add a third; import from the appropriate canonical home.
- Logic: `prepareBands()` adds `MS_PER_DAY` to `startMs`/`endMs` for times below this threshold
- **Never remove or lower this threshold.** Any sort, filter, or conflict-detection that touches performance times must apply the same offset or delegate to `prepareBands`.

### Server-side "today"/"now" is Toronto-local — never UTC-sliced

Server-side event-day classification (timeline now/upcoming/past, any "is it today?" check) must use `eventLocalToday()` / `eventLocalClock()` from `functions/utils/eventDay.js` — never `new Date().toISOString().slice(0, 10)`, which flips to tomorrow at 8 PM Eastern and marked events "Happening Now" the evening before (bug class fixed in PR #568).

### `events.doors_json` + the "started" start edge (#569)

`events.doors_json` (TEXT, nullable) is a JSON map of festival date → 24h time, e.g. `{"2026-07-10":"16:00","2026-07-11":"10:00"}`. Absent/malformed = no doors info. On an event's **first day only**, the "started" edge (timeline "Happening Now", fan "Live Tonight") is, in precedence order: **doors time → first set start → local midnight**; the earliest available signal wins, so an already-playing set is never "upcoming". Day 2+ of a multi-day event is never re-gated, and sets before 6 AM never define the day-1 edge (after-midnight convention above). Validation is `validateDoorsJson()` in `functions/utils/validation.js` (keys within `[date, end_date]`, values `HH:MM`); event duplication deliberately drops `doors_json` (stale date keys).

### SQLite datetime format — do NOT use ISO 8601 T-separator

D1's `datetime('now')` returns `YYYY-MM-DD HH:MM:SS` (space separator).  
JavaScript's `toISOString()` returns `YYYY-MM-DDTHH:MM:SS.mmmZ` (T separator).

When a stored `expires_at` has a `T`, comparisons like `expires_at > datetime('now')` silently fail — the string comparison returns a wrong result. This caused a production invite-code expiry bypass (SEC-F1).

**Always normalize before storing:**
```js
new Date(Date.now() + ...).toISOString().replace("T", " ").slice(0, 19)
```

Helper: `toSqliteDateTime()` in `functions/utils/authAttempts.js`.

### `lucia_sessions.expires_at` is INTEGER (Unix epoch), not TEXT

Every other `expires_at` column in the schema is `TEXT` (ISO-8601 / space-separated). `lucia_sessions` uses `INTEGER` (Unix seconds). Do not compare it with `datetime('now')`.

- **JS (check if expired):** `row.expires_at * 1000 < Date.now()`
- **SQL (select active sessions):** `WHERE expires_at > unixepoch()`

### PBKDF2, not bcrypt

Password hashing uses PBKDF2-SHA256 via the Web Crypto API (`functions/utils/crypto.js`). Current format is `pbkdf2$iterations$salt$hash` and is self-describing — `verifyPassword` reads the iteration count from the string itself, so hashes created before the default was bumped from 100,000 to 600,000 (`DEFAULT_ITERATIONS`) still verify unchanged. A second, older `salt:hash` format (no `pbkdf2$` prefix, predating the versioned format entirely) carries no iteration count at all; it's verified against the hardcoded `LEGACY_ITERATIONS` (100,000) fallback instead.

bcrypt requires a native binary (`better-sqlite3` style) that cannot run on Cloudflare Workers. Do not introduce bcrypt anywhere in `functions/`.

MFA TOTP follows the same rule: `functions/utils/totp.js` computes HMAC-SHA1 directly via `crypto.subtle` (hand-rolled RFC 4226/6238, pinned by the RFC 6238 Appendix B test vectors). Do **not** reintroduce `otplib` or any pure-JS crypto (`@noble`) for MFA — keep the security primitive on the platform's native Web Crypto.

### D1 transactions: no BEGIN/COMMIT, but `DB.batch()` is atomic

The Cloudflare Workers D1 binding does not support explicit `BEGIN`/`COMMIT` transaction syntax. However, `env.DB.batch([stmt1, stmt2, ...])` executes all statements atomically — if any fails, all are rolled back. Prefer `DB.batch()` for multi-statement mutations.

For mutations that cannot be expressed as a single batch (e.g., the event-duplication pattern in `functions/api/admin/events/[id].js`), use compensating deletes: if step N fails, manually undo steps 1…N-1.

The bulk band import (`functions/api/admin/bands/import.js`) follows this pattern and is **all-or-nothing**: it validates every row first (an invalid row aborts the whole import with per-row errors, writing nothing), then find-or-creates profiles and inserts performances, rolling back everything it created if any write fails. A lineup is never left half-imported.

`functions/api/admin/bands/bulk.js` is the larger sibling (599 lines vs. `import.js`'s 174): it handles bulk `DELETE`/`POST`/`PATCH` across bands, following the same `DB.batch()`/compensating-delete discipline.

### PRAGMA `foreign_keys = ON` is enforced in production

`functions/_middleware.js` runs `PRAGMA foreign_keys = ON` before the request handler fires for every **mutating** request. Read-only methods (`GET`/`HEAD`) skip it — they can't violate FK constraints, and skipping saves a D1 round-trip on hot read paths. The guard is a strict read-only allowlist, so any other method (including unknown ones) still gets FK enforcement; never widen it to skip writes. Unit test helpers (`functions/api/test-utils.js`) set the PRAGMA unconditionally via `better-sqlite3`, so FK constraints are always active under test.

When recreating a table in a migration (SQLite has no ALTER COLUMN), surround the table-recreation block with `PRAGMA foreign_keys = OFF` / `PRAGMA foreign_keys = ON` as migration 0032 does — D1 will reject the DROP otherwise.

### Artist link presence: `bandFields.js` is the single source of truth (#712)

`frontend/src/admin/utils/bandFields.js` defines every filterable artist field — the eight link fields (`LINK_FIELDS`, in Links-column render order) and the profile fields (`PROFILE_FIELDS`) — pairing each with its label, icon, Tailwind colours, and **its own URL-safety resolver**.

**A link is "present" only if it resolves to a real href** — `resolveHref(value) !== '#'` — never `value !== ''`. `safeSocialProfileHref` rejects any handle containing whitespace or a colon (the necessary condition for `javascript:`, `data:`, and every other scheme), so a value can be non-empty in D1 and still render nothing. Anything asking "does this artist have Instagram?" must go through `hasField()` / `hasAnyLink()` / `countLinks()` — never inspect `social_links` directly.

Both the Links column (`admin/components/SocialLinksIcons.jsx`) and the gap filter (`admin/components/DataGapFilter.jsx` + `RosterTab`) map over this one registry. **Do not reintroduce a second list of link fields.** The bug class it prevents: a filter reporting that an artist "has Instagram" while the row shows nothing, so they get skipped in exactly the data-entry pass meant to catch them. Adding a ninth platform is one registry entry that updates the column and the filter together.

`formatOrigin()` lives here too, shared by the Origin column, the origin sort, the search predicate, and the origin gap check.

**Tailwind colours in the registry must stay complete literal strings** (e.g. `'hover:text-pink-400 focus-visible:outline-pink-400'`). Tailwind v4 scans source *text* for whole class names and never evaluates template expressions, so `` `hover:text-${colour}` `` generates no CSS and silently drops every hover and focus style. A runtime assertion cannot catch this — the guard in `bandFields.test.js` is a `readFileSync` scan of the source.

### `ALLOW_ADMIN_SIGNUP` is test-only

This env var bypasses the invite-code requirement for signup. It must never be set in production. It appears only in test helpers and E2E seed scripts.

---

## React 19 Known Issues

### `react-helmet-async` `<Helmet>` does not reliably set `document.title` in React 19

Use `document.title = pageTitle` directly in a `useEffect` within the page component. Do NOT remove the direct assignment in favour of `<Helmet>` until react-helmet-async ships a React 19 compatible release.

Example: `frontend/src/pages/BandProfilePage.jsx` — uses both `<Helmet>` (for other meta) and `document.title = ...` for the title.

---

## Theming

Four user-selectable colour themes, set as `data-theme` on `<html>` by `frontend/src/components/ThemeProvider.jsx` and persisted in localStorage: `midnight-ember` (warm dark, default), `arctic-night` (cool dark), `daybreak` (warm light), `silver-lining` (cool light). All theme colours are CSS custom properties defined per `[data-theme]` block in `frontend/src/index.css`, exposed as Tailwind v4 utilities via `@theme`.

**On public / theme-following surfaces, use semantic tokens — never hardcoded white.** This is the recurring bug class (white text/surfaces invisible on the light themes):

- **Text:** `text-text-primary` / `-secondary` / `-tertiary` / `-disabled`. When converting opacity'd whites, map by weight: `text-white/90–70` → `secondary`, `/60–40` → `tertiary`, `/30–20` → `disabled`.
- **Surfaces / borders:** `bg-surface` (faint card/input fill), `bg-surface-hover` (hover state), `border-border` / `ring-border` (subtle edges/dividers). Never `bg-white/N` or `border-white/N`.
- **Status colours:** `success` / `warning` / `error` / `info` (e.g. `bg-warning-500/20 border-warning-500/50`) with `text-text-primary` for the label so it reads on both light and dark.

**Light-theme token values are WCAG-AA tuned** (accent ramp, `text-tertiary`, etc. clear 4.5:1 on the darker `bg-purple` surface). If you change a light-theme colour, verify contrast — don't just pick a lighter shade.

**Keep `text-white` only where it is theme-independent:** on a fixed colour (coloured/gradient buttons, brand/social buttons) or over a dark photo scrim.

**Admin is dark-pinned:** `frontend/src/admin/AdminApp.jsx` wraps the admin surface in `<div data-theme="midnight-ember">`, so hardcoded `text-white` inside `frontend/src/admin/` is correct and intentional — do not migrate it.

---

## Schedule Storage (localStorage)

Band selections are stored under the `selectedBandsByEvent` key as `{ [eventSlug]: [bandId, ...], __dates__: { [eventSlug]: "YYYY-MM-DD" } }`.

The `__dates__` namespace is used for stale detection. **Always use YYYY-MM-DD lexicographic string comparison** — do NOT use `new Date('YYYY-MM-DD')` which parses as UTC midnight and causes events to appear stale on their own day in UTC-negative timezones.

**`saveSelectedBands`'s date argument must be the event's `end_date || date`, never the start date alone.** Stale detection compares the stored date against today, so passing a multi-day event's START date marks the fan's saved schedule stale on day 2 — silently wiping their selections mid-festival (#542 PR-1). Single-day events have a NULL `end_date`, so the `||` fallback keeps them identical.

All interactions go through `frontend/src/utils/scheduleStorage.js`. Do not write to `selectedBandsByEvent` directly.

---

## Metrics & Analytics

Metrics write to D1 daily-aggregate tables (`page_views_daily`, `artist_daily_stats`) via `POST /api/metrics`, plus an optional Cloudflare Analytics Engine sink (`env.ANALYTICS`, configured in `wrangler.toml`). Ingestion is best-effort and fire-and-forget; failures must not surface to users.

**Share metrics come from `share_links`, not telemetry.** A share *create* is a `share_links` row; a *view* increments `share_links.view_count` (best-effort, in the `GET /api/schedule/share/[slug]` handler). The admin event metrics endpoint reads these directly. Do **not** wire the allowlisted-but-unused `share_event` / `filter_use` events into `/api/metrics` for share counts — they would be redundant with `share_links`.

---

## RBAC Roles

Three roles in ascending order: `viewer` → `editor` → `admin`.

- `viewer`: read-only access to all admin data
- `editor`: can create/edit bands, events, lineup; cannot manage users
- `admin`: full access including user management and platform settings

Enforced via `checkPermission(context, "viewer"|"editor"|"admin")` in `functions/api/admin/_middleware.js`. Every mutating endpoint must call this before touching the database.

---

## Pulling a band from a live lineup

**Use the cancel toggle (`is_cancelled = 1`). Do not un-announce, and do not delete the row.**

`is_announced = 0` is **not** a way to hide a set. Every public read path **that returns per-performance rows** guards with `AND (e.reveal_mode = 0 OR p.is_announced = 1)` — **8 files**, and three of them bind `reveal_mode` as a parameter (`AND (? = 0 OR p.is_announced = 1)`): `api/events/[id]/details.js`, `api/schedule.js`, and `event/[slug].js`, which uses both forms. Grep for `is_announced = 1` rather than the literal `e.reveal_mode` form or you will undercount:

`api/bands/[name].js`, `api/bands/stats/[name].js`, `api/events/[id]/details.js`, `api/events/timeline.js`, `api/feeds/ical.js`, `api/schedule.js`, `api/venues/[id].js`, `event/[slug].js`

On a `reveal_mode = 0` event the left side short-circuits **true**, so `is_announced` is never consulted for visibility. The set stays on the schedule, the artist page, the venue page and the iCal feed. Nothing errors; the failure is invisible until fans arrive at a dark venue.

`is_announced` is not meaningless on such an event, though — the **`0 → 1` transition still drives the follower announcement email** (see "Band Announcements" below). Un-announcing and re-announcing a set on a `reveal_mode = 0` event changes nothing publicly while still being capable of sending mail.

`reveal_mode = 0` is the normal state for a published lineup — Buddies Fest 2 (event 36) is `reveal_mode = 0`. So this trap applies to exactly the events you are most likely to be editing during a show.

Deleting the performance row does hide it, but it is lossy: a fan who already saw the lineup gets no signal the set was cancelled, and since #733 the set is **dropped entirely** from already-shared routes — `schedule/share/[slug].js` resolves live performances and filters out ids that no longer exist, so a fan reopening their shared link finds the stop silently gone rather than marked off. (Before #733 it left an orphaned name with no time or venue, which read as a rendering bug; dropping it is better, but neither tells the fan the set was cancelled.)

Since #732 the correct action is the reversible cancel toggle in LineupTab (`PATCH /api/admin/bands/:id` with `is_cancelled: true`, `editor` role or above). It keeps the set visible and struck through with a "Cancelled" label on every fan surface, suppresses it from "up next" routing and live/starting-soon time math, makes it unselectable, emits `STATUS:CANCELLED` to calendar subscribers, and **blocks the announcement email** — a cancelled performance can neither queue nor send a follower notification.

**Un-cancelling does not resend anything.** The announce path fires only on an `is_announced` `0 → 1` transition (`hasAnnounced && newValue === 1 && isCancelled === 0 && performance.is_announced === 0 && !performance.band_follow_notified`). Restoring a set leaves `is_announced` untouched, so a performance that was already announced before being cancelled produces no new transition, no `band_announce_queue` rows, and no follower email. Un-cancel restores visibility and selectability only.

Operational detail: cancelling is scoped to *one performance*. A band playing two sets (ALL and Kepi Ghoulie each play twice at BF2) needs each set cancelled separately.

The human-facing version of this, plus what to do when a set time changes or something looks wrong mid-event, is `docs/SHOW_DAY_RUNBOOK.md`. Keep the two in step — if a procedure changes, change both in the same commit.

## Band Announcements

Band follows are **double opt-in**: `POST /api/bands/:name/follow` creates the row `verified = 0` with a `verification_token` and sends only a confirmation email. Clicking the link hits `GET /api/bands/:name/confirm-follow?token=…`, which sets `verified = 1` and clears the token (idempotent). Announcement emails target `verified = 1` followers **only** (the `WHERE … verified = 1` filter in `admin/bands/[id].js` and `resend-announcement.js`), so an address the submitter doesn't control can never be enrolled in the announcement stream — it receives at most one confirmation email. **Do not revert follow to auto-verify (`verified = 1` on insert)** — it reopens the email-bombing vector.

When a performance is announced (`is_announced` 0→1), verified followers of that band are emailed once. Delivery is tracked **per-follower** in `band_follow_notifications (performance_id, band_follow_id)`: the announce records each *successful* send. Failed sends leave no row, so `POST /api/admin/bands/:id/resend-announcement` recovers them by emailing only followers without a notification row (never double-sending). Shared send+record logic lives in `functions/utils/bandFollowNotify.js`. **Do not reintroduce a fire-once latch without per-follower tracking** — it silently drops fans whose first send failed (the bug this replaced).

Bot protection on the public email-input endpoints (follow, subscribe) goes through `verifyTurnstile()` in `functions/utils/turnstile.js`, which **fails closed in production**: if `TURNSTILE_SECRET_KEY` is unset it allows only local-dev requests and rejects everything else (mirrors `CSRF_SECRET`). The secret **must** be configured in the production Pages project.

---

## Testing

### Backend unit tests
```bash
npm test         # from repo root
```
Runs fine locally, including on Apple Silicon (`better-sqlite3` loads natively on arm64) — the full suite completes in a few seconds. Prefer running it locally over waiting on CI.

### Frontend unit tests
```bash
cd frontend && npm test
```

### E2E tests
```bash
npx playwright test
```
Requires a running wrangler dev server or uses it automatically via `playwright.config.js`. Run `npm run build --prefix frontend` first.

### Before every commit — required checklist

**Canonical entry point: `make gate`** — runs the Make targets `format` → `format-check` → `lint` → `test` → `build` (`format-check` wraps the `npm run format:check` script below) for both stacks with real exit codes (see `Makefile`, `AGENTS.md`). Run it before every commit; do not commit if it fails. The npm commands below are the explicit breakdown of what `make gate` runs, for when you need to run a subset or debug a failing step.

Run all steps that apply. Do not commit if any step fails.

**Frontend changes (`frontend/src/`):**
```bash
cd frontend
npx prettier --write "src/**/*.{js,jsx,json,css}"  # fix formatting first
npm run lint && npm run format:check                 # ESLint + verify format
npm test -- --run                                    # unit tests
npm run build                                        # catch import/compile errors E2E would catch
```

**Backend changes (`functions/`):**
```bash
npm run format              # prettier --write on functions/ + scripts/ (fix first)
npm run format:check        # verify formatting is clean
npm run lint                # ESLint on functions/ + scripts/ (must be 0 errors)
npm run validate:openapi    # if docs/api-spec.yaml changed
npm test                    # from repo root — runs fine locally, including Apple Silicon
```

**Why `--write` before `--check`:** `format:check` (what CI runs) only reports errors — it never fixes them. Always run `--write` first so the commit is already clean.

**Why `npm run build`:** E2E tests run against the built app. A build failure will fail E2E in CI without a clear error. Running `build` locally catches broken imports, missing exports, and Vite errors before they reach CI.

**E2E tests** require a live wrangler dev server and are slow — run them only when changing routes, auth flows, or anything the E2E suite targets. The build check above catches most issues.

### Before opening a PR — AI review gate

```bash
make review        # CodeRabbit review of this branch vs origin/main
make review-wip    # same, but for uncommitted working-tree changes
```

Requires the CodeRabbit CLI (`brew install --cask coderabbit`, then `coderabbit auth login`); both targets fail with an install/auth hint if it is missing.

**Run this before opening the PR, not after.** The same review runs automatically on the PR, so anything it finds post-open costs a fix plus a force-push round trip. Findings it has caught that the local gates did not: assertions that pass on the wrong branch's output, a spy recording statement *preparation* rather than *execution*, and a SQL guard that stayed inert for legacy rows after a write-side fix.

`make gate` deliberately does **not** include it — `gate` must stay fast and offline-capable; `review` needs the network and takes minutes.

### Before every push (including follow-up commits during PR review)

```bash
git fetch origin
git rebase origin/main      # keep branch current with main
```

Do this **every time you push**, not just when opening the PR. Dependabot merges deps bumps to `main` frequently — if you push without rebasing, GitHub will require an "Update branch" click before merging, which adds round-trips. Rebasing before each push eliminates this entirely.

### Opening a pull request

Full PR standards are in `.github/instructions/pull-request-standards.instructions.md`. Key points:

- **Use the PR template** — GitHub loads `.github/pull_request_template.md` automatically. Fill every section; write "None" rather than deleting a section.
- **Title:** conventional-commit prefix + specific description. Put `Closes #N` on its own line in the body (GitHub does not auto-close from the title).
- **Labels:** always apply one type label (`bug`, `enhancement`, `ci`, `documentation`, `chore`, `security`) + one priority label (`priority:p1/p2/p3`) when opening — not after.
- **Verification checkboxes:** tick every `- [ ]` item before merging. An unchecked test plan is indistinguishable from a skipped one.
- **Attribution:** one line, no session URL: `Built by Sonny · Reviewed by Theo · 🤖 [Claude Code](https://claude.ai/claude-code)`

```bash
gh pr create --label "bug,priority:p1"   # example
```

---

## Security Notes

- All admin state-changing endpoints require both a valid session cookie AND a CSRF token (`X-CSRF-Token` header, read from the `csrf_token` cookie).
- Session invalidation: `lucia.invalidateUserSessions(userId)` must be called before `lucia.createSession(user.id, {})` on re-authentication (login, MFA verify). This kills stale sessions from prior compromised contexts. Both methods live on the object returned by `initializeLucia()` in `functions/utils/auth.js`.
- CSRF cookie must be regenerated whenever a new session is created (see `functions/api/admin/sessions/revoke-all.js`).
- `params.id` from Cloudflare Pages Functions URL params is a string; always run it through `validateId()` from `functions/utils/validation.js` before using it in a DB query.

### Content-Security-Policy (strict, no `unsafe-inline`) — TWO sources

There are **two** CSPs, and the one the browser enforces on a page is **not** the middleware:

- **`frontend/public/_headers`** sets the CSP (and COOP/COEP/CORP) on **static/document responses** — i.e. the HTML the browser loads. **This is the browser-enforced CSP for pages and the one that governs Turnstile, the service worker, and inline scripts.** Edit this for anything affecting what the page can load.
- **`functions/_middleware.js`** sets a CSP on **Pages Functions / API responses** (JSON), enforced when `ENVIRONMENT=production` unless `CSP_ENFORCE` overrides. It does not govern the document.

For the `_headers` document CSP:
- **Turnstile** needs `https://challenges.cloudflare.com` in `script-src`/`frame-src` ([CSP docs](https://developers.cloudflare.com/turnstile/reference/content-security-policy/)); no `'unsafe-inline'`.
- **`Cross-Origin-Embedder-Policy: require-corp` must NOT be set** — it blocks the Turnstile iframe (which doesn't send COEP; `credentialless` isn't supported in Safari). The app needs no cross-origin isolation.
- **The inline theme-flash `<script>` in `frontend/index.html`** is allowed by a `'sha256-…'` hash in `script-src`. **If you edit that script, regenerate the hash** (sha256 of the exact built script body, base64) or it silently stops running and a theme flash returns. No test covers this — verify by building and hashing `dist/index.html`.
- **Cloudflare Rocket Loader must stay DISABLED** for the zone. It rewrites/inline-executes `<script>` tags, which strict CSP blocks ("Refused to execute inline script"). A modern code-split Vite SPA gains nothing from it.
