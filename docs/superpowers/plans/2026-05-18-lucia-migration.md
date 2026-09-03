# Lucia v3 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the deprecated `lucia` and `@lucia-auth/adapter-sqlite` packages with a drop-in session manager that calls D1 directly — zero behavioural change, zero call-site edits.

**Architecture:** `functions/utils/auth.js` is rewritten in-place. `initializeLucia(DB, request, env)` keeps its exact name and return shape: a plain object with 7 methods that the middleware and auth endpoints already call. The `lucia_sessions` table and all callers are untouched.

**Tech Stack:** Cloudflare Workers (D1 binding), `crypto.randomUUID()` (built into Workers runtime), Vitest for tests.

---

## File map

| File | Action |
|---|---|
| `functions/utils/__tests__/auth.test.js` | **Create** — unit tests that lock in expected session manager behaviour |
| `functions/utils/auth.js` | **Rewrite** — replace Lucia with direct D1 queries |
| `package.json` | **Modify** — remove `lucia` and `@lucia-auth/adapter-sqlite` |
| `package-lock.json` | **Updated automatically** by `npm install` |

---

## Task 1: Write unit tests for the session manager

**Files:**
- Create: `functions/utils/__tests__/auth.test.js`

These tests characterise the exact behaviour our implementation must match. Run them before and after the rewrite — both times they must pass.

- [ ] **Step 1: Create the test file**

