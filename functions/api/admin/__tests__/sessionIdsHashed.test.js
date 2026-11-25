// Session ids and MFA challenge tokens are stored hashed (#1488).
//
// The cookie and the login response carry the raw value; lucia_sessions.id and
// mfa_challenges.token hold hashStoredToken(value). Every lookup hashes what was
// submitted, so a stored value (read from D1 or a leaked export) submitted back
// is hashed again and matches nothing. These tests drive the real handlers and
// the real middleware, never a mocked lucia.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { createTestDB, createDBEnv, createTestEnv, mockUsers, testSessionKey } from "../../test-utils.js";
import { hashPassword } from "../../../utils/crypto.js";
import { generateCSRFToken } from "../../../utils/csrf.js";
import { generateTotpCode } from "../../../utils/totp.js";
import { onRequest } from "../_middleware.js";
import * as loginHandler from "../auth/login.js";
import * as logoutHandler from "../auth/logout.js";
import * as mfaVerifyHandler from "../auth/mfa/verify.js";
import * as sessionsHandler from "../sessions.js";
import * as revokeAllHandler from "../sessions/revoke-all.js";

const TEST_PASSWORD = "session-hash-test-password";
const SECRET = "JBSWY3DPEHPK3PXP";
let passwordHash;

beforeAll(async () => {
  passwordHash = await hashPassword(TEST_PASSWORD);
}, 30_000);

const storedIds = (rawDb) =>
  rawDb
    .prepare("SELECT id FROM lucia_sessions")
    .all()
    .map((r) => r.id);

const cookieValue = (response, name) => {
  const cookie = response.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  return cookie ? cookie.split(";")[0].slice(name.length + 1) : null;
};

function freshEnv({ totp = false } = {}) {
  const rawDb = createTestDB();
  rawDb
    .prepare(
      `INSERT INTO users (email, password_hash, role, is_active, activated_at, name, totp_enabled, totp_secret)
       VALUES ('hash-user@test', ?, 'viewer', 1, '2025-01-01 00:00:00', 'Hash User', ?, ?)`,
    )
    .run(passwordHash, totp ? 1 : 0, totp ? SECRET : null);
  const userId = rawDb.prepare("SELECT id FROM users WHERE email = 'hash-user@test'").get().id;
  return {
    rawDb,
    userId,
    env: { DB: createDBEnv(rawDb), ENVIRONMENT: "test", CSRF_SECRET: "test-csrf-secret-for-unit-tests" },
  };
}

function login(env) {
  return loginHandler.onRequestPost({
    request: new Request("https://example.test/api/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4", "User-Agent": "t" },
      body: JSON.stringify({ email: "hash-user@test", password: TEST_PASSWORD }),
    }),
    env,
  });
}

function verifyMfa(env, mfaToken, code) {
  return mfaVerifyHandler.onRequestPost({
    request: new Request("https://example.test/api/admin/auth/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4", "User-Agent": "t" },
      body: JSON.stringify({ mfaToken, code }),
    }),
    env,
  });
}

// Through the real admin middleware, with the session in the cookie.
async function viaMiddleware(env, { token, method = "GET", csrf = null, url = "https://example.test/api/admin/me" }) {
  const cookies = [`session_token=${token}`];
  const headers = { "CF-Connecting-IP": "1.2.3.4" };
  if (csrf) {
    cookies.push(`csrf_token=${csrf}`);
    headers["X-CSRF-Token"] = csrf;
  }
  headers.Cookie = cookies.join("; ");
  const next = vi.fn(async () => new Response("ok", { status: 200 }));
  const context = { request: new Request(url, { method, headers }), env, data: {}, params: {} };
  context.next = () => next(context);
  const response = await onRequest(context);
  return { response, next, context };
}

