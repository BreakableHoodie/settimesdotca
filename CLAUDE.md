# CLAUDE.md — settimesdotca

AI assistant context for this codebase. Captures non-obvious invariants, known gotchas, and conventions that aren't derivable from reading the code.

---

## Stack

- **Frontend**: React 19, Vite 8, Tailwind 4, React Router 7 (`frontend/`)
- **Backend**: Cloudflare Pages Functions (edge serverless, `functions/`)
- **Database**: Cloudflare D1 (SQLite-compatible), 38 migrations in `migrations/`
- **Auth**: Direct D1 session manager (`functions/utils/auth.js`), CSRF double-submit, TOTP MFA, trusted devices, RBAC
- **Storage**: Cloudflare R2 (band photos)
- **Email**: Postmark/Resend/MailChannels
- **Tests**: Vitest (unit, frontend), Playwright (E2E + a11y + visual regression)
- **CI/CD**: GitHub Actions (10 workflows), CodeQL, Dependabot

---

## Critical Invariants

### After-midnight band sorting — recurring bug class

Bands starting before 6 AM are "after-midnight" sets that belong to the *previous evening*. They must be offset by +1 day so they sort after the evening lineup, not at the top of the schedule.

- Threshold: `AFTER_MIDNIGHT_THRESHOLD_HOUR = 6` in `frontend/src/utils/bandUtils.js`
- Logic: `prepareBands()` adds `MS_PER_DAY` to `startMs`/`endMs` for times below this threshold
- **Never remove or lower this threshold.** Any sort, filter, or conflict-detection that touches performance times must apply the same offset or delegate to `prepareBands`.

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

Password hashing uses PBKDF2-SHA256 via the Web Crypto API (`functions/utils/crypto.js`). Hash format: `pbkdf2$iterations$salt$hash`.

bcrypt requires a native binary (`better-sqlite3` style) that cannot run on Cloudflare Workers. Do not introduce bcrypt anywhere in `functions/`.

### D1 transactions: no BEGIN/COMMIT, but `DB.batch()` is atomic

The Cloudflare Workers D1 binding does not support explicit `BEGIN`/`COMMIT` transaction syntax. However, `env.DB.batch([stmt1, stmt2, ...])` executes all statements atomically — if any fails, all are rolled back. Prefer `DB.batch()` for multi-statement mutations.

For mutations that cannot be expressed as a single batch (e.g., the event-duplication pattern in `functions/api/admin/events/[id].js`), use compensating deletes: if step N fails, manually undo steps 1…N-1.

### PRAGMA `foreign_keys = ON` is enforced in production

`functions/_middleware.js` runs `PRAGMA foreign_keys = ON` on every D1 session before the request handler fires. Unit test helpers (`functions/api/test-utils.js`) set it the same way via `better-sqlite3`. FK constraints are active in all environments.

When recreating a table in a migration (SQLite has no ALTER COLUMN), surround the table-recreation block with `PRAGMA foreign_keys = OFF` / `PRAGMA foreign_keys = ON` as migration 0032 does — D1 will reject the DROP otherwise.

### `ALLOW_ADMIN_SIGNUP` is test-only

This env var bypasses the invite-code requirement for signup. It must never be set in production. It appears only in test helpers and E2E seed scripts.

---

## React 19 Known Issues

### `react-helmet-async` `<Helmet>` does not reliably set `document.title` in React 19

Use `document.title = pageTitle` directly in a `useEffect` within the page component. Do NOT remove the direct assignment in favour of `<Helmet>` until react-helmet-async ships a React 19 compatible release.

Example: `frontend/src/pages/BandProfilePage.jsx` — uses both `<Helmet>` (for other meta) and `document.title = ...` for the title.

---

## Schedule Storage (localStorage)

Band selections are stored under the `selectedBandsByEvent` key as `{ [eventSlug]: [bandId, ...], __dates__: { [eventSlug]: "YYYY-MM-DD" } }`.

The `__dates__` namespace is used for stale detection. **Always use YYYY-MM-DD lexicographic string comparison** — do NOT use `new Date('YYYY-MM-DD')` which parses as UTC midnight and causes events to appear stale on their own day in UTC-negative timezones.

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

## Testing

### Backend unit tests
```
npm test         # from repo root
```
**Cannot run locally** if `better-sqlite3` native binary fails to load (DLOPEN error on Apple Silicon). Run in CI or use a Linux environment.

### Frontend unit tests
```
cd frontend && npm test
```

### E2E tests
```
npx playwright test
```
Requires a running wrangler dev server or uses it automatically via `playwright.config.js`. Run `npm run build --prefix frontend` first.

### Before every commit — required checklist

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
npm run validate:openapi    # if openapi.yaml changed
npm test                    # from repo root (may fail on Apple Silicon — run in CI)
```

**Why `--write` before `--check`:** `format:check` (what CI runs) only reports errors — it never fixes them. Always run `--write` first so the commit is already clean.

**Why `npm run build`:** E2E tests run against the built app. A build failure will fail E2E in CI without a clear error. Running `build` locally catches broken imports, missing exports, and Vite errors before they reach CI.

**E2E tests** require a live wrangler dev server and are slow — run them only when changing routes, auth flows, or anything the E2E suite targets. The build check above catches most issues.

### Before every push (including follow-up commits during PR review)

```bash
git fetch origin
git rebase origin/main      # keep branch current with main
```

Do this **every time you push**, not just when opening the PR. Dependabot merges deps bumps to `main` frequently — if you push without rebasing, GitHub will require an "Update branch" click before merging, which adds round-trips. Rebasing before each push eliminates this entirely.

---

## Security Notes

- All admin state-changing endpoints require both a valid session cookie AND a CSRF token (`X-CSRF-Token` header, read from the `csrf_token` cookie).
- Session invalidation: `lucia.invalidateUserSessions(userId)` must be called before `lucia.createSession(user.id, {})` on re-authentication (login, MFA verify). This kills stale sessions from prior compromised contexts. Both methods live on the object returned by `initializeLucia()` in `functions/utils/auth.js`.
- CSRF cookie must be regenerated whenever a new session is created (see `functions/api/admin/sessions/revoke-all.js`).
- `params.id` from Cloudflare Pages Functions URL params is a string; always run it through `validateId()` from `functions/utils/validation.js` before using it in a DB query.