```js
// functions/utils/__tests__/auth.test.js
import { describe, test, expect, beforeEach } from 'vitest';
import { createTestDB, createDBEnv } from '../../api/test-utils.js';
import { initializeLucia } from '../auth.js';

function makeEnv(rawDb, opts = {}) {
  return {
    DB: createDBEnv(rawDb),
    ENVIRONMENT: opts.env ?? 'test',
  };
}

function makeRequest(opts = {}) {
  return new Request('https://example.test/api/admin/me', {
    headers: opts.headers ?? {},
  });
}

describe('initializeLucia / session manager', () => {
  let rawDb;

  beforeEach(() => {
    rawDb = createTestDB();
  });

  // ── readSessionCookie ─────────────────────────────────────────────────────

  describe('readSessionCookie', () => {
    test('returns session ID from session_token cookie in dev/test', () => {
      const env = makeEnv(rawDb, { env: 'test' });
      const manager = initializeLucia(env.DB, makeRequest(), env);
      const id = manager.readSessionCookie('session_token=abc123; other=x');
      expect(id).toBe('abc123');
    });

    test('returns null when session cookie is absent', () => {
      const env = makeEnv(rawDb, { env: 'test' });
      const manager = initializeLucia(env.DB, makeRequest(), env);
      expect(manager.readSessionCookie('other=x')).toBeNull();
    });

    test('returns session ID from __Host-session_token in production', () => {
      const env = makeEnv(rawDb, { env: 'production' });
      const req = makeRequest({ headers: { Host: 'settimes.ca' } });
      const manager = initializeLucia(env.DB, req, env);
      const id = manager.readSessionCookie('__Host-session_token=prodid; other=x');
      expect(id).toBe('prodid');
    });
  });

  // ── createSession ─────────────────────────────────────────────────────────

  describe('createSession', () => {
    test('returns a session object with fresh:true and a string id', async () => {
      const env = makeEnv(rawDb);
      const manager = initializeLucia(env.DB, makeRequest(), env);
      const session = await manager.createSession(1, {});

      expect(typeof session.id).toBe('string');
      expect(session.id.length).toBeGreaterThan(8);
      expect(session.userId).toBe(1);
      expect(session.fresh).toBe(true);
      expect(session.expiresAt).toBeInstanceOf(Date);
    });

    test('stores the session in lucia_sessions with expires_at ~30 days out', async () => {
      const env = makeEnv(rawDb);
      const manager = initializeLucia(env.DB, makeRequest(), env);
      const before = Math.floor(Date.now() / 1000);
      const session = await manager.createSession(1, {});
      const after = Math.floor(Date.now() / 1000);

      const row = rawDb
        .prepare('SELECT * FROM lucia_sessions WHERE id = ?')
        .get(session.id);

      expect(row).not.toBeNull();
      expect(row.user_id).toBe(1);
      // expires_at must be approximately now + 30 days (unix seconds)
      const thirtyDays = 30 * 24 * 3600;
      expect(row.expires_at).toBeGreaterThanOrEqual(before + thirtyDays);
      expect(row.expires_at).toBeLessThanOrEqual(after + thirtyDays + 5);
    });
  });

  // ── validateSession ───────────────────────────────────────────────────────

  describe('validateSession', () => {
    async function seedSession(rawDb, userId = 1, offsetSeconds = 86400) {
      const id = crypto.randomUUID();
      const expiresAt = Math.floor(Date.now() / 1000) + offsetSeconds;
      rawDb
        .prepare(
          'INSERT INTO lucia_sessions (id, user_id, expires_at, created_at, last_activity_at) VALUES (?, ?, ?, datetime("now"), datetime("now"))'
        )
        .run(id, userId, expiresAt);
      return id;
    }

    test('returns session and user for a valid session', async () => {
      const env = makeEnv(rawDb);
      const manager = initializeLucia(env.DB, makeRequest(), env);
      const sessionId = await seedSession(rawDb, 1);

      const { session, user } = await manager.validateSession(sessionId);

      expect(session).not.toBeNull();
      expect(session.id).toBe(sessionId);
      expect(session.userId).toBe(1);
      expect(session.fresh).toBe(false);
      expect(session.expiresAt).toBeInstanceOf(Date);
      expect(user).not.toBeNull();
      expect(user.email).toBe('admin@test');
      expect(user.role).toBe('admin');
    });

    test('returns nulls for a non-existent session', async () => {
      const env = makeEnv(rawDb);
      const manager = initializeLucia(env.DB, makeRequest(), env);
      const { session, user } = await manager.validateSession('no-such-id');
      expect(session).toBeNull();
      expect(user).toBeNull();
    });

    test('returns nulls and deletes an expired session', async () => {
      const env = makeEnv(rawDb);
      const manager = initializeLucia(env.DB, makeRequest(), env);
      // expires_at in the past
      const id = await seedSession(rawDb, 1, -10);

      const { session, user } = await manager.validateSession(id);
      expect(session).toBeNull();
      expect(user).toBeNull();

      const row = rawDb.prepare('SELECT id FROM lucia_sessions WHERE id = ?').get(id);
      expect(row).toBeUndefined();
    });
  });

  // ── invalidateSession ─────────────────────────────────────────────────────

  describe('invalidateSession', () => {
    test('removes the session row', async () => {
      const env = makeEnv(rawDb);
      const manager = initializeLucia(env.DB, makeRequest(), env);
      const session = await manager.createSession(1, {});

      await manager.invalidateSession(session.id);

      const row = rawDb
        .prepare('SELECT id FROM lucia_sessions WHERE id = ?')
        .get(session.id);
      expect(row).toBeUndefined();
    });
  });

  // ── invalidateUserSessions ────────────────────────────────────────────────

  describe('invalidateUserSessions', () => {
    test('removes all sessions for a user', async () => {
      const env = makeEnv(rawDb);
      const manager = initializeLucia(env.DB, makeRequest(), env);
      await manager.createSession(1, {});
      await manager.createSession(1, {});
      await manager.createSession(2, {}); // different user — must survive

      await manager.invalidateUserSessions(1);

      const user1Rows = rawDb
        .prepare('SELECT id FROM lucia_sessions WHERE user_id = 1')
        .all();
      expect(user1Rows).toHaveLength(0);

      const user2Rows = rawDb
        .prepare('SELECT id FROM lucia_sessions WHERE user_id = 2')
        .all();
      expect(user2Rows).toHaveLength(1);
    });
  });

  // ── cookie serialization ──────────────────────────────────────────────────

  describe('createSessionCookie', () => {
    test('dev: serializes with session_token name, no Secure flag, SameSite=Lax', () => {
      const env = makeEnv(rawDb, { env: 'test' });
      const manager = initializeLucia(env.DB, makeRequest(), env);
      const cookie = manager.createSessionCookie('test-session-id').serialize();

      expect(cookie).toContain('session_token=test-session-id');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Max-Age=2592000');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie.toLowerCase()).not.toContain('secure');
      expect(cookie).not.toContain('__Host-');
    });

    test('prod: serializes with __Host-session_token, Secure, SameSite=Strict', () => {
      const env = makeEnv(rawDb, { env: 'production' });
      const req = makeRequest({ headers: { Host: 'settimes.ca' } });
      const manager = initializeLucia(env.DB, req, env);
      const cookie = manager.createSessionCookie('prod-session-id').serialize();

      expect(cookie).toContain('__Host-session_token=prod-session-id');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Max-Age=2592000');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Secure');
    });
  });

  describe('createBlankSessionCookie', () => {
    test('dev: serializes with Max-Age=0 to clear the cookie', () => {
      const env = makeEnv(rawDb, { env: 'test' });
      const manager = initializeLucia(env.DB, makeRequest(), env);
      const cookie = manager.createBlankSessionCookie().serialize();

      expect(cookie).toContain('session_token=');
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain('HttpOnly');
    });

    test('prod: serializes with __Host-session_token and Max-Age=0', () => {
      const env = makeEnv(rawDb, { env: 'production' });
      const req = makeRequest({ headers: { Host: 'settimes.ca' } });
      const manager = initializeLucia(env.DB, req, env);
      const cookie = manager.createBlankSessionCookie().serialize();

      expect(cookie).toContain('__Host-session_token=');
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain('Secure');
    });
  });
});
```