describe("login and MFA verify store only digests (#1488)", () => {
  test("password login: the cookie holds the token, the row its digest, and only the token authenticates", async () => {
    const { env, rawDb, userId } = freshEnv();
    const response = await login(env);
    expect(response.status).toBe(200);

    const token = cookieValue(response, "session_token");
    expect(token).toBeTruthy();
    expect(token).not.toMatch(/^sha256:/);
    expect(storedIds(rawDb)).toEqual([testSessionKey(token)]);

    const authed = await viaMiddleware(env, { token });
    expect(authed.response.status).toBe(200);
    expect(authed.context.data.user.userId).toBe(userId);
    const replay = await viaMiddleware(env, { token: testSessionKey(token) });
    expect(replay.response.status).toBe(401);
    expect(replay.next).not.toHaveBeenCalled();
    // The refused replay deleted nothing.
    expect(storedIds(rawDb)).toEqual([testSessionKey(token)]);
  });

  test("MFA: the challenge is stored as a digest; the digest submitted back is refused, the token works", async () => {
    const { env, rawDb, userId } = freshEnv({ totp: true });
    const first = await login(env);
    const { mfaToken } = await first.json();
    expect(mfaToken).toBeTruthy();
    expect(
      rawDb
        .prepare("SELECT token FROM mfa_challenges")
        .all()
        .map((r) => r.token),
    ).toEqual([testSessionKey(mfaToken)]);

    const code = await generateTotpCode(SECRET);
    const replay = await verifyMfa(env, testSessionKey(mfaToken), code);
    expect(replay.status).toBe(401);
    expect(storedIds(rawDb)).toEqual([]);
    expect(rawDb.prepare("SELECT used FROM mfa_challenges").get().used).toBe(0);

    const ok = await verifyMfa(env, mfaToken, code);
    expect(ok.status).toBe(200);
    const token = cookieValue(ok, "session_token");
    expect(token).not.toMatch(/^sha256:/);
    expect(storedIds(rawDb)).toEqual([testSessionKey(token)]);
    const authed = await viaMiddleware(env, { token });
    expect(authed.response.status).toBe(200);
    expect(authed.context.data.user.userId).toBe(userId);
  });

  test("a second login still invalidates the first session before creating its own", async () => {
    const { env, rawDb } = freshEnv();
    const firstToken = cookieValue(await login(env), "session_token");
    const secondToken = cookieValue(await login(env), "session_token");
    expect(storedIds(rawDb)).toEqual([testSessionKey(secondToken)]);
    expect((await viaMiddleware(env, { token: firstToken })).response.status).toBe(401);
  });

  test("logout deletes the row keyed by the cookie's digest", async () => {
    const { env, rawDb } = freshEnv();
    const token = cookieValue(await login(env), "session_token");
    const response = await logoutHandler.onRequestPost({
      request: new Request("https://example.test/api/admin/auth/logout", {
        method: "POST",
        headers: { Cookie: `session_token=${token}`, "CF-Connecting-IP": "1.2.3.4" },
      }),
      env,
    });
    expect(response.status).toBe(200);
    expect(storedIds(rawDb)).toEqual([]);
  });
});

