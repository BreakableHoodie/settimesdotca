import { describe, expect, it, vi } from "vitest";

import { onRequest, checkPermission } from "../_middleware.js";
import { createTestEnv } from "../../test-utils.js";
import { generateApiKey, verifyApiKey } from "../../../utils/apiKeys.js";
import { toSqliteDateTime } from "../../../utils/authAttempts.js";

const BASE_URL = "https://example.test/api/admin/me";
const API_KEYS_URL = "https://example.test/api/admin/api-keys";

async function seedKey(
  rawDb,
  {
    role = "viewer",
    created_by = 1,
    expiresAt = null,
    revokedAt = null,
    name = "Test key",
    keyHashOverride = null,
  } = {},
) {
  const generated = await generateApiKey(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  const storedExpiresAt = expiresAt instanceof Date ? toSqliteDateTime(expiresAt) : expiresAt || generated.expiresAt;

  const info = rawDb
    .prepare(
      "INSERT INTO api_keys (name, key_prefix, key_hash, role, created_by, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?)",
    )
    .run(name, generated.keyPrefix, keyHashOverride || generated.keyHash, role, created_by, storedExpiresAt, revokedAt);

  return {
    plaintext: generated.plaintext,
    id: info.lastInsertRowid,
    keyPrefix: generated.keyPrefix,
    keyHash: keyHashOverride || generated.keyHash,
  };
}

function keyRequest(plaintext, { method = "GET", url = BASE_URL, cookie = null, body = undefined } = {}) {
  const headers = { Authorization: `Bearer ${plaintext}` };
  if (cookie) headers["Cookie"] = cookie;
  return new Request(url, { method, headers, body });
}

async function runMiddleware(env, request, nextImpl) {
  const context = { request, env, data: {} };
  context.next = nextImpl ? async () => nextImpl(context) : async () => new Response("ok", { status: 200 });
  const response = await onRequest(context);
  return { response, context };
}

const okNext = async () => new Response("ok", { status: 200 });
const adminGuardNext = async (ctx) => {
  const perm = await checkPermission(ctx, "admin");
  return perm.error ? perm.response : new Response("ok", { status: 200 });
};

describe("API key authentication path (#744 part 3)", () => {
  it("authenticates a valid key and reaches the endpoint", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const key = await seedKey(rawDb, { role: "viewer" });

    const { response, context } = await runMiddleware(env, keyRequest(key.plaintext), okNext);

    expect(response.status).toBe(200);
    expect(context.data.authenticated).toBe(true);
    expect(context.data.user.userId).toBe(1);
    expect(context.data.apiKey.id).toBe(key.id);
  });

  it("a viewer key gets 403 from an admin-only endpoint even though its creator is an admin", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const key = await seedKey(rawDb, { role: "viewer", created_by: 1 });

    const { response } = await runMiddleware(
      env,
      keyRequest(key.plaintext, { method: "POST", url: API_KEYS_URL }),
      adminGuardNext,
    );

    expect(response.status).toBe(403);
  });

  it("an editor key cannot reach an admin-only endpoint", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const key = await seedKey(rawDb, { role: "editor", created_by: 1 });

    const { response } = await runMiddleware(
      env,
      keyRequest(key.plaintext, { method: "POST", url: API_KEYS_URL }),
      adminGuardNext,
    );

    expect(response.status).toBe(403);
  });

  it("a revoked key is rejected on the very next request — no TTL", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const key = await seedKey(rawDb, { role: "viewer" });

    const { response: beforeRevoke } = await runMiddleware(env, keyRequest(key.plaintext), okNext);
    expect(beforeRevoke.status).toBe(200);

    rawDb.prepare("UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ?").run(key.id);

    const { response: afterRevoke } = await runMiddleware(env, keyRequest(key.plaintext), okNext);
    expect(afterRevoke.status).toBe(401);
    const body = await afterRevoke.json();
    expect(body.code).toBe("INVALID_API_KEY");
  });

  it("an expired key is rejected — space-separated expiry", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const key = await seedKey(rawDb, {
      role: "viewer",
      expiresAt: toSqliteDateTime(new Date(Date.now() - 60 * 1000)),
    });

    const { response } = await runMiddleware(env, keyRequest(key.plaintext), okNext);
    expect(response.status).toBe(401);
  });

  it("an expired key with a T-separator is NOT treated as far-future", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });

    const generated = await generateApiKey(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

    rawDb.exec("DROP TABLE api_keys");
    rawDb.exec(`
      CREATE TABLE api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      )
    `);

    const tSeparatedExpiry = "2020-01-01T00:00:00Z";
    rawDb
      .prepare(
        "INSERT INTO api_keys (name, key_prefix, key_hash, role, created_by, created_at, expires_at) VALUES (?, ?, ?, 'viewer', 1, datetime('now'), ?)",
      )
      .run("T-sep key", generated.keyPrefix, generated.keyHash, tSeparatedExpiry);

    const result = await verifyApiKey(env.DB, generated.plaintext);
    expect(result).toBeUndefined();

    const { response } = await runMiddleware(env, keyRequest(generated.plaintext), okNext);
    expect(response.status).toBe(401);
  });

  it("cookie + key on one request -> 400 AMBIGUOUS_AUTH and neither credential is honoured", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const key = await seedKey(rawDb, { role: "viewer" });
    const sessionId = headers.Authorization.replace("Bearer ", "");

    const { response, context } = await runMiddleware(
      env,
      keyRequest(key.plaintext, { cookie: `session_token=${sessionId}` }),
      okNext,
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("AMBIGUOUS_AUTH");
    expect(context.data.authenticated).toBeUndefined();
  });

  it("a key-authenticated mutation succeeds without a CSRF token", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const key = await seedKey(rawDb, { role: "editor" });

    const { response } = await runMiddleware(
      env,
      keyRequest(key.plaintext, {
        method: "POST",
        url: API_KEYS_URL,
        body: JSON.stringify({ name: "x" }),
      }),
      okNext,
    );

    expect(response.status).toBe(200);
  });

  it("a cookie-authenticated mutation still requires CSRF", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });
    const sessionId = headers.Authorization.replace("Bearer ", "");

    const response = await onRequest({
      request: new Request(API_KEYS_URL, {
        method: "POST",
        headers: { Cookie: `session_token=${sessionId}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      }),
      env,
      data: {},
      next: async () => new Response("ok", { status: 200 }),
    });

    expect(response.status).toBe(403);
  });

  it("last_used_at updates on first use and does NOT rewrite within 5 minutes", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const key = await seedKey(rawDb, { role: "viewer" });

    expect(rawDb.prepare("SELECT last_used_at FROM api_keys WHERE id = ?").get(key.id).last_used_at).toBeNull();

    await runMiddleware(env, keyRequest(key.plaintext), okNext);

    const firstUpdate = rawDb.prepare("SELECT last_used_at FROM api_keys WHERE id = ?").get(key.id).last_used_at;
    expect(firstUpdate).not.toBeNull();

    rawDb.prepare("UPDATE api_keys SET last_used_at = datetime('now', '-2 minutes') WHERE id = ?").run(key.id);
    const recentTime = rawDb.prepare("SELECT last_used_at FROM api_keys WHERE id = ?").get(key.id).last_used_at;

    await runMiddleware(env, keyRequest(key.plaintext), okNext);

    const afterSecond = rawDb.prepare("SELECT last_used_at FROM api_keys WHERE id = ?").get(key.id).last_used_at;
    expect(afterSecond).toBe(recentTime);
  });

  it("a last_used_at write failure does not fail the request", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const key = await seedKey(rawDb, { role: "viewer" });

    const originalPrepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => {
      if (sql.includes("UPDATE api_keys SET last_used_at")) {
        throw new Error("forced last_used_at failure");
      }
      return originalPrepare(sql);
    };

    const { response } = await runMiddleware(env, keyRequest(key.plaintext), okNext);
    expect(response.status).toBe(200);
  });

  it("per-key rate limiting triggers at the ceiling and returns 429", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const key = await seedKey(rawDb, { role: "viewer" });

    for (let i = 0; i < 60; i++) {
      const { response } = await runMiddleware(env, keyRequest(key.plaintext), okNext);
      expect(response.status).toBe(200);
    }

    const { response: overLimit } = await runMiddleware(env, keyRequest(key.plaintext), okNext);
    expect(overLimit.status).toBe(429);
    expect(overLimit.headers.get("X-RateLimit-Limit")).toBe("60");
  });

  it("a key-authenticated mutation writes an audit row carrying api_key_id", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const key = await seedKey(rawDb, { role: "editor" });

    await runMiddleware(
      env,
      keyRequest(key.plaintext, {
        method: "POST",
        url: API_KEYS_URL,
        body: JSON.stringify({}),
      }),
      okNext,
    );

    const audit = rawDb
      .prepare("SELECT * FROM audit_log WHERE action = 'api_key.request' AND api_key_id = ?")
      .get(key.id);

    expect(audit).toBeTruthy();
    expect(audit.api_key_id).toBe(key.id);
    const details = JSON.parse(audit.details);
    expect(details.method).toBe("POST");
    expect(details.path).toBe("/api/admin/api-keys");
  });

  it("a failed authentication logs the key prefix and never the full key", async () => {
    const { env } = createTestEnv({ role: "admin" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const fakeKey = "st_test_placeholder_invalid_key_value_12345";
      await runMiddleware(env, keyRequest(fakeKey), okNext);

      const allCalls = warnSpy.mock.calls.map((args) => JSON.stringify(args));
      const loggedText = allCalls.join(" ");

      expect(loggedText).toContain("st_test_");

      expect(allCalls.some((c) => c.includes(fakeKey))).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  });

  // The account self-service denial (security review of part 3). A key borrows its
  // creator's user id, so these routes would act on the creator's own credentials.
  describe("account self-service routes are refused", () => {
    const SELF_SERVICE = [
      ["/api/admin/mfa/setup", "POST"],
      ["/api/admin/mfa/enable", "POST"],
      ["/api/admin/sessions", "GET"],
      ["/api/admin/sessions/revoke-all", "POST"],
      ["/api/admin/trusted-devices", "GET"],
      ["/api/admin/auth/login", "POST"],
    ];

    it.each(SELF_SERVICE)("%s (%s) returns 403 KEY_NOT_PERMITTED", async (path, method) => {
      const { env, rawDb } = createTestEnv({ role: "admin" });
      // An ADMIN key, deliberately: the role hierarchy is the wrong axis here. If this
      // ever passes for an admin key, the denial has been re-expressed as a role check.
      const key = await seedKey(rawDb, { role: "admin" });

      const reached = vi.fn(async () => new Response("ok", { status: 200 }));
      const { response } = await runMiddleware(
        env,
        keyRequest(key.plaintext, { method, url: `https://example.test${path}` }),
        reached,
      );

      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe("KEY_NOT_PERMITTED");
      expect(reached).not.toHaveBeenCalled();
    });

    it("refuses before verifying the key, so an invalid key gets the same answer", async () => {
      const { env } = createTestEnv({ role: "admin" });

      const { response } = await runMiddleware(
        env,
        keyRequest("st_never_issued_at_all", { method: "POST", url: "https://example.test/api/admin/mfa/setup" }),
        okNext,
      );

      // 403, not 401: the refusal is a property of the credential TYPE and the path,
      // so a forged key and a valid one are indistinguishable here and no D1 round-trip
      // is spent on a request that cannot proceed.
      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe("KEY_NOT_PERMITTED");
    });

    it("still allows a key through to a content route", async () => {
      const { env, rawDb } = createTestEnv({ role: "admin" });
      const key = await seedKey(rawDb, { role: "admin" });

      const { response } = await runMiddleware(env, keyRequest(key.plaintext, { url: API_KEYS_URL }), okNext);

      expect(response.status).toBe(200);
    });
  });

  // The dual-auth rejection must see BOTH cookie names, and must agree with the session
  // layer's own parser about what counts as present. It did not: parseCookies split on
  // "=" without trimming the name, so `__Host-session_token =v` was invisible here while
  // lucia.readSessionCookie read it fine.
  describe("AMBIGUOUS_AUTH sees every cookie shape the session layer can read", () => {
    it.each([
      ["session_token=abc123", "dev cookie name"],
      ["__Host-session_token=abc123", "__Host- cookie name"],
      ["__Host-session_token =abc123", "__Host- name with trailing whitespace"],
      ["session_token =abc123", "dev name with trailing whitespace"],
      ["other=1; __Host-session_token=abc123", "second position"],
    ])("rejects %s (%s)", async (cookie) => {
      const { env, rawDb } = createTestEnv({ role: "admin" });
      const key = await seedKey(rawDb, { role: "admin" });

      const { response } = await runMiddleware(env, keyRequest(key.plaintext, { cookie }), okNext);

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("AMBIGUOUS_AUTH");
    });
  });

  it("the existing ALLOW_HEADER_AUTH dev session path still works", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });
    const sessionId = headers.Authorization.replace("Bearer ", "");

    const { response, context } = await runMiddleware(
      env,
      new Request(BASE_URL, { headers: { Authorization: `Bearer ${sessionId}` } }),
      okNext,
    );

    expect(response.status).toBe(200);
    expect(context.data.authenticated).toBe(true);
    expect(context.data.user).toBeTruthy();
  });
});
