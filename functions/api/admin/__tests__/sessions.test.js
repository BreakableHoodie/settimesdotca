import { describe, expect, test } from 'vitest';
import { createTestEnv, mockUsers } from '../../test-utils.js';
import { onRequestGet, onRequestDelete } from '../sessions.js';

const BASE_URL = 'https://example.test/api/admin/sessions';

function insertSession(
  rawDb,
  { userId, ipAddress = '127.0.0.1', userAgent = 'test-agent' } = {}
) {
  const sessionId = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;

  rawDb
    .prepare(
      'INSERT INTO lucia_sessions (id, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)'
    )
    .run(sessionId, userId, expiresAt, ipAddress, userAgent);

  return rawDb
    .prepare('SELECT * FROM lucia_sessions WHERE id = ?')
    .get(sessionId);
}

describe('GET /api/admin/sessions', () => {
  test('returns safe session metadata without exposing raw session identifiers', async () => {
    const { env, rawDb } = createTestEnv({ role: 'editor' });
    const currentSession = rawDb
      .prepare('SELECT id FROM lucia_sessions WHERE user_id = ? LIMIT 1')
      .get(mockUsers.editor.id);

    insertSession(rawDb, {
      userId: mockUsers.editor.id,
      ipAddress: '10.0.0.2',
      userAgent: 'secondary-agent',
    });
    insertSession(rawDb, {
      userId: mockUsers.admin.id,
      ipAddress: '10.0.0.99',
    });

    const response = await onRequestGet({
      request: new Request(BASE_URL),
      env,
      data: {
        user: {
          userId: String(mockUsers.editor.id),
          role: 'editor',
          email: mockUsers.editor.email,
        },
        session: { id: currentSession.id },
      },
    });

    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload).not.toHaveProperty('currentSessionId');
    expect(payload.sessions).toHaveLength(2);
    expect(payload.sessions.filter((session) => session.current)).toHaveLength(
      1
    );
    // Raw session identifiers must not be exposed
    expect(
      payload.sessions.every((session) => !Object.hasOwn(session, 'id'))
    ).toBe(true);
    expect(
      payload.sessions.every(
        (session) => !Object.hasOwn(session, 'session_token')
      )
    ).toBe(true);
    // Opaque revocation token must be present for each session
    expect(
      payload.sessions.every((session) =>
        /^[0-9a-f]{64}$/.test(session.revocationToken)
      )
    ).toBe(true);
    expect(
      payload.sessions.some((session) => session.ip_address === '10.0.0.2')
    ).toBe(true);
    expect(
      payload.sessions.every(
        (session) => typeof session.expires_at === 'string'
      )
    ).toBe(true);
  });
});

describe('DELETE /api/admin/sessions', () => {
  test('revokes a specific session using its opaque revocation token', async () => {
    const { env, rawDb } = createTestEnv({ role: 'editor' });

    // Insert a second session to be revoked
    const sessionToRevoke = insertSession(rawDb, {
      userId: mockUsers.editor.id,
      ipAddress: '10.0.0.5',
      userAgent: 'other-browser',
    });

    // Obtain the revocation token via the GET endpoint
    const getResponse = await onRequestGet({
      request: new Request(BASE_URL),
      env,
      data: {
        user: {
          userId: String(mockUsers.editor.id),
          role: 'editor',
          email: mockUsers.editor.email,
        },
        session: { id: crypto.randomUUID() }, // different from both, so neither is "current"
      },
    });
    const { sessions } = await getResponse.json();
    const target = sessions.find((s) => s.user_agent === 'other-browser');
    expect(target).toBeDefined();
    expect(target.revocationToken).toMatch(/^[0-9a-f]{64}$/);

    const invalidated = [];
    const mockLucia = { invalidateSession: async (id) => invalidated.push(id) };

    const deleteResponse = await onRequestDelete({
      request: new Request(BASE_URL, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revocationToken: target.revocationToken }),
      }),
      env,
      data: {
        lucia: mockLucia,
        user: { userId: String(mockUsers.editor.id) },
      },
    });

    expect(deleteResponse.status).toBe(200);
    const deletePayload = await deleteResponse.json();
    expect(deletePayload.success).toBe(true);
    expect(invalidated).toHaveLength(1);
    expect(invalidated[0]).toBe(sessionToRevoke.id);
  });

  test('returns 404 when revocation token does not match any session', async () => {
    const { env } = createTestEnv({ role: 'editor' });
    const mockLucia = { invalidateSession: async () => {} };

    const response = await onRequestDelete({
      request: new Request(BASE_URL, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revocationToken: 'a'.repeat(64) }),
      }),
      env,
      data: {
        lucia: mockLucia,
        user: { userId: String(mockUsers.editor.id) },
      },
    });

    expect(response.status).toBe(404);
  });

  test('returns 400 when revocation token is missing', async () => {
    const { env } = createTestEnv({ role: 'editor' });
    const mockLucia = { invalidateSession: async () => {} };

    const response = await onRequestDelete({
      request: new Request(BASE_URL, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      env,
      data: {
        lucia: mockLucia,
        user: { userId: String(mockUsers.editor.id) },
      },
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toContain('Revocation token');
  });
});
