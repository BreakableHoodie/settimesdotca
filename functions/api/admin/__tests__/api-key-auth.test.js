import { describe, expect, it, vi } from "vitest";

import { onRequest, checkPermission } from "../_middleware.js";
import { createTestEnv } from "../../test-utils.js";
import { generateApiKey, verifyApiKey } from "../../../utils/apiKeys.js";
import { toSqliteDateTime } from "../../../utils/authAttempts.js";
import { generateCSRFToken } from "../../../utils/csrf.js";
import * as usersHandler from "../users.js";
import * as userHandler from "../users/[id].js";
import * as toggleStatusHandler from "../users/[id]/toggle-status.js";
import * as resetPasswordHandler from "../users/[id]/reset-password.js";
import * as apiKeysHandler from "../api-keys.js";
import * as apiKeyItemHandler from "../api-keys/[id].js";
import * as inviteCodesHandler from "../invite-codes.js";
import * as inviteCodeItemHandler from "../invite-codes/[code].js";

const BASE_URL = "https://example.test/api/admin/me";
const API_KEYS_URL = "https://example.test/api/admin/api-keys";
const EVENTS_URL = "https://example.test/api/admin/events";

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

async function runMiddleware(env, request, nextImpl, params = { id: "2" }) {
  const context = { request, env, data: {}, params };
  context.next = nextImpl ? async () => nextImpl(context) : async () => new Response("ok", { status: 200 });
  const response = await onRequest(context);
  return { response, context };
}

const okNext = async () => new Response("ok", { status: 200 });
const adminGuardNext = async (ctx) => {
  const perm = await checkPermission(ctx, "admin");
  return perm.error ? perm.response : new Response("ok", { status: 200 });
};
const editorGuardNext = async (ctx) => {
  const perm = await checkPermission(ctx, "editor");
  return perm.error ? perm.response : new Response("ok", { status: 200 });
};

