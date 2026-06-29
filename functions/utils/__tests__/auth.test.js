// functions/utils/__tests__/auth.test.js
import { describe, test, expect, beforeEach } from 'vitest';
import { createTestDB, createDBEnv, mockUsers } from '../../api/test-utils.js';
import { initializeLucia, isDevRequest } from '../auth.js';

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

describe('isDevRequest', () => {
  const localhostRequest = new Request('http://localhost:8788/api/x', {
    headers: { Host: 'localhost:8788' },
  });
  const prodRequest = new Request('https://settimes.ca/api/x', {
    headers: { Host: 'settimes.ca' },
  });

  test('returns false when ENVIRONMENT is "production"', () => {
    expect(isDevRequest(prodRequest, { ENVIRONMENT: 'production' })).toBe(false);
  });

  test('returns true when ENVIRONMENT is "development"', () => {
    expect(isDevRequest(localhostRequest, { ENVIRONMENT: 'development' })).toBe(true);
  });

  test('returns true when ENVIRONMENT is "test"', () => {
    expect(isDevRequest(localhostRequest, { ENVIRONMENT: 'test' })).toBe(true);
  });

  test('returns false for a deployed non-allowlisted ENVIRONMENT like "staging" (secure by default)', () => {
    expect(isDevRequest(prodRequest, { ENVIRONMENT: 'staging' })).toBe(false);
  });

  test('fails CLOSED (secure) for a typo / case / whitespace variant of "production"', () => {
    // A misconfigured prod ENVIRONMENT value must never downgrade to insecure dev mode.
    expect(isDevRequest(prodRequest, { ENVIRONMENT: 'Production' })).toBe(false);
    expect(isDevRequest(prodRequest, { ENVIRONMENT: 'PRODUCTION' })).toBe(false);
    expect(isDevRequest(prodRequest, { ENVIRONMENT: 'prod' })).toBe(false);
    expect(isDevRequest(prodRequest, { ENVIRONMENT: 'production\n' })).toBe(false);
    expect(isDevRequest(prodRequest, { ENVIRONMENT: '  production  ' })).toBe(false);
  });

  test('returns false when ENVIRONMENT is unset ({}), even for a localhost Host/url (#425 security)', () => {
    // The Host header is client-controlled — trusting it when env is unset would let
    // an attacker coerce a misconfigured deploy into dev (insecure) cookie behavior.
    expect(isDevRequest(localhostRequest, {})).toBe(false);
  });

  test('returns false when env is null, even for a localhost request', () => {
    expect(isDevRequest(localhostRequest, null)).toBe(false);
  });

  test('returns false when called without env argument (isDevRequest(request))', () => {
    expect(isDevRequest(localhostRequest)).toBe(false);
  });
});

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
      const session = await manager.createSession(mockUsers.admin.id, {});

      expect(typeof session.id).toBe('string');
      expect(session.id.length).toBeGreaterThan(8);
      expect(session.userId).toBe(mockUsers.admin.id);
      expect(session.fresh).toBe(true);
      expect(session.expiresAt).toBeInstanceOf(Date);
    });

    test('stores the session in lucia_sessions with expires_at ~30 days out', async () => {
      const env = makeEnv(rawDb);
      const manager = initializeLucia(env.DB, makeRequest(), env);
      const before = Math.floor(Date.now() / 1000);
      const session = await manager.createSession(mockUsers.admin.id, {});
      const after = Math.floor(Date.now() / 1000);

      const row = rawDb
        .prepare('SELECT * FROM lucia_sessions WHERE id = ?')
        .get(session.id);

      expect(row).not.toBeNull();
      expect(row.user_id).toBe(mockUsers.admin.id);
      // expires_at must be approximately now + 30 days (unix seconds)
      const thirtyDays = 30 * 24 * 3600;
      expect(row.expires_at).toBeGreaterThanOrEqual(before + thirtyDays);
      expect(row.expires_at).toBeLessThanOrEqual(after + thirtyDays + 5);
    });
  });

  // ── validateSession ───────────────────────────────────────────────────────

  describe('validateSession', () => {
    async function seedSession(rawDb, userId = 1, offsetSeconds = 20 * 86400) {
      const id = crypto.randomUUID();
      const expiresAt = Math.floor(Date.now() / 1000) + offsetSeconds;
      rawDb
        .prepare(
          "INSERT INTO lucia_sessions (id, user_id, expires_at, created_at, last_activity_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))"
        )
        .run(id, userId, expiresAt);
      return id;
    }

    test('returns session and user for a valid session', async () => {
      const env = makeEnv(rawDb);
      const manager = initializeLucia(env.DB, makeRequest(), env);
      const sessionId = await seedSession(rawDb, mockUsers.admin.id);

      const { session, user } = await manager.validateSession(sessionId);

      expect(session).not.toBeNull();
      expect(session.id).toBe(sessionId);
      expect(session.userId).toBe(mockUsers.admin.id);
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
      const id = await seedSession(rawDb, mockUsers.admin.id, -10);

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
      const session = await manager.createSession(mockUsers.admin.id, {});

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
      await manager.createSession(mockUsers.admin.id, {});
      await manager.createSession(mockUsers.admin.id, {});
      await manager.createSession(mockUsers.editor.id, {}); // different user — must survive

      await manager.invalidateUserSessions(mockUsers.admin.id);

      const user1Rows = rawDb
        .prepare('SELECT id FROM lucia_sessions WHERE user_id = ?')
        .all(mockUsers.admin.id);
      expect(user1Rows).toHaveLength(0);

      const user2Rows = rawDb
        .prepare('SELECT id FROM lucia_sessions WHERE user_id = ?')
        .all(mockUsers.editor.id);
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
