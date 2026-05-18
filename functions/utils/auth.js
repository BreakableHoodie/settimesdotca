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
          id: row.user_id,
          email: row.email,
          role: row.role,
          name: row.name,
          firstName: row.first_name,
          lastName: row.last_name,
          isActive: row.is_active,
        },
      };
    },

    async createSession(userId, _attributes = {}) {
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