describe("API key authentication path (#744 part 3)", () => {
  it("fails closed when an admin is checked against an unknown role literal", async () => {
    const { env } = createTestEnv({ role: "admin" });
    const permission = await checkPermission(
      {
        request: new Request(BASE_URL),
        env,
        data: { user: { userId: 1, role: "admin" } },
      },
      "Admin",
    );

    expect(permission.error).toBe(true);
    expect(permission.response.status).toBe(403);
  });

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

  it("caps a key at its creator's current role, while preserving lower key roles", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const adminKey = await seedKey(rawDb, { role: "admin", created_by: 1 });
    const viewerKey = await seedKey(rawDb, { role: "viewer", created_by: 1 });

    rawDb.prepare("UPDATE users SET role = 'editor' WHERE id = ?").run(1);

    const { response: adminResponse, context: adminContext } = await runMiddleware(
      env,
      keyRequest(adminKey.plaintext, { method: "POST", url: EVENTS_URL }),
      adminGuardNext,
    );
    expect(adminResponse.status).toBe(403);
    expect(adminContext.data.user.role).toBe("editor");
    expect(adminContext.data.apiKey.role).toBe("editor");

    const { response: editorResponse } = await runMiddleware(
      env,
      keyRequest(adminKey.plaintext, { method: "POST", url: EVENTS_URL }),
      editorGuardNext,
    );
    expect(editorResponse.status).toBe(200);

    const { response: viewerResponse, context: viewerContext } = await runMiddleware(
      env,
      keyRequest(viewerKey.plaintext),
      editorGuardNext,
    );
    expect(viewerResponse.status).toBe(403);
    expect(viewerContext.data.user.role).toBe("viewer");
    expect(viewerContext.data.apiKey.role).toBe("viewer");
  });

  // users.role has no CHECK constraint, and a bare object lookup treats
  // inherited names as known: roleRank["constructor"] is truthy. A creator role
  // like that must still fail closed (no key), never fall back to the key's role.
  it("fails closed when the creator's role is an inherited object property name", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const key = await seedKey(rawDb, { role: "admin", created_by: 1 });
    // Migration 0069 refuses this write at the database (#1287). Drop that
    // trigger here so this test keeps proving the middleware's own
    // fail-closed lookup, independent of the schema layer.
    rawDb.exec("DROP TRIGGER users_role_valid_update");
    rawDb.prepare("UPDATE users SET role = 'constructor' WHERE id = ?").run(1);

    const { response } = await runMiddleware(env, keyRequest(key.plaintext), okNext);
    expect(response.status).toBe(401);
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
        url: EVENTS_URL,
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
        url: EVENTS_URL,
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
    expect(details.path).toBe("/api/admin/events");
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

    // #1327: each of these slipped past a startsWith on the lowercased path in
    // production (measured 2026-10-16). Only the router stood between them and a handler.
    const NON_CANONICAL = [
      ["/api/admin/%69nvite-codes", "GET"],
      ["/api/admin/%2569nvite-codes", "GET"],
      ["/api/admin//invite-codes", "GET"],
      ["/api/admin/bands%2f..%2finvite-codes", "GET"],
      ["/api/admin/bands/%2e%2e/invite-codes", "GET"],
      ["/api/admin/%6dfa/setup", "POST"],
      ["/api/admin/%75sers", "POST"],
      ["/api/admin//users/5", "PATCH"],
      ["/api/admin/bands%2f..%2fapi-keys", "POST"],
      ["/api/admin/%zz/users", "GET"],
      // Cass review: an escape decoding to UPPERCASE, since routes match case-insensitively.
      ["/api/admin/%49nvite-codes", "GET"],
      ["/api/admin/%55sers", "POST"],
      ["/api/admin/%4dFA/setup", "POST"],
      // A decoded backslash is a separator; a decoded ? or # must not truncate the path.
      ["/api/admin/%5cinvite-codes", "GET"],
      ["/api/admin/%3f%2f..%2finvite-codes", "GET"],
      ["/api/admin/%23%2f..%2fusers", "POST"],
      // Still decoding after the round cap: refused rather than trusted.
      ["/api/admin/%25252569nvite-codes", "GET"],
      // ".." resolved at every decode depth: a router decoding once sees /api/admin/invite-codes.
      ["/api/admin/x%252f..%2f..%2finvite-codes", "GET"],
      ["/api/admin/x%252f..%2f..%2fusers", "POST"],
      // Unicode compatibility forms that case-fold to ASCII (U+017F long s, U+212A Kelvin sign).
      ["/api/admin/u%C5%BFers", "POST"],
      ["/api/admin/api-%E2%84%AAeys", "POST"],
      // A router that keeps a decoded backslash as an ordinary character pops fewer segments.
      ["/api/admin/x%5c..%2f..%2finvite-codes", "GET"],
      ["/api/admin/x%5c..%2f..%2fusers", "POST"],
      ["/api/admin/%5c%2f../invite-codes", "GET"],
      // A router that resolves ".." between decodes.
      ["/api/admin/%252f/..%2f%252f/invite-codes", "GET"],
    ];

    it.each(NON_CANONICAL)("refuses the non-canonical spelling %s (%s)", async (path, method) => {
      const { env, rawDb } = createTestEnv({ role: "admin" });
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

    it("still lets an encoded band name through, slash included", async () => {
      const { env, rawDb } = createTestEnv({ role: "admin" });
      const key = await seedKey(rawDb, { role: "admin" });

      for (const name of ["AC%2FDC", "Kepi%20Ghoulie", "100%25%20Real", "Who%3F", "Users%20Of%20Sound"]) {
        const reached = vi.fn(async () => new Response("ok", { status: 200 }));
        const { response } = await runMiddleware(
          env,
          keyRequest(key.plaintext, { url: `https://example.test/api/admin/bands/stats/${name}` }),
          reached,
        );
        expect(response.status, name).toBe(200);
        expect(reached, name).toHaveBeenCalled();
      }
    });
  });

  describe("identity-management mutations are refused", () => {
    const IDENTITY_MUTATIONS = [
      [
        "/api/admin/users",
        "POST",
        "invite_codes",
        { email: "new-user@example.test", firstName: "New", lastName: "User", role: "viewer" },
      ],
      ["/api/admin/invite-codes", "POST", "invite_codes", { role: "editor" }],
      ["/api/admin/api-keys", "POST", "api_keys", { name: "new key", role: "viewer" }],
      ["/api/admin/users/2", "PATCH", "users", { role: "viewer" }],
      ["/api/admin/users/2", "DELETE", "users", undefined],
      ["/api/admin/users/2/toggle-status", "POST", "users", undefined],
      ["/api/admin/users/2/reset-password", "POST", "password_reset_tokens", {}],
      ["/api/admin/api-keys/1", "DELETE", "api_keys", undefined],
      ["/api/admin/invite-codes/example", "DELETE", "invite_codes", undefined],
    ];

    it.each(IDENTITY_MUTATIONS)(
      "%s (%s) returns 403 KEY_NOT_PERMITTED without writing %s",
      async (path, method, _table, body) => {
        const { env, rawDb } = createTestEnv({ role: "admin" });
        const key = await seedKey(rawDb, { role: "admin" });
        if (path === "/api/admin/invite-codes/example") {
          rawDb
            .prepare(
              "INSERT INTO invite_codes (code, role, expires_at) VALUES ('example', 'editor', datetime('now', '+1 day'))",
            )
            .run();
        }
        const stateQuery =
          path === "/api/admin/users"
            ? "SELECT COUNT(*) AS value FROM invite_codes"
            : path === "/api/admin/invite-codes"
              ? "SELECT COUNT(*) AS value FROM invite_codes"
              : path === "/api/admin/api-keys"
                ? "SELECT COUNT(*) AS value FROM api_keys"
                : path === "/api/admin/users/2"
                  ? method === "DELETE"
                    ? "SELECT COUNT(*) AS value FROM users WHERE id = 2"
                    : "SELECT COUNT(*) AS value FROM users WHERE role = 'viewer'"
                  : path === "/api/admin/users/2/toggle-status"
                    ? "SELECT is_active AS value FROM users WHERE id = 2"
                    : path === "/api/admin/users/2/reset-password"
                      ? "SELECT COUNT(*) AS value FROM password_reset_tokens WHERE user_id = 2"
                      : path === "/api/admin/api-keys/1"
                        ? "SELECT revoked_at AS value FROM api_keys WHERE id = 1"
                        : "SELECT is_active AS value FROM invite_codes WHERE code = 'example'";
        const before = rawDb.prepare(stateQuery).get()?.value;

        const next =
          path === "/api/admin/users"
            ? (ctx) => usersHandler.onRequestPost(ctx)
            : path === "/api/admin/invite-codes"
              ? (ctx) => inviteCodesHandler.onRequestPost(ctx)
              : path === "/api/admin/api-keys"
                ? (ctx) => apiKeysHandler.onRequestPost(ctx)
                : path === "/api/admin/users/2" && method === "PATCH"
                  ? (ctx) => userHandler.onRequestPatch(ctx)
                  : path === "/api/admin/users/2" && method === "DELETE"
                    ? (ctx) => userHandler.onRequestDelete(ctx)
                    : path === "/api/admin/users/2/toggle-status"
                      ? (ctx) => toggleStatusHandler.onRequestPost(ctx)
                      : path === "/api/admin/users/2/reset-password"
                        ? (ctx) => resetPasswordHandler.onRequestPost(ctx)
                        : path === "/api/admin/api-keys/1"
                          ? (ctx) => apiKeyItemHandler.onRequestDelete(ctx)
                          : path === "/api/admin/invite-codes/example"
                            ? (ctx) => inviteCodeItemHandler.onRequestDelete(ctx)
                            : okNext;

        const params = path === "/api/admin/api-keys/1" ? { id: "1" } : { id: "2", code: "example" };

        const { response } = await runMiddleware(
          env,
          keyRequest(key.plaintext, {
            method,
            url: `https://example.test${path}`,
            body: body === undefined ? undefined : JSON.stringify(body),
          }),
          next,
          params,
        );

        expect(rawDb.prepare(stateQuery).get()?.value).toBe(before);
        expect(response.status).toBe(403);
        expect((await response.json()).code).toBe("KEY_NOT_PERMITTED");
      },
    );

    it.each([
      [
        "/api/admin/Users",
        "POST",
        { email: "mixed-user@example.test", firstName: "Mixed", lastName: "User", role: "viewer" },
      ],
      ["/api/admin/API-KEYS", "POST", { name: "mixed key", role: "viewer" }],
      ["/api/admin/Users/2", "PATCH", { role: "viewer" }],
      ["/api/admin/MFA/setup", "POST", {}],
      ["/api/admin/Sessions/revoke-all", "POST", {}],
      ["/api/admin/Invite-Codes", "GET", undefined],
      ["/api/admin/invite-codes", "GET", undefined],
    ])("refuses mixed-case identity and self-service path %s (%s)", async (path, method, body) => {
      const { env, rawDb } = createTestEnv({ role: "admin" });
      const key = await seedKey(rawDb, { role: "admin" });
      const next =
        method === "GET"
          ? (ctx) => inviteCodesHandler.onRequestGet(ctx)
          : path.toLowerCase() === "/api/admin/users"
            ? (ctx) => usersHandler.onRequestPost(ctx)
            : path.toLowerCase() === "/api/admin/api-keys"
              ? (ctx) => apiKeysHandler.onRequestPost(ctx)
              : okNext;

      const { response } = await runMiddleware(
        env,
        keyRequest(key.plaintext, {
          method,
          url: `https://example.test${path}`,
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        next,
      );

      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe("KEY_NOT_PERMITTED");
    });

    it.each(["/api/admin/users", "/api/admin/api-keys"])("still allows an admin key to read %s", async (path) => {
      const { env, rawDb } = createTestEnv({ role: "admin" });
      const key = await seedKey(rawDb, { role: "admin" });

      const { response } = await runMiddleware(
        env,
        keyRequest(key.plaintext, { url: `https://example.test${path}` }),
        okNext,
      );

      expect(response.status).toBe(200);
    });

    it("allows a cookie-authenticated admin to create an invite code through middleware", async () => {
      const { env, rawDb, headers } = createTestEnv({ role: "admin" });
      const before = rawDb.prepare("SELECT COUNT(*) AS count FROM invite_codes").get().count;
      const sessionId = headers.Authorization.replace("Bearer ", "");
      const cookie = `session_token=${sessionId}`;
      const csrfRequest = new Request("https://example.test/api/admin/invite-codes", {
        method: "POST",
        headers: { Cookie: cookie },
      });
      const csrfToken = generateCSRFToken(csrfRequest, env);

      const middlewareContext = {
        env,
        request: new Request("https://example.test/api/admin/invite-codes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `${cookie}; csrf_token=${csrfToken}`,
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify({ role: "editor" }),
        }),
        data: {},
      };
      middlewareContext.next = async () => inviteCodesHandler.onRequestPost(middlewareContext);
      const response = await onRequest(middlewareContext);

      expect(response.status).toBe(201);
      expect(rawDb.prepare("SELECT COUNT(*) AS count FROM invite_codes").get().count).toBe(before + 1);
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
