# Comprehensive Code Review — SetTimes.ca

**Date:** February 12, 2026  
**Reviewer:** Automated (GitHub Copilot)  
**Scope:** Full codebase — frontend, backend, database, CI/CD, tests, infrastructure  
**Tech Stack:** React 18 + Vite 7 (frontend), Cloudflare Pages Functions (backend), D1/SQLite (database), GitHub Actions (CI/CD), Playwright (E2E), Vitest (unit)

---

## Executive Summary

SetTimes.ca is a well-structured event scheduling platform with solid security fundamentals (PBKDF2 hashing, CSRF protection, rate limiting, Lucia sessions, CSP headers) and good test infrastructure (unit + E2E + accessibility + DAST). However, the review identified **105 findings** across security, UX/accessibility, functionality, performance, best practices, and CI/CD — including **4 critical**, **13 high**, **59 medium**, and **29 low** severity issues.

### Resolution Progress

**28 findings resolved** across PRs [#81](https://github.com/BreakableHoodie/settimesdotca/pull/81), [#82](https://github.com/BreakableHoodie/settimesdotca/pull/82), [#83](https://github.com/BreakableHoodie/settimesdotca/pull/83) — all 4 criticals closed, all highs in CI/CD addressed, key performance and a11y items fixed. **77 findings remain open.**

| Status | Critical | High | Medium | Low | Total |
|--------|----------|------|--------|-----|-------|
| Resolved | 4 | 8 | 12 | 4 | **28** |
| Open | 0 | 5 | 47 | 23 | **77** |

**Top 5 systemic concerns (updated):**
1. ~~CI pipeline never blocks on failures~~ → ✅ Fixed in PR #81
2. E2E tests with zero-assertion anti-patterns (14 tests pass vacuously)
3. No TypeScript across the entire codebase (5000+ LOC)
4. Duplicated helper functions across 6+ backend files
5. ~~Activation URLs leaked in signup HTTP responses~~ → ✅ Fixed in PR #81

---

## Table of Contents

1. [Security](#1-security)
2. [UX / Accessibility](#2-ux--accessibility)
3. [Functionality](#3-functionality)
4. [Performance](#4-performance)
5. [Best Practices & Code Quality](#5-best-practices--code-quality)
6. [CI/CD & Infrastructure](#6-cicd--infrastructure)
7. [Test Quality](#7-test-quality)
8. [Database & Schema](#8-database--schema)
9. [Package Replacement Opportunities](#9-package-replacement-opportunities)
10. [Summary & Prioritized Action Items](#10-summary--prioritized-action-items)

---

## 1. Security

### CRITICAL

_(None found at critical level for direct security exploits — the codebase has solid auth fundamentals.)_

### HIGH

| ID | File | Lines | Issue | Recommendation |
|----|------|-------|-------|----------------|
| SEC-01 | `functions/api/admin/performers.js` | ~130, 233, 375, 423 | ✅ **RESOLVED (PR #81)** ~~Information disclosure: Error responses include `details: error.message` in 500 responses.~~ Removed from all 8 endpoints across 6 files. | — |
| SEC-02 | `functions/api/admin/auth/signup.js` | ~334 | ✅ **RESOLVED (PR #81)** ~~Activation URL leaked in response.~~ `activationUrl` removed from signup response body. | — |
| SEC-03 | `functions/utils/adminApi.js` (frontend) | ~219-224 | ✅ **RESOLVED (PR #81)** ~~CSRF missing on `resendActivation()`.~~ Now uses `fetchWithCSRFRetry` with `credentials: 'include'`. | — |

### MEDIUM

| ID | File | Lines | Issue | Recommendation |
|----|------|-------|-------|----------------|
| SEC-04 | `functions/api/admin/users.js` | ~162 | `inviteUrl` is always returned in the response, even when email was delivered. The URL is visible in browser devtools, proxy logs, and monitoring tools. | Only return `inviteUrl` when email delivery fails. Return `null` on email success. |
| SEC-05 | `functions/api/admin/_middleware.js` | ~228 | ✅ **RESOLVED (PR #82)** ~~CSRF bypass path check uses `pathname.includes`.~~ Changed to `pathname.startsWith("/api/admin/auth/")`. | — |
| SEC-06 | `functions/utils/trustedDevice.js` | ~10-16 | Device fingerprinting uses only `SHA-256(IP + UserAgent)`. User-Agent is trivially spoofable. Validation fallback logic (lines 67-80) is confusing with redundant double-checks. | Document this as a weak signal. Consider adding a client-side fingerprint cookie. Simplify validation logic. |
| SEC-07 | `functions/api/admin/auth/login.js`, `signup.js`, `mfa/verify.js` | various | Rate limiting is database-only. Under brute-force attacks, the rate limiting queries themselves add load. No Cloudflare-native rate limiting (WAF, in-memory counters). | Add Cloudflare Rate Limiting rules or use CF-Connecting-IP with KV-based counters as first-pass filters. |
| SEC-08 | `functions/api/admin/performers.js` | ~62, 243, 391 | Performer ID extracted via `url.pathname.split('/').pop()` with no numeric validation. Trailing slashes or query artifacts could produce unexpected values. | Use Cloudflare Pages dynamic route params (`[id].js`). Validate extracted ID is a positive integer. |
| SEC-09 | `frontend/src/pages/BandProfilePage.jsx` | ~5, ~400 | Two separate DOMPurify instances: client-only `dompurify` import here vs `isomorphic-dompurify` in `validation.js`. Different configs, SSR-incompatible. | Standardize on `isomorphic-dompurify`. Extract HTML sanitization into shared utility. |
| SEC-10 | `frontend/src/pages/BandProfilePage.jsx` | ~455 | Instagram URL built from API handle without `safeHref()` validation. Handle containing path traversal characters would create unintended URL. | Validate handle format (alphanumeric + underscores + periods) or pass through `safeHref()`. |
| SEC-11 | `frontend/src/utils/adminApi.js` | ~200-215 | User PII (email, name, role) stored in `localStorage`. Any XSS would expose this data. Same write logic duplicated in 4 places. | Extract `persistUserData()` helper. Consider `sessionStorage`. Avoid storing email/role if obtainable from session endpoint. |
| SEC-12 | `frontend/src/utils/metrics.js` | ~76-78 | `navigator.sendBeacon(endpoint, payload)` sends plain string (`text/plain`). Servers expecting JSON content-type may reject/misparse. | Use `new Blob([payload], { type: 'application/json' })` as the beacon body. |
| SEC-13 | `_middleware.js` (root) | ~148-155 | CSP allows `'unsafe-inline'` for both `script-src` and `style-src`. This significantly weakens XSS protection. | Implement nonce-based CSP for scripts. Use hashes for inline styles. Gradually remove `'unsafe-inline'`. |

### LOW

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| SEC-14 | `frontend/src/main.jsx:32-35` | `window.__SETTIMES_BUILD_ID__` exposes build timestamp, aiding fingerprinting. | Gate behind `import.meta.env.DEV` or remove. |
| SEC-15 | `frontend/src/components/ErrorBoundary.jsx:38-40` | Dev error details shown when `hostname === 'localhost'`, exposing stacks when running prod build locally. | Restrict to `import.meta.env.DEV`. |
| SEC-16 | `functions/api/metrics.js`, `schedule/build.js`, `subscriptions/subscribe.js` | Public POST endpoints have no abuse protection (Turnstile, honeypot, origin check). | Add Cloudflare Turnstile or basic anti-bot measures. |

---

## 2. UX / Accessibility

### HIGH

| ID | File | Lines | Issue | Recommendation |
|----|------|-------|-------|----------------|
| UX-01 | `frontend/src/components/BandCard.jsx` | ~55-62 | ✅ **RESOLVED (PR #81)** ~~Clickable `<div>` missing `role="button"`.~~ Added `role="button"` when `clickable` is true. | — |
| UX-02 | `frontend/src/components/ScheduleView.jsx` | ~248-275 | ✅ **RESOLVED (PR #82)** ~~Filter buttons lack `aria-pressed`.~~ Added `aria-pressed` to both venue and genre filter buttons. | — |

### MEDIUM

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| UX-03 | `frontend/src/main.jsx:38-43` | ✅ **RESOLVED (PR #82)** ~~`LoadingFallback` missing `role="status"`.~~ Added `role="status"` and `aria-live="polite"`. | — |
| UX-04 | `frontend/src/pages/BandProfilePage.jsx:~250` | Nested `<HelmetProvider>` — one already exists in `main.jsx`. Could cause meta tag ordering bugs. | Remove the inner `<HelmetProvider>`. |
| UX-05 | `frontend/src/App.jsx:~360-365` | `window.confirm()` for clearing schedule blocks the main thread. Poor mobile UX. | Replace with a custom confirmation modal component. |
| UX-06 | `frontend/src/components/Header.jsx:~44-48` | Collapsible subtitle uses `pointerEvents: 'none'` during transition, causing inconsistent click behavior. | Use `visibility: hidden` + `aria-hidden="true"` when fully collapsed. |
| UX-07 | `frontend/src/components/MySchedule.jsx:~227-237` | Travel warnings hardcoded for specific venue ("Room 47"). Won't generalize to other events. | Move venue-distance data to API or config. Use venue metadata for dynamic travel warnings. |
| UX-08 | `frontend/src/config/highlights.jsx` | Hardcoded band slugs and a personal message about "Dre" with physical description baked into source. Unprofessional, not generalizable. | Make highlights configurable per-event via API/admin. Remove personal messages from production config. |
| UX-09 | `frontend/src/components/EventTimeline.jsx:~317-348` | `<select>` elements use `bg-white/5` + white text. `<option>` elements don't inherit custom styles, causing unreadable dropdowns on some browsers. | Use a custom dropdown (Headless UI `Listbox`) or ensure `<option>` has explicit dark background. |
| UX-10 | No skip-navigation link in Header/main.jsx. | ✅ **RESOLVED (PR #82)** ~~No skip-navigation link.~~ Added skip link in `main.jsx` + `id="main-content"` on `<main>` in App.jsx and EventsPage.jsx. | — |

### LOW

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| UX-11 | `frontend/src/components/Footer.jsx` | No privacy policy, terms of use, or accessibility statement link. Site uses analytics and localStorage. | Add a privacy policy link (PIPEDA/GDPR requirement for a Canadian site). |
| UX-12 | `frontend/src/pages/EventsPage.jsx:~44-50` | `<Helmet>` title is just "SetTimes" with no `<meta name="description">`. | Add SEO description meta tag. |
| UX-13 | `frontend/src/App.jsx:~395-410` | Debug time panel shows on all preview URLs (dev/pages.dev). Non-developer testers may be confused. | Gate behind `?debug=true` query param instead of showing on all preview deployments. |

---

## 3. Functionality

### CRITICAL

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| FN-01 | `functions/api/subscriptions/subscribe.js:3` | ✅ **RESOLVED (PR #81)** ~~Broken import missing `.js` extension.~~ Changed to `"../../utils/tokens.js"`. | — |

### MEDIUM

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| FN-02 | `functions/api/subscriptions/verify.js:~48` | `Response.redirect(\`${env.PUBLIC_URL}/subscribe?verified=true\`)` — if `PUBLIC_URL` is unset, redirects to `undefined/subscribe`. | Add fallback: `env.PUBLIC_URL \|\| new URL(request.url).origin`. |
| FN-03 | `functions/api/admin/events.js:~46-49` | GET has no `LIMIT` clause. Returns unbounded result set as events grow. | Add pagination (limit/offset or cursor-based). |
| FN-04 | `functions/api/admin/bands.js:~198` | Hard-coded `LIMIT 200` with no offset parameter. >200 bands are inaccessible. | Accept `limit` and `offset` query parameters. |
| FN-05 | `functions/api/admin/performers.js:~310-316` | PUT always serializes new `social_links` JSON. Partial updates (e.g., changing only `name`) nullify all social link fields. | Only update `social_links` when at least one social field is provided. Preserve existing values otherwise. |
| FN-06 | `functions/api/admin/mfa/disable.js:~85-90` | Backup code used for MFA disable is verified but not consumed in DB before the UPDATE. Race window between verification and update could leave backup code valid. | Consume the backup code (persist `remaining`) before executing the disable UPDATE. |

### LOW

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| FN-07 | `functions/api/events/timeline.js:~54` | "Now" events use date-only comparison. An event that ended at 2 PM still shows as "now" at 11 PM. | Optionally check if any performance `end_time` is still in the future. |
| FN-08 | `functions/api/bands/[name].js:~125-128` | Returns 404 when band has a profile but no published performances, even though the profile exists. | Return profile with empty performances array, or use a more accurate error message. |
| FN-09 | `functions/api/feeds/ical.js:~93-94` | DTSTART/DTEND use local time without TZID parameter. `X-WR-TIMEZONE` is non-standard. Some calendars will interpret as floating/UTC. | Add `TZID=America/Toronto` to DTSTART/DTEND, or include a proper VTIMEZONE block. |

---

## 4. Performance

### HIGH

| ID | File | Lines | Issue | Recommendation |
|----|------|-------|-------|----------------|
| PERF-01 | `frontend/src/components/MySchedule.jsx` | ~155-176 | ✅ **RESOLVED (PR #82)** ~~O(n²) conflict detection on every render.~~ Wrapped in `useMemo(() => ..., [visibleBands])`. | — |
| PERF-02 | `frontend/src/components/ScheduleView.jsx` | entire | ✅ **RESOLVED (PR #82)** ~~Not wrapped in `React.memo()`.~~ Exported as `memo(ScheduleView)`. | — |

### MEDIUM

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| PERF-03 | `functions/api/metrics.js:~83-108` | Sequential `await` DB writes in loop for band views/social clicks. 50 events could mean 20+ sequential writes per request. | Use `DB.batch()` to execute all upserts in a single batch call. |
| PERF-04 | `functions/api/admin/_middleware.js:~126-128` | `last_activity_at` DB write on **every** authenticated request. Creates unnecessary write pressure under concurrent admin usage. | Throttle: only write if last activity was >60 seconds ago. |
| PERF-05 | `functions/scheduled/aggregate-stats.js:~10-34` | `UPDATE band_profiles SET ...` has no WHERE clause. Updates ALL rows regardless of whether stats changed. | Add WHERE clause: `WHERE id IN (SELECT DISTINCT band_profile_id FROM artist_daily_stats WHERE date >= date('now', '-1 day'))`. |
| PERF-06 | `frontend/src/components/MySchedule.jsx:~61-120` | `getTimeStatus()` creates multiple `new Date()` objects per-band, per-render. Not memoized. | Pre-compute all statuses outside JSX via `useMemo`. |
| PERF-07 | `frontend/src/components/EventTimeline.jsx:~185-195` | `allVenues` useMemo uses `JSON.stringify`/`JSON.parse` for deduplication. | Use a `Map` keyed by `venue.id` for O(n) dedup without serialization. |
| PERF-08 | `frontend/src/App.jsx` | 498-line monolithic component managing data fetching, state, persistence, debug controls, and view rendering. | Extract into custom hooks: `useScheduleData()`, `useSelectedBands()`, `useDebugTime()`. |
| PERF-09 | `frontend/src/index.css` + `tailwind.config.js` | CSS custom properties largely duplicate Tailwind config. Both ship to client. | Choose one source of truth. Prefer Tailwind with `theme()` references. |
| PERF-10 | `frontend/vite.config.js:~10-25` | Both `terserOptions.compress.drop_console` and `esbuild.drop: ['console']` configured. `esbuild.drop` strips console in dev too. | Remove `esbuild.drop` to preserve dev-mode logging. Keep terser option for production only. |

### LOW

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| PERF-11 | `functions/api/events/timeline.js:~127-270` | Three large JOIN queries ("now", "upcoming", "past") executed sequentially. They're independent. | Use `Promise.all()` or `DB.batch()`. |
| PERF-12 | `functions/api/admin/analytics/subscriptions.js:~25-85` | Six sequential independent DB queries. | Use `DB.batch()` for single round-trip. |
| PERF-13 | `frontend/src/components/EventTimeline.jsx:~84-95` | 60s polling with no exponential backoff on errors, no `AbortController` on tab hidden. | Abort on visibility hidden + exponential backoff on failures. |
| PERF-14 | `frontend/src/pages/BandProfilePage.jsx` | 614-line component. Could split into sub-components for better reconciliation. | Extract `BandHero`, `BandSocials`, `UpcomingShows`, `PerformanceHistory`. |

---

## 5. Best Practices & Code Quality

### HIGH

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| BP-01 | Project-wide | **No TypeScript.** 5000+ LOC of plain JavaScript across frontend and backend. No type safety, no PropTypes, no JSDoc types. | Adopt TypeScript incrementally. Start with `.tsx` for new files. Add `// @ts-check` to existing files. Create `.d.ts` for shared types. |
| BP-02 | `ScheduleView.jsx` + `MySchedule.jsx` | ✅ **RESOLVED (PR #82)** ~~Duplicated clipboard fallback.~~ Extracted to shared `frontend/src/utils/clipboard.js`. Both components now import from it. | — |

### MEDIUM

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| BP-03 | Backend (6+ files) | **Heavily duplicated helpers**: `normalizeName()` in 4 files, `formatVenueAddress()` in 5 files, `unpackSocialLinks()` in 2 files, `parseOrigin()`/`formatOrigin()` in multiple files. | Extract into `functions/utils/formatters.js`. |
| BP-04 | Backend (throughout) | **Inconsistent error response shapes**: `{error}`, `{error, message}`, `{success: false, error}`, plain text. | Create `errorResponse(status, code, message)` helper. Use everywhere. |
| BP-05 | Backend (throughout) | **Inconsistent logger usage**: Most files use bare `console.log/error/warn`. Only middleware uses the structured logger. | Adopt structured logger (`createRequestLogger`) across all endpoints. |
| BP-06 | Backend | **Missing audit logging**: Band and performer create/update/delete operations have no audit log entries, unlike events and venues. | Add `auditLog()` calls for band/performer mutations. |
| BP-07 | `frontend/src/utils/adminApi.js:~200-280` | User storage logic (`localStorage.setItem(...)`) duplicated in `signup`, `login`, `verifyMfa`, `verifySession` (4 times). | Extract `persistUserToStorage(user)` helper. |
| BP-08 | `frontend/src/main.jsx:32` | `BUILD_ID` is a hardcoded string that must be manually updated each deploy. | Generate from `import.meta.env.VITE_BUILD_ID` or inject via Vite `define` from git SHA + timestamp. |
| BP-09 | `frontend/src/App.jsx` + `EventContext.jsx` | App.jsx manages `selectedBandsByEvent` localStorage directly, while `scheduleStorage.js` also manages the same keys. Two code paths. | Consolidate through `scheduleStorage` utility. Remove direct localStorage calls from App.jsx. |
| BP-10 | `frontend/src/contexts/EventContext.jsx:~76-78` | ✅ **RESOLVED (PR #82)** ~~`refreshEvents` not wrapped in `useCallback`.~~ Now uses `useCallback(() => fetchEvents(), [fetchEvents])`. | — |
| BP-11 | `frontend/tailwind.config.js:~58-62` | Deprecated color aliases (`band-navy`, `band-purple`, `band-orange`) still used in 4+ components. | Complete migration to semantic names; remove deprecated aliases. |
| BP-12 | `frontend/src/main.jsx:57-68` | Service worker unregistration runs on every production page load. Should be time-limited. | Remove after sufficient transition period, or add date-based check. |

### LOW

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| BP-13 | `functions/api/subscriptions/subscribe.js`, `schedule/build.js` | No max-length validation on `user_session`, `email`, `city`, `genre` fields stored to DB. | Add length checks (e.g., email ≤ 320, session ≤ 128). |
| BP-14 | `functions/api/test-utils.js` | Test DB schema missing `trusted_devices` table. Tests involving trusted device flow would fail. | Add `trusted_devices` table to `createTestDB()`. |
| BP-15 | `frontend/src/contexts/EventContext.jsx:23`, `EventTimeline.jsx:324` | ✅ **RESOLVED (PR #82)** ~~`parseInt()` called without radix argument.~~ All calls now include `, 10` radix. | — |

---

## 6. CI/CD & Infrastructure

### CRITICAL

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| CI-01 | `e2e-tests.yml:13`, `e2e-a11y-visual.yml:16`, `dependency-review.yml:12` | ✅ **RESOLVED (PR #81)** ~~`continue-on-error: true` on all test/security jobs.~~ Removed from all 3 workflows. | — |
| CI-02 | `e2e-tests.yml:~55-60`, `e2e-a11y-visual.yml:~42-47` | ✅ **RESOLVED (PRs #82 + #83)** ~~Shell SQL interpolation in CI.~~ Node.js script `scripts/seed-e2e-admin.mjs` created (PR #82) and wired into both E2E workflows (PR #83). | — |

### HIGH

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| CI-03 | `cloudflare-pages.yml`, `quality.yml`, `e2e-tests.yml`, `e2e-a11y-visual.yml` | ✅ **RESOLVED (PR #83)** ~~Missing `permissions:` blocks.~~ All workflows now have explicit `permissions: { contents: read }` (+ `deployments: write` for cloudflare-pages, `issues: write` for zap-baseline). | — |
| CI-04 | `cloudflare-pages.yml:~54-58` | No GitHub `environment` protection for Cloudflare deployment. Any push to main/dev deploys without approvals. | Add `environment: production` / `environment: staging` with protection rules. |

### MEDIUM

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| CI-05 | `e2e-tests.yml:47`, `e2e-a11y-visual.yml:37` | Hardcoded CSRF secret `"e2e-test-csrf-secret-for-ci"` in workflow, publicly visible. | Store as GitHub Secret or generate at runtime (`openssl rand -hex 32`). |
| CI-06 | All 7 workflows | ✅ **RESOLVED (PR #83)** ~~No `concurrency` controls.~~ Added `concurrency` groups with `cancel-in-progress: true` to cloudflare-pages, codeql, e2e-a11y-visual, e2e-tests, quality workflows. | — |
| CI-07 | `e2e-tests.yml` + `e2e-a11y-visual.yml` | ~40 lines of duplicated database init/server startup shell scripting. | Extract into reusable composite action (`.github/actions/setup-e2e/action.yml`). |
| CI-08 | `cloudflare-pages.yml` | All build, test, and deploy in a single job. Failed build loses test results; failed deploy can't be retried alone. | Split into `test` → `build` → `deploy` jobs with `needs` dependencies. |
| CI-09 | `setup.sh:~7-12` | ✅ **RESOLVED (PR #83)** ~~Uses `npm install`.~~ Changed to `npm ci` in both root and frontend installs. | — |
| CI-10 | `init-dev-db.sh` | ✅ **RESOLVED (PR #83)** ~~Missing shell hardening.~~ Added `set -eu`, `cleanup()` function with `trap EXIT ERR INT TERM`, trap disabled before `wait` for normal operation. `pipefail` intentionally excluded (incompatible with background process pattern). | — |
| CI-11 | `setup.sh`, `init-dev-db.sh` | ✅ **RESOLVED (PR #83)** ~~setup.sh missing `set -euo pipefail`.~~ Added. init-dev-db.sh partially addressed (see CI-10). | — |
| CI-12 | `init-dev-db.sh:5` vs `e2e-tests.yml:51` | Inconsistent D1 database name: `bandcrawl-db` vs `settimes-production-db`. | Align on a single name; reference `wrangler.toml` as source of truth. |

### LOW

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| CI-13 | All workflows | Actions pinned to major version tags (`@v4`), not SHAs. | Pin to full commit SHAs. Use Dependabot for updates. |
| CI-14 | All workflows | ✅ **RESOLVED (PR #83)** ~~No `timeout-minutes`.~~ Added to all 9 workflow jobs (10–20 min each). | — |
| CI-15 | `e2e-tests.yml:96`, `e2e-a11y-visual.yml:74` | ✅ **RESOLVED (PR #83)** ~~Both upload artifact named `playwright-report`.~~ Renamed to `playwright-report-e2e` and `playwright-report-a11y-visual`. | — |
| CI-16 | `cloudflare-pages.yml:~18-21` | ✅ **RESOLVED (PR #83)** ~~Missing `cache-dependency-path`.~~ Added `cache-dependency-path` with both `package-lock.json` and `frontend/package-lock.json` to cloudflare-pages, e2e-tests, and e2e-a11y-visual workflows. | — |
| CI-17 | `quality.yml` | Three jobs independently run `npm ci`. ~3x redundant install time. | Share via reusable workflow or artifact passing. |
| CI-18 | `codeql.yml`, `quality.yml` | ✅ **RESOLVED (PR #83)** ~~`actions/checkout` without `fetch-depth: 1`.~~ Added `fetch-depth: 1` to 6 workflows (cloudflare-pages, quality, e2e-tests, e2e-a11y-visual, dependency-review, zap-baseline). CodeQL intentionally excluded (needs full history). | — |

---

## 7. Test Quality

### CRITICAL

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| TQ-01 | `e2e/band-profile-viewing.spec.js` | **Zero-assertion anti-pattern**: All 14 tests wrap assertions in `if (await bandLink.isVisible())`. If no bands in test DB, **all tests pass with zero assertions executed**. | Seed known band data. Replace `if` guards with `await expect(bandLink).toBeVisible()`. |

### HIGH

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| TQ-02 | `functions/utils/__tests__/totp.test.js` | Only 3 tests for the TOTP (MFA) module. Missing: invalid codes, time-window drift, malformed inputs, replay attacks, backup code edge cases. | Add negative, boundary, and malformed input tests. |
| TQ-03 | `e2e/public-timeline.spec.js:82`, `user-management.spec.js:33` | Hardcoded `waitForTimeout()` — the #1 cause of flaky E2E tests. | Replace with explicit `waitFor` conditions (e.g., `await expect(locator).toBeVisible()`). |

### MEDIUM

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| TQ-04 | `e2e/event-creation.spec.js`, `band-management.spec.js`, `user-management.spec.js` | Specs re-authenticate via custom `loginAsAdmin()` instead of using Playwright's saved storage state. Wastes time, adds flakiness. | Remove custom login helpers. Use the `storageState` already configured in `playwright.config.js`. |
| TQ-05 | `functions/api/admin/__tests__/me.test.js` | Only 1 test for `GET /api/admin/me`. Missing: unauthenticated request, expired session, malformed user data, non-admin role. | Add negative/error case tests. |
| TQ-06 | Various test files | Inconsistent mock strategies: some use `MockD1Database`, some use `createTestEnv` (in-memory SQLite), some build inline mocks. | Standardize on `createTestEnv` with real in-memory SQLite. Migrate manual mocks. |

### LOW

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| TQ-07 | `e2e/band-management.spec.js:~111-125` | Three `test.skip` blocks for features that "don't currently exist." No linked issues. | Remove or add `// TODO: <issue-link>` references. |
| TQ-08 | `e2e/event-creation.spec.js:~103`, `band-management.spec.js:~87` | `page.once('dialog')` before click is slightly racy. `user-management.spec.js` correctly uses `page.waitForEvent('dialog')`. | Standardize on the `waitForEvent` pattern. |
| TQ-09 | `functions/api/events/__tests__/timeline.test.js:~27-29` | Hardcoded past dates ("2025-11-05") for "today" events. | Use relative dates in mocks. |
| TQ-10 | `functions/api/events/__tests__/details.test.js` | Missing test for non-existent event ID (valid numeric, never created). | Add `GET /api/events/99999/details` test. |

---

## 8. Database & Schema

### MEDIUM

| ID | Area | Issue | Recommendation |
|----|------|-------|----------------|
| DB-01 | `schema.sql` vs `schema-v2.sql` vs `schema-final.sql` | **Three schema files** exist with different versions. Unclear which is canonical. `schema.sql` still uses the legacy `bands` table, while `schema-final.sql` has the full v2+ schema with users+RBAC. | Designate `schema-final.sql` as the canonical schema. Rename to `schema.sql` and archive/remove the others. Add a comment indicating it's the source of truth. |
| DB-02 | `migrations/` (24 files) | **No migration tracking table** or version numbering system beyond filenames. `migrate-local-db.sh` applies all migrations and swallows errors ("error - may already be applied"). | Implement a `_migrations` tracking table. Record applied migration filenames/timestamps. Skip already-applied migrations deterministically. |
| DB-03 | `schema-final.sql` | **No CHECK constraints** on role values. `users.role` accepts any TEXT value. Similarly `events.is_published` accepts any INTEGER, not just 0/1. | Add: `CHECK (role IN ('admin', 'editor', 'viewer'))`, `CHECK (is_published IN (0, 1))`. |
| DB-04 | `schema-final.sql` | **No composite unique constraint** on `performances(event_id, venue_id, start_time)`. Two performances at the same venue/time are not prevented at the DB level. | Add `UNIQUE(event_id, venue_id, start_time)` if business rules require no venue conflicts. |
| DB-05 | `schema-final.sql` | `social_links` stored as JSON TEXT in `band_profiles`. No DB-level validation. Malformed JSON persists silently. | Accept as SQLite limitation. Ensure API-level JSON validation before write (already partially done). Document the expected JSON structure. |
| DB-06 | `schema.sql` | Original schema still has `bands.url` marked as `-- deprecated`. Dead column. | Remove `url` column from schema or add a migration to drop it. |
| DB-07 | Missing table | `trusted_devices` table referenced by `trustedDevice.js` not defined in any schema file (only in some migrations). Not included in `test-utils.js` either. | Add to `schema-final.sql` and `test-utils.js`. |

### LOW

| ID | Area | Issue | Recommendation |
|----|------|-------|----------------|
| DB-08 | `schema-final.sql` | `update_band_profile_timestamp` trigger fires on `AFTER UPDATE`, then does another `UPDATE`. This creates recursive trigger potential (SQLite limits recursive triggers by default, but it's still wasteful). | Consider using `datetime('now')` directly in the application UPDATE statements instead of triggers, which is more explicit and avoids the double-write. |
| DB-09 | `auth_audit` | No retention policy. Table grows unbounded. | Add a scheduled job to prune records older than 90 days. |
| DB-10 | Missing index | `performances(event_id, band_profile_id)` composite index missing. Used in band profile page queries (find all events a band played at). | Add `CREATE INDEX idx_performances_event_band ON performances(event_id, band_profile_id)`. |

---

## 9. Package Replacement Opportunities

| ID | Impact | Current Approach | Recommended Package | Rationale |
|----|--------|------------------|---------------------|-----------|
| PKG-01 | **High** | Manual `useState`/`useEffect`/`fetch` with loading/error states in App.jsx, EventTimeline.jsx, BandProfilePage.jsx (~30 lines boilerplate each) | **TanStack Query (React Query)** | Standardizes caching, deduplication, background refetch, retry, stale-while-revalidate. Eliminates ~100 lines of data-fetching boilerplate. |
| PKG-02 | **Medium** | 30-line manual clipboard fallback with deprecated `document.execCommand`, duplicated in 2 files | **Remove fallback** (Clipboard API at 96%+ support) or use **`clipboard-polyfill`** | Eliminates duplicated code and deprecated API usage. |
| PKG-03 | **Medium** | Manual `useState` + `useEffect` + `localStorage` sync in App.jsx, EventContext.jsx | **Zustand** with `persist` middleware | ~1KB, eliminates manual sync code, stable selectors reduce re-renders. |
| PKG-04 | **Medium** | Hand-written cookie serialization in `csrf.js` and `cookies.js` (~100 lines) | **`cookie`** npm package | Battle-tested cookie serialization/parsing. Eliminates hand-rolled code prone to edge-case bugs. |
| PKG-05 | **Low** | Manual validation functions in `validation.js` (~1000 lines) | **Zod** | Schema-based validation with TypeScript inference. Pairs well with existing field limits. |
| PKG-06 | **Low** | Manual structured logging in `logger.js` (~234 lines) | **`pino`** (or Cloudflare-native `logfmt`) | Production-grade structured logging with redaction, child loggers, and minimal overhead. |
| PKG-07 | **Low** | `prop-types` in frontend dependencies | **TypeScript** (see BP-01) | `prop-types` provides runtime checks only. TypeScript provides compile-time safety and IDE support. Remove `prop-types` after TypeScript adoption. |
| PKG-08 | **Low** | Both `dompurify` and `isomorphic-dompurify` in dependencies | **Consolidate to `isomorphic-dompurify` only** | Eliminates duplicate dependency and SSR incompatibility. |

---

## 10. Summary & Prioritized Action Items

### Severity Distribution (Updated)

| Category | Critical | High | Medium | Low | Total | ✅ Resolved |
|----------|----------|------|--------|-----|-------|-------------|
| Security | 0 | 3→0 | 10→9 | 3 | **16** | **4** (SEC-01–03, SEC-05) |
| UX/A11y | 0 | 2→0 | 8→5 | 3 | **13** | **4** (UX-01–03, UX-10) |
| Functionality | 1→0 | 0 | 5 | 3 | **9** | **1** (FN-01) |
| Performance | 0 | 2→0 | 8 | 4 | **14** | **2** (PERF-01–02) |
| Best Practices | 0 | 2→1 | 10→8 | 3→2 | **15** | **3** (BP-02, BP-10, BP-15) |
| CI/CD | 2→0 | 2→0 | 8→2 | 6→2 | **18** | **12** (CI-01–03, CI-06, CI-09–11, CI-14–16, CI-18) |
| Test Quality | 1 | 2 | 3 | 4 | **10** | **0** |
| Database | 0 | 0 | 7 | 3 | **10** | **0** |
| **Totals** | **1** | **5** | **47** | **23** | **105** | **28 resolved** |

### Top 15 Priority Actions (Ordered by Risk × Impact)

| Priority | ID | Summary | Effort | Status |
|----------|----|---------|--------|--------|
| 1 | CI-01 | Remove `continue-on-error: true` from test/security workflows | 15 min | ✅ PR #81 |
| 2 | FN-01 | Fix broken import in `subscribe.js` | 5 min | ✅ PR #81 |
| 3 | SEC-02 | Stop returning activation URL in signup HTTP response | 15 min | ✅ PR #81 |
| 4 | TQ-01 | Fix 14 vacuous band-profile-viewing E2E tests (seed data + remove `if` guards) | 1 hr | Open |
| 5 | CI-03 | Add `permissions: { contents: read }` to all GitHub Actions workflows | 30 min | ✅ PR #83 |
| 6 | SEC-01 | Remove `error.message` from all client-facing 500 responses | 30 min | ✅ PR #81 |
| 7 | SEC-03 | Add CSRF protection to `resendActivation()` | 10 min | ✅ PR #81 |
| 8 | PERF-01 | Memoize O(n²) conflict detection in MySchedule.jsx | 30 min | ✅ PR #82 |
| 9 | CI-02 | Replace shell SQL interpolation in CI with parameterized Node.js script | 1 hr | ✅ PRs #82 + #83 |
| 10 | UX-01 | Add `role="button"` to interactive BandCard divs | 15 min | ✅ PR #81 |
| 11 | BP-03 | Extract duplicated backend helpers into shared utility modules | 2 hr | Open |
| 12 | PERF-03 | Batch metrics DB writes using `DB.batch()` | 1 hr | Open |
| 13 | DB-01 | Consolidate schema files; designate one as canonical | 30 min | Open |
| 14 | DB-02 | Implement migration tracking table | 2 hr | Open |
| 15 | BP-01 | Begin TypeScript adoption (configure, convert new files) | 4 hr initial | Open |

### Quick Wins (< 30 minutes each)

- ~~Remove `continue-on-error: true` (CI-01)~~ ✅ PR #81
- ~~Fix subscribe.js import (FN-01)~~ ✅ PR #81
- ~~Add `permissions` blocks to workflows (CI-03)~~ ✅ PR #83
- ~~Remove activation URL from response (SEC-02)~~ ✅ PR #81
- ~~Add CSRF to `resendActivation` (SEC-03)~~ ✅ PR #81
- ~~Add `role="button"` to BandCard (UX-01)~~ ✅ PR #81
- ~~Remove `error.message` from 500 responses (SEC-01)~~ ✅ PR #81
- ~~Fix `parseInt` calls without radix (BP-15)~~ ✅ PR #82
- ~~Add `timeout-minutes` to all CI jobs (CI-14)~~ ✅ PR #83
- ~~Add `aria-pressed` to schedule filter buttons (UX-02)~~ ✅ PR #82
- ~~Add `set -euo pipefail` to shell scripts (CI-10, CI-11)~~ ✅ PR #83
- ~~Distinct artifact names for E2E reports (CI-15)~~ ✅ PR #83
- ~~Add `cache-dependency-path` for frontend lockfile (CI-16)~~ ✅ PR #83
- ~~Add `fetch-depth: 1` to checkout steps (CI-18)~~ ✅ PR #83

### Additional Fixes Applied (Not in Original Quick Wins)

- ~~Skip-to-content link (UX-10)~~ ✅ PR #82
- ~~LoadingFallback aria attributes (UX-03)~~ ✅ PR #82
- ~~CSRF path check `includes` → `startsWith` (SEC-05)~~ ✅ PR #82
- ~~Clipboard utility deduplication (BP-02)~~ ✅ PR #82
- ~~`refreshEvents` useCallback (BP-10)~~ ✅ PR #82
- ~~MySchedule O(n²) memoization (PERF-01)~~ ✅ PR #82
- ~~ScheduleView React.memo (PERF-02)~~ ✅ PR #82
- ~~Concurrency groups on all workflows (CI-06)~~ ✅ PR #83
- ~~`npm install` → `npm ci` in setup.sh (CI-09)~~ ✅ PR #83
- ~~E2E admin seed script created + wired into workflows (CI-02)~~ ✅ PRs #82 + #83
- ~~Permissions blocks on all workflows (CI-03)~~ ✅ PR #83
- ~~init-dev-db.sh set -eu + trap cleanup (CI-10)~~ ✅ PR #83
- ~~Distinct playwright-report artifact names (CI-15)~~ ✅ PR #83
- ~~cache-dependency-path on 3 workflows (CI-16)~~ ✅ PR #83
- ~~fetch-depth: 1 on 6 workflows (CI-18)~~ ✅ PR #83

---

*Report generated by automated code review. Last updated: February 12, 2026. All findings should be validated by a human reviewer before implementation. Severity ratings are based on risk assessment combining exploitability, impact, and blast radius.*
