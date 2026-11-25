import { parseCookies } from "./cookies.js";
import { hashStoredToken, STORED_TOKEN_HASH_PREFIX } from "./tokens.js";

export const SESSION_CONFIG = {
  absoluteTimeout: 30 * 24 * 60 * 60 * 1000,
  idleTimeout: 30 * 60 * 1000,
  adminIdleTimeout: 15 * 60 * 1000,
  adminAbsoluteTimeout: 8 * 60 * 60 * 1000,
};

export function isDevRequest(request, env = null) {
  // Secure by default: dev (insecure-over-http cookie / CSRF)
  // behavior is enabled ONLY for an explicit, known dev ENVIRONMENT value.
  // Everything else fails CLOSED to secure — production, a typo/case/whitespace
  // variant of the prod value ("Production", "prod", " production\n"), an
  // unexpected value, or unset. We never trust the client-controlled Host
  // header to decide this. (#425)
  const environment = (env?.ENVIRONMENT ?? "").trim().toLowerCase();
  return environment === "development" || environment === "dev" || environment === "test";
}

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function serializeCookie(name, value, { secure, sameSite, maxAge }) {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", `SameSite=${sameSite}`, `Max-Age=${maxAge}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

// Both names are exported because callers outside session handling need to detect
// the presence of a session cookie WITHOUT knowing which environment they are in --
// the admin middleware's dual-auth rejection checks for either. A private literal
// here plus a copy at that call site is how the two drift apart.
export const SESSION_COOKIE_NAME_DEV = "session_token";
export const SESSION_COOKIE_NAME_PROD = "__Host-session_token";
export const SESSION_COOKIE_NAMES = [SESSION_COOKIE_NAME_DEV, SESSION_COOKIE_NAME_PROD];

// Session ids are stored hashed (#1488). The cookie holds the raw token; the
// lucia_sessions row is keyed by hashStoredToken(token). So there are two values
// and they must never be swapped:
//   - the TOKEN (raw): only in the cookie, the CSRF binding and createSessionCookie.
//   - the KEY (digest): session.id, context.data.session.id, every
//     `WHERE id = ?` on lucia_sessions, and invalidateSession.
// validateSession hashes what it is given, so a stored key submitted as a cookie
// is hashed again and matches nothing. invalidateSession and createSessionCookie
// throw on the wrong kind, because a mix-up would otherwise be a silent no-op
// DELETE or a cookie that can never authenticate.
export const hashSessionToken = hashStoredToken;

const isSessionKey = (value) => typeof value === "string" && value.startsWith(STORED_TOKEN_HASH_PREFIX);

export function initializeLucia(DB, request = null, env = null) {
  const isDev = request ? isDevRequest(request, env) : false;
  const cookieName = isDev ? SESSION_COOKIE_NAME_DEV : SESSION_COOKIE_NAME_PROD;
  const cookieOpts = {
    secure: !isDev,
    sameSite: isDev ? "Lax" : "Strict",
  };

  return {
    // Delegates to the shared parser rather than keeping a correct-but-separate copy.
    // This one was already right; that is exactly why it was dangerous -- being right
    // while three others were wrong is what let the divergence go unnoticed for so long.
    readSessionCookie(cookieHeader) {
      return parseCookies(cookieHeader)[cookieName] || null;
    },

    async validateSession(sessionToken) {
      const sessionKey = await hashSessionToken(sessionToken);
      const row = await DB.prepare(
        `SELECT s.id, s.user_id, s.expires_at,
                u.email, u.role, u.name, u.first_name, u.last_name, u.is_active, u.totp_enabled
         FROM lucia_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = ?`,
      )
        .bind(sessionKey)
        .first();

      if (!row) return { session: null, user: null };

      if (row.expires_at * 1000 < Date.now()) {
        await DB.prepare("DELETE FROM lucia_sessions WHERE id = ?").bind(sessionKey).run();
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
          mfaEnabled: Number(row.totp_enabled) === 1,
        },
      };
    },

    // Returns { id: the stored key, token: the raw value for the cookie }.
    async createSession(userId, _attributes = {}) {
      const token = crypto.randomUUID();
      const id = await hashSessionToken(token);
      const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
      await DB.prepare(
        `INSERT INTO lucia_sessions (id, user_id, expires_at, created_at, last_activity_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
      )
        .bind(id, userId, expiresAt)
        .run();
      return { id, token, userId, fresh: true, expiresAt: new Date(expiresAt * 1000) };
    },

    // Takes the stored KEY (session.id), never the cookie token.
    async invalidateSession(sessionKey) {
      if (!isSessionKey(sessionKey)) throw new Error("invalidateSession takes a stored session key, not a token");
      await DB.prepare("DELETE FROM lucia_sessions WHERE id = ?").bind(sessionKey).run();
    },

    async invalidateUserSessions(userId) {
      await DB.prepare("DELETE FROM lucia_sessions WHERE user_id = ?").bind(userId).run();
    },

    // Takes the raw TOKEN (session.token), never the stored key.
    createSessionCookie(sessionToken) {
      if (typeof sessionToken !== "string" || !sessionToken || isSessionKey(sessionToken)) {
        throw new Error("createSessionCookie takes a session token, not a stored key");
      }
      return {
        serialize: () => serializeCookie(cookieName, sessionToken, { ...cookieOpts, maxAge: SESSION_TTL_SECONDS }),
      };
    },

    createBlankSessionCookie() {
      return {
        serialize: () => serializeCookie(cookieName, "", { ...cookieOpts, maxAge: 0 }),
      };
    },
  };
}