- [ ] **Step 2: Run the new tests (they should pass against current Lucia implementation)**

```bash
cd /path/to/settimesdotca
npx vitest run functions/utils/__tests__/auth.test.js
```

Expected: all tests pass. If any fail, the test itself has a bug — fix before proceeding.

- [ ] **Step 3: Commit the test file**

```bash
git add functions/utils/__tests__/auth.test.js
git commit -m "test(auth): add session manager characterisation tests"
```

---

## Task 2: Rewrite `functions/utils/auth.js`

**Files:**
- Modify: `functions/utils/auth.js`

- [ ] **Step 1: Replace the file contents**

```js
// functions/utils/auth.js

export const SESSION_CONFIG = {
  absoluteTimeout: 30 * 24 * 60 * 60 * 1000,
  idleTimeout: 30 * 60 * 1000,
  refreshThreshold: 15 * 60 * 1000,
  adminIdleTimeout: 15 * 60 * 1000,
  adminAbsoluteTimeout: 8 * 60 * 60 * 1000,
};

export function isDevRequest(request, env = null) {
  if (env?.ENVIRONMENT === 'production') return false;
  if (env?.ENVIRONMENT && env.ENVIRONMENT !== 'production') return true;
  if (!request) return false;
  const host = request.headers.get('Host') || '';
  const url = request.url || '';
  return host.includes('localhost') || url.includes('localhost');
}

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function serializeCookie(name, value, { secure, sameSite, maxAge }) {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', `SameSite=${sameSite}`, `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function initializeLucia(DB, request = null, env = null) {
  const isDev = request ? isDevRequest(request, env) : false;
  const cookieName = isDev ? 'session_token' : '__Host-session_token';
  const cookieOpts = {
    secure: !isDev,
    sameSite: isDev ? 'Lax' : 'Strict',
  };

  return {
    readSessionCookie(cookieHeader) {
      if (!cookieHeader) return null;
      for (const part of cookieHeader.split(';')) {
        const [k, ...rest] = part.trim().split('=');
        if (k.trim() === cookieName) return rest.join('=').trim() || null;
      }
      return null;
    },

    async validateSession(sessionId) {
      const row = await DB.prepare(
        `SELECT s.id, s.user_id, s.expires_at,
                u.email, u.role, u.name, u.first_name, u.last_name, u.is_active
         FROM lucia_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = ?`
      )
        .bind(sessionId)
        .first();

      if (!row) return { session: null, user: null };

      if (row.expires_at * 1000 < Date.now()) {
        await DB.prepare('DELETE FROM lucia_sessions WHERE id = ?').bind(sessionId).run();
        return { session: null, user: null };
      }

      return {
        session: {
          id: row.id,
          userId: row.user_id,
          fresh: false,
          expiresAt: new Date(row.expires_at * 1000),
        },
        user: {
          email: row.email,
          role: row.role,
          name: row.name,
          firstName: row.first_name,
          lastName: row.last_name,
          isActive: row.is_active,
        },
      };
    },

    async createSession(userId) {
      const id = crypto.randomUUID();
      const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
      await DB.prepare(
        `INSERT INTO lucia_sessions (id, user_id, expires_at, created_at, last_activity_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))`
      )
        .bind(id, userId, expiresAt)
        .run();
      return { id, userId, fresh: true, expiresAt: new Date(expiresAt * 1000) };
    },

    async invalidateSession(sessionId) {
      await DB.prepare('DELETE FROM lucia_sessions WHERE id = ?').bind(sessionId).run();
    },

    async invalidateUserSessions(userId) {
      await DB.prepare('DELETE FROM lucia_sessions WHERE user_id = ?').bind(userId).run();
    },

    createSessionCookie(sessionId) {
      return {
        serialize: () => serializeCookie(cookieName, sessionId, { ...cookieOpts, maxAge: SESSION_TTL_SECONDS }),
      };
    },

    createBlankSessionCookie() {
      return {
        serialize: () => serializeCookie(cookieName, '', { ...cookieOpts, maxAge: 0 }),
      };
    },
  };
}
```

- [ ] **Step 2: Run the new auth tests**

```bash
npx vitest run functions/utils/__tests__/auth.test.js
```

Expected: all tests pass.

- [ ] **Step 3: Run the full backend test suite**

```bash
npm test
```

Expected: all tests pass. If any test fails, investigate — do not proceed to package removal until the suite is green.

- [ ] **Step 4: Commit**

```bash
git add functions/utils/auth.js
git commit -m "refactor(auth): replace lucia with direct D1 session manager"
```

---

## Task 3: Remove the deprecated packages

**Files:**
- Modify: `package.json`
- Updated automatically: `package-lock.json`

- [ ] **Step 1: Remove the packages**

```bash
npm uninstall lucia @lucia-auth/adapter-sqlite
```

This updates both `package.json` and `package-lock.json`.

- [ ] **Step 2: Confirm the packages are gone**

```bash
grep -E "lucia" package.json
```

Expected: no output.

- [ ] **Step 3: Run the full test suite one final time**

```bash
npm test
```

Expected: all tests pass. The `npm warn deprecated` lines must be absent from the install output.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove deprecated lucia and adapter-sqlite packages"
```

