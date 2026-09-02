# Lucia v3 Migration — Design Spec

**Date:** 2026-05-18  
**Status:** Approved

---

## Problem

`lucia@3.2.2` and `@lucia-auth/adapter-sqlite@3.0.2` are deprecated upstream. They emit `npm warn deprecated` on every `npm ci` run and will receive no further security patches. The goal is to remove these two packages with zero functional change to auth behaviour.

---

## Approach

Drop-in replacement in `functions/utils/auth.js` only. The function `initializeLucia(DB, request, env)` keeps its name and return shape. All callers — middleware, login, logout, MFA verify, revoke-all, sessions — are unchanged. The `lucia_sessions` table schema is unchanged. No DB migration required.

---

## What `initializeLucia` currently returns (Lucia instance)

Seven methods are called across the codebase:

| Method | Where called |
|---|---|
| `readSessionCookie(cookieHeader)` | `_middleware.js`, `logout.js` |
| `validateSession(sessionId)` | `_middleware.js` |
| `createSession(userId, {})` | `login.js`, `mfa/verify.js`, `revoke-all.js` |
| `invalidateSession(sessionId)` | `_middleware.js`, `logout.js`, `sessions.js` |
| `invalidateUserSessions(userId)` | `login.js`, `mfa/verify.js`, `revoke-all.js` |
| `createSessionCookie(id).serialize()` | `login.js`, `mfa/verify.js`, `revoke-all.js` |
| `createBlankSessionCookie().serialize()` | `_middleware.js`, `logout.js` |

The `lucia` object is passed through `context.data` by the middleware so downstream handlers (e.g. `revoke-all.js`) can call it without re-initialising.

---

## Replacement implementation

`initializeLucia(DB, request, env)` returns a plain object with the same seven methods, implemented with direct D1 queries.

### `readSessionCookie(cookieHeader)`

Parse the session cookie by name from the raw `Cookie` header string.

- Cookie name: `__Host-session_token` in production, `session_token` in dev/test
- Returns the cookie value string, or `null` if absent

### `validateSession(sessionId)`

```sql
SELECT s.id, s.user_id, s.expires_at,
       u.email, u.role, u.name, u.first_name, u.last_name, u.is_active
FROM lucia_sessions s
JOIN users u ON u.id = s.user_id
WHERE s.id = ?
```

- No row found → `{ session: null, user: null }`
- `expires_at * 1000 < Date.now()` → delete the row, return `{ session: null, user: null }`
- Valid → return:
  ```js
  {
    session: { id, userId: row.user_id, fresh: false, expiresAt: new Date(row.expires_at * 1000) },
    user: { email, role, name, firstName, lastName, isActive }
  }
  ```

**`session.fresh` contract:** Always `false` from `validateSession`. The middleware handles session lifetime via its own idle/absolute timeout logic — the Lucia-level cookie refresh that `fresh` originally triggered is redundant here.

### `createSession(userId, attrs)`

```sql
INSERT INTO lucia_sessions (id, user_id, expires_at, created_at, last_activity_at)
VALUES (?, ?, ?, datetime('now'), datetime('now'))
```

- Session ID: `crypto.randomUUID()` (available in Cloudflare Workers)
- `expires_at`: `Math.floor(Date.now() / 1000) + 2592000` (30 days, Unix epoch seconds — matches existing Lucia behaviour)
- Returns `{ id, userId, fresh: true, expiresAt: new Date(expires_at * 1000) }`

Callers follow up with a `UPDATE lucia_sessions SET ip_address = ?, user_agent = ? WHERE id = ?` — this is unchanged.

### `invalidateSession(sessionId)`

```sql
DELETE FROM lucia_sessions WHERE id = ?
```

### `invalidateUserSessions(userId)`

```sql
DELETE FROM lucia_sessions WHERE user_id = ?
```

### `createSessionCookie(sessionId).serialize()`

Returns a `Set-Cookie` string for the session cookie:

- Production: `__Host-session_token=<id>; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=2592000`
- Dev/test: `session_token=<id>; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`

The `__Host-` prefix requires `Secure`, `Path=/`, and no `Domain` attribute — all satisfied.

### `createBlankSessionCookie().serialize()`

Same cookie name, `Max-Age=0` to instruct the browser to delete the cookie:

- Production: `__Host-session_token=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0`
- Dev/test: `session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`

---

## Cookie attribute parity with Lucia

Existing browser sessions set cookies with Lucia's serializer. Our replacement must produce headers that are semantically equivalent so the browser honours `Max-Age=0` on logout for cookies it originally received from Lucia.

Attribute order in `Set-Cookie` is irrelevant to browsers. What must match:
- Cookie name (exact)
- `Secure` flag (prod only)
- `HttpOnly` flag
- `SameSite` value
- `Path=/`
- No `Domain` attribute

---

## Package changes

Remove from `package.json` dependencies:
- `lucia`
- `@lucia-auth/adapter-sqlite`

Add nothing. No transitive dependency risk — the replacement uses only Web Crypto (`crypto.randomUUID()`) and D1, both built into the Workers runtime.

---

## Files changed

| File | Change |
|---|---|
| `functions/utils/auth.js` | Complete rewrite (~66 lines → ~90 lines) |
| `package.json` | Remove two deprecated packages |
| `package-lock.json` | Updated by `npm install` after removal |

**No other files change.**

---

## Validation

1. Run backend unit test suite (`npm test` from repo root) — covers login, logout, MFA verify, session revocation, middleware auth
2. Manual smoke test in `wrangler dev`: login, verify session persists across page reload, logout, confirm cookie cleared
3. Regular CI/deploy pipeline runs E2E suite on merge to dev

---

## Out of scope

- Migration to `better-auth` or any other library
- Changes to `lucia_sessions` table schema
- Any changes to CSRF, TOTP, RBAC, or trusted-device logic