describe("CSRF stays bound to the cookie token (#1488)", () => {
  test("a CSRF token minted for the session token validates on a mutating request", async () => {
    const { env, sessionId } = createTestEnv({ role: "viewer" });
    const request = new Request("https://example.test/api/admin/x", { method: "POST" });
    const csrf = generateCSRFToken(request, env, sessionId);
    const { response, next } = await viaMiddleware(env, {
      token: sessionId,
      method: "POST",
      csrf,
      url: "https://example.test/api/admin/sessions/revoke-all",
    });
    expect(next).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  test("a CSRF token bound to the stored digest is refused", async () => {
    const { env, sessionId, sessionKey } = createTestEnv({ role: "viewer" });
    const request = new Request("https://example.test/api/admin/x", { method: "POST" });
    const csrf = generateCSRFToken(request, env, sessionKey);
    const { response, next } = await viaMiddleware(env, {
      token: sessionId,
      method: "POST",
      csrf,
      url: "https://example.test/api/admin/sessions/revoke-all",
    });
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });

  test("the middleware's freshly issued CSRF cookie is bound to the token, so it validates next time", async () => {
    const { env, sessionId } = createTestEnv({ role: "viewer" });
    const first = await viaMiddleware(env, { token: sessionId });
    expect(first.response.status).toBe(200);
    const csrf = cookieValue(first.response, "csrf_token");
    expect(csrf).toBeTruthy();
    const second = await viaMiddleware(env, {
      token: sessionId,
      method: "POST",
      csrf,
      url: "https://example.test/api/admin/sessions/revoke-all",
    });
    expect(second.next).toHaveBeenCalled();
  });
});

describe("session management by stored key (#1488)", () => {
  test("the sessions list marks the current session, and revoke-one removes exactly the target", async () => {
    const { env, rawDb, sessionId, sessionKey } = createTestEnv({ role: "viewer" });
    const other = crypto.randomUUID();
    rawDb
      .prepare("INSERT INTO lucia_sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, 'other-device')")
      .run(testSessionKey(other), mockUsers.viewer.id, Math.floor(Date.now() / 1000) + 3600);

    const list = await viaMiddleware(env, { token: sessionId, url: "https://example.test/api/admin/sessions" });
    list.context.next = () => sessionsHandler.onRequestGet(list.context);
    const listResponse = await onRequest(list.context);
    const { sessions } = await listResponse.json();
    expect(sessions).toHaveLength(2);
    expect(sessions.find((s) => s.current).user_agent).toBe("test-agent");
    const target = sessions.find((s) => s.user_agent === "other-device");
    expect(target.current).toBe(false);
    expect(JSON.stringify(sessions)).not.toContain(sessionKey);

    const csrf = generateCSRFToken(new Request("https://example.test/"), env, sessionId);
    const delContext = {
      env,
      params: {},
      request: new Request("https://example.test/api/admin/sessions", {
        method: "DELETE",
        headers: {
          Cookie: `session_token=${sessionId}; csrf_token=${csrf}`,
          "X-CSRF-Token": csrf,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ revocationToken: target.revocationToken }),
      }),
      data: {},
    };
    delContext.next = () => sessionsHandler.onRequestDelete(delContext);
    expect((await onRequest(delContext)).status).toBe(200);
    expect(storedIds(rawDb)).toEqual([sessionKey]);
  });

  test("revoke-all leaves exactly one new digest-keyed session, and the old token is dead", async () => {
    const { env, rawDb, sessionId } = createTestEnv({ role: "viewer" });
    const csrf = generateCSRFToken(new Request("https://example.test/"), env, sessionId);
    const call = await viaMiddleware(env, {
      token: sessionId,
      method: "POST",
      csrf,
      url: "https://example.test/api/admin/sessions/revoke-all",
    });
    call.context.next = () => revokeAllHandler.onRequestPost(call.context);
    call.context.data = {};
    const response = await onRequest(call.context);
    expect(response.status).toBe(200);
    const newToken = cookieValue(response, "session_token");
    expect(storedIds(rawDb)).toEqual([testSessionKey(newToken)]);
    expect((await viaMiddleware(env, { token: sessionId })).response.status).toBe(401);
    expect((await viaMiddleware(env, { token: newToken })).response.status).toBe(200);
  });
});

// Source guard: every writer of a session id or challenge token hashes it. The
// triggers from migration 0084 refuse an unhashed value at the database; this
// names the writer at build time and fails when a new one appears.
describe("only the known writers insert session ids or MFA challenge tokens", () => {
  const FUNCTIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (name === "__tests__" || name === "node_modules") return [];
      if (statSync(full).isDirectory()) return walk(full);
      return /\.(js|mjs|ts)$/.test(name) && !full.endsWith("test-utils.js") ? [full] : [];
    });
  const writers = (pattern) =>
    walk(FUNCTIONS)
      .filter((file) => pattern.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(FUNCTIONS, file))
      .sort();

  test("the scan's patterns still match the shapes they hunt", () => {
    expect(/INSERT\s+INTO\s+lucia_sessions/i.test("INSERT INTO lucia_sessions (id)")).toBe(true);
    expect(/INSERT\s+INTO\s+mfa_challenges/i.test("INSERT  INTO mfa_challenges (token)")).toBe(true);
  });

  test("lucia_sessions is inserted only by createSession, which stores the digest", () => {
    expect(writers(/INSERT\s+INTO\s+lucia_sessions/i)).toEqual(["utils/auth.js"]);
    const src = readFileSync(path.join(FUNCTIONS, "utils/auth.js"), "utf8");
    expect(src).toMatch(/const id = await hashSessionToken\(token\);/);
    expect(src).toMatch(/\.bind\(id, userId, expiresAt\)/);
  });

  test("mfa_challenges is inserted only by login, which binds the digest", () => {
    expect(writers(/INSERT\s+INTO\s+mfa_challenges/i)).toEqual(["api/admin/auth/login.js"]);
    const src = readFileSync(path.join(FUNCTIONS, "api/admin/auth/login.js"), "utf8");
    expect(src).toMatch(/\.bind\(await hashStoredToken\(mfaToken\), user\.id,/);
  });
});