---

## Task 4: Open the PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin chore/lucia-migration
```

- [ ] **Step 2: Create the PR**

```bash
gh pr create \
  --title "chore(auth): replace deprecated Lucia v3 with direct D1 session manager" \
  --body "$(cat <<'EOF'
## Summary

Removes `lucia@3.2.2` and `@lucia-auth/adapter-sqlite@3.0.2` (both deprecated upstream) and replaces them with a drop-in session manager that calls D1 directly.

- `initializeLucia()` keeps its exact name and return shape — zero changes to any caller
- `lucia_sessions` table schema is unchanged — no DB migration
- 7 Lucia methods replaced with equivalent D1 queries and `crypto.randomUUID()`
- `session.fresh` contract preserved: `true` on `createSession`, `false` on `validateSession`
- Cookie names and attributes identical to Lucia's output

## Validation

- [ ] Backend unit tests pass (`npm test`)
- [ ] Manual smoke: login → reload → logout in `wrangler dev`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Manual smoke test checklist (after PR is merged to dev)

Run `npm run pages:dev` and open `http://localhost:5173/admin` in a browser.

- [ ] Log in with a valid admin account — confirm redirect to admin dashboard
- [ ] Reload the page — confirm session persists (no redirect to login)
- [ ] Log out — confirm redirected to login, `session_token` cookie is cleared (check DevTools → Application → Cookies)
- [ ] Try accessing `/admin` again without logging in — confirm 401 / redirect to login
