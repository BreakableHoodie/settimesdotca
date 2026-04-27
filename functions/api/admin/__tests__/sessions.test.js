import { describe, expect, test } from 'vitest';
import { createTestEnv, mockUsers } from '../../test-utils.js';
import { onRequestGet } from '../sessions.js';

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
    expect(
      payload.sessions.every((session) => !Object.hasOwn(session, 'id'))
    ).toBe(true);
    expect(
      payload.sessions.every(
        (session) => !Object.hasOwn(session, 'session_token')
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
