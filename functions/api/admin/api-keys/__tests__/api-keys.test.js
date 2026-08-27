import { describe, expect, it } from "vitest";
import { createTestEnv } from "../../../test-utils.js";
import * as collectionHandler from "../../api-keys.js";
import * as itemHandler from "../[id].js";
import * as userItemHandler from "../../users/[id].js";
import * as toggleStatusHandler from "../../users/[id]/toggle-status.js";
import { verifyApiKey } from "../../../../utils/apiKeys.js";

function jsonRequest(url, method, headers, body) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createKey(env, headers, body = { name: "Deploy key" }) {
  const response = await collectionHandler.onRequestPost({
    request: jsonRequest("https://example.test/api/admin/api-keys", "POST", headers, body),
    env,
  });
  return { response, body: await response.json() };
}

describe("Admin API keys API", () => {
  it.each(["viewer", "editor"])("rejects %s from every API-key route", async (role) => {
    const { env, headers } = createTestEnv({ role });
    const create = await collectionHandler.onRequestPost({
      request: jsonRequest("https://example.test/api/admin/api-keys", "POST", headers, { name: "Nope" }),
      env,
    });
    const list = await collectionHandler.onRequestGet({
      request: new Request("https://example.test/api/admin/api-keys", { headers }),
      env,
    });
    const revoke = await itemHandler.onRequestDelete({
      request: new Request("https://example.test/api/admin/api-keys/1", { method: "DELETE", headers }),
      env,
      params: { id: "1" },
    });

    expect(create.status).toBe(403);
    expect(list.status).toBe(403);
    expect(revoke.status).toBe(403);
  });

  it("creates a key once, stores only its hash, and records its id and role", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const { response, body } = await createKey(env, headers, { name: " Nightly deploy\u0000 ", role: "editor" });

    expect(response.status).toBe(201);
    expect(body.apiKey).toMatchObject({ name: "Nightly deploy", role: "editor" });
    expect(body.apiKey.plaintext).toMatch(/^st_[A-Za-z0-9_-]{43}$/);
    expect(body.apiKey).not.toHaveProperty("key_hash");

    const stored = rawDb.prepare("SELECT * FROM api_keys WHERE id = ?").get(body.apiKey.id);
    expect(stored.key_hash).not.toBe(body.apiKey.plaintext);
    expect(stored.key_hash).not.toContain(body.apiKey.plaintext);
    expect(stored.expires_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    const audit = rawDb
      .prepare("SELECT * FROM audit_log WHERE action = 'api_key.created' AND resource_id = ?")
      .get(body.apiKey.id);
    expect(audit).toBeTruthy();
    expect(JSON.parse(audit.details)).toEqual({ role: "editor" });
  });

  it("lists explicit safe columns and never serialises the stored hash", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const created = await createKey(env, headers);
    const stored = rawDb.prepare("SELECT key_hash FROM api_keys WHERE id = ?").get(created.body.apiKey.id);

    const response = await collectionHandler.onRequestGet({
      request: new Request("https://example.test/api/admin/api-keys", { headers }),
      env,
    });
    const serialised = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(serialised).not.toContain(stored.key_hash);
    expect(serialised).not.toContain(created.body.apiKey.plaintext);
    expect(serialised).toContain('"key_prefix"');
  });

  it("revokes a key immediately and rejects a second revoke", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const created = await createKey(env, headers);
    const keyId = created.body.apiKey.id;

    // Assert the key verifies BEFORE the revoke, or the post-revoke assertion below
    // passes just as well against a verifyApiKey that never resolves anything.
    await expect(verifyApiKey(env.DB, created.body.apiKey.plaintext)).resolves.toMatchObject({ id: keyId });

    const revoke = await itemHandler.onRequestDelete({
      request: new Request(`https://example.test/api/admin/api-keys/${keyId}`, { method: "DELETE", headers }),
      env,
      params: { id: String(keyId) },
    });
    expect(revoke.status).toBe(200);
    expect(rawDb.prepare("SELECT revoked_at FROM api_keys WHERE id = ?").get(keyId).revoked_at).toBeTruthy();
    await expect(verifyApiKey(env.DB, created.body.apiKey.plaintext)).resolves.toBeUndefined();

    const second = await itemHandler.onRequestDelete({
      request: new Request(`https://example.test/api/admin/api-keys/${keyId}`, { method: "DELETE", headers }),
      env,
      params: { id: String(keyId) },
    });
    expect(second.status).toBe(409);
  });

  // The precondition read is advisory: two concurrent revokes both see revoked_at
  // IS NULL and both reach the batch. Simulated deterministically by revoking the row
  // between that read and the batch -- exactly what the losing request observes.
  it("returns 409 and writes no audit row when it loses a concurrent revoke", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const created = await createKey(env, headers);
    const keyId = created.body.apiKey.id;

    const originalBatch = env.DB.batch.bind(env.DB);
    env.DB.batch = (statements) => {
      // The other request won while this one was between its read and its write.
      rawDb.prepare("UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ?").run(keyId);
      return originalBatch(statements);
    };

    const response = await itemHandler.onRequestDelete({
      request: new Request(`https://example.test/api/admin/api-keys/${keyId}`, { method: "DELETE", headers }),
      env,
      params: { id: String(keyId) },
    });

    expect(response.status).toBe(409);
    // The loser must not claim a revocation it did not perform.
    expect(rawDb.prepare("SELECT COUNT(*) as c FROM audit_log WHERE action = 'api_key.revoked'").get().c).toBe(0);
  });

  it("writes exactly one audit row for a revoke that wins", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const created = await createKey(env, headers);
    const keyId = created.body.apiKey.id;

    const response = await itemHandler.onRequestDelete({
      request: new Request(`https://example.test/api/admin/api-keys/${keyId}`, { method: "DELETE", headers }),
      env,
      params: { id: String(keyId) },
    });

    expect(response.status).toBe(200);
    const audit = rawDb
      .prepare("SELECT resource_id FROM audit_log WHERE action = 'api_key.revoked' AND resource_type = 'api_key'")
      .all();
    expect(audit).toHaveLength(1);
    expect(audit[0].resource_id).toBe(keyId);
  });

  // `.catch(() => ({}))` only catches a PARSE error. `null` and arrays parse fine.
  it.each([
    ["null", "null"],
    ["an array", '["name"]'],
    ["a bare string", '"hello"'],
  ])("returns 400 rather than 500 for a body that is %s", async (_label, raw) => {
    const { env, headers } = createTestEnv({ role: "admin" });

    const response = await collectionHandler.onRequestPost({
      request: new Request("https://example.test/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: raw,
      }),
      env,
    });

    expect(response.status).toBe(400);
  });

  it("rejects an invalid id without querying api_keys", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });
    const originalPrepare = env.DB.prepare;
    const queries = [];
    env.DB.prepare = (sql) => {
      queries.push(sql);
      return originalPrepare.call(env.DB, sql);
    };

    const response = await itemHandler.onRequestDelete({
      request: new Request("https://example.test/api/admin/api-keys/not-an-id", { method: "DELETE", headers }),
      env,
      params: { id: "not-an-id" },
    });

    expect(response.status).toBe(400);
    // `toContain` compares array elements by identity, so an asymmetric matcher passed
    // to it never matches and the assertion is vacuous. Predicate over the strings.
    expect(queries.filter((sql) => sql.includes("api_keys"))).toEqual([]);
  });

  it("rejects creating a key with an invalid role", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });
    const { response } = await createKey(env, headers, { name: "Bad role", role: "superuser" });
    expect(response.status).toBe(400);
  });

  it("refuses to delete a user who owns keys without deleting the user", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("INSERT INTO users (email, role, name, password_hash) VALUES (?, ?, ?, 'placeholder')")
      .run("key-owner@test.com", "editor", "Key Owner");
    const owner = rawDb.prepare("SELECT id FROM users WHERE email = ?").get("key-owner@test.com");
    await createKey(env, headers, { name: "Owned key" });
    rawDb.prepare("UPDATE api_keys SET created_by = ? WHERE name = ?").run(owner.id, "Owned key");

    const response = await userItemHandler.onRequestDelete({
      request: new Request(`https://example.test/api/admin/users/${owner.id}`, { method: "DELETE", headers }),
      env,
      params: { id: String(owner.id) },
    });

    const payload = await response.json();
    expect(response.status).toBe(409);
    expect(payload.code).toBe("USER_OWNS_API_KEYS");
    // Revoking does not clear ON DELETE RESTRICT, so the message must not tell the
    // operator to revoke -- it points at deactivation, the path that actually works.
    expect(payload.message).toContain("User owns 1 API key");
    expect(payload.message).toContain("Deactivate the user instead");
    expect(payload.message).not.toMatch(/revoke .*first/i);
    expect(rawDb.prepare("SELECT id FROM users WHERE id = ?").get(owner.id)).toBeTruthy();
  });

  // `false` is the shape the admin UI sends; `0` is the one that regressed. Every
  // other isActive site in users/[id].js reads truthiness, so all falsy values
  // deactivate the user -- and each must revoke their keys with it.
  it.each([false, 0])("revokes active keys when a user is deactivated with isActive=%s", async (isActive) => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("INSERT INTO users (email, role, name, password_hash) VALUES (?, ?, ?, 'placeholder')")
      .run("deactivate-owner@test.com", "editor", "Deactivate Owner");
    const owner = rawDb.prepare("SELECT id FROM users WHERE email = ?").get("deactivate-owner@test.com");
    const created = await createKey(env, headers, { name: "Active owned key" });
    rawDb.prepare("UPDATE api_keys SET created_by = ? WHERE id = ?").run(owner.id, created.body.apiKey.id);

    const response = await userItemHandler.onRequestPatch({
      request: jsonRequest(`https://example.test/api/admin/users/${owner.id}`, "PATCH", headers, { isActive }),
      env,
      params: { id: String(owner.id) },
    });

    expect(response.status).toBe(200);
    // The user really was deactivated -- otherwise "keys revoked" would be trivially
    // true for a request that changed nothing at all.
    expect(rawDb.prepare("SELECT is_active FROM users WHERE id = ?").get(owner.id).is_active).toBe(0);
    expect(
      rawDb.prepare("SELECT revoked_at FROM api_keys WHERE id = ?").get(created.body.apiKey.id).revoked_at,
    ).toBeTruthy();
    await expect(verifyApiKey(env.DB, created.body.apiKey.plaintext)).resolves.toBeUndefined();
  });

  // The second deactivation path. It is a different endpoint from the PATCH above,
  // and it silently skipped key revocation -- the exact "departed account keeps a
  // live credential" case #744 exists to close. Both paths get the same assertion.
  it("revokes active keys when a user is deactivated via toggle-status", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("INSERT INTO users (email, role, name, password_hash) VALUES (?, ?, ?, 'placeholder')")
      .run("toggle-owner@test.com", "editor", "Toggle Owner");
    const owner = rawDb.prepare("SELECT id FROM users WHERE email = ?").get("toggle-owner@test.com");
    const created = await createKey(env, headers, { name: "Toggle owned key" });
    rawDb.prepare("UPDATE api_keys SET created_by = ? WHERE id = ?").run(owner.id, created.body.apiKey.id);

    const response = await toggleStatusHandler.onRequestPost({
      request: new Request(`https://example.test/api/admin/users/${owner.id}/toggle-status`, {
        method: "POST",
        headers,
      }),
      env,
      params: { id: String(owner.id) },
    });

    expect(response.status).toBe(200);
    expect(rawDb.prepare("SELECT is_active FROM users WHERE id = ?").get(owner.id).is_active).toBe(0);
    expect(
      rawDb.prepare("SELECT revoked_at FROM api_keys WHERE id = ?").get(created.body.apiKey.id).revoked_at,
    ).toBeTruthy();
    // The pre-existing session teardown must survive the move into the batch.
    expect(rawDb.prepare("SELECT COUNT(*) as c FROM lucia_sessions WHERE user_id = ?").get(owner.id).c).toBe(0);
  });

  // The backstop for a THIRD deactivation path nobody has written yet: a key whose
  // owner is inactive must not verify even if its own revoked_at was never set.
  it("refuses to verify a key whose owner is inactive, even when the key is unrevoked", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("INSERT INTO users (email, role, name, password_hash) VALUES (?, ?, ?, 'placeholder')")
      .run("ghost-owner@test.com", "editor", "Ghost Owner");
    const owner = rawDb.prepare("SELECT id FROM users WHERE email = ?").get("ghost-owner@test.com");
    const created = await createKey(env, headers, { name: "Orphaned key" });
    rawDb.prepare("UPDATE api_keys SET created_by = ? WHERE id = ?").run(owner.id, created.body.apiKey.id);

    await expect(verifyApiKey(env.DB, created.body.apiKey.plaintext)).resolves.toMatchObject({
      id: created.body.apiKey.id,
    });

    // Deactivate the row directly, bypassing every endpoint -- that is the point.
    rawDb.prepare("UPDATE users SET is_active = 0 WHERE id = ?").run(owner.id);

    expect(rawDb.prepare("SELECT revoked_at FROM api_keys WHERE id = ?").get(created.body.apiKey.id).revoked_at).toBe(
      null,
    );
    await expect(verifyApiKey(env.DB, created.body.apiKey.plaintext)).resolves.toBeUndefined();
  });

  // api_keys.role is frozen at creation. Without this, demoting an admin leaves a
  // bearer credential still carrying "admin" -- which, once the Bearer path lands,
  // they could use to re-promote themselves. Demotion has to be demotion.
  it.each([
    ["admin", "viewer"],
    ["viewer", "editor"],
  ])("revokes active keys when a user's role changes from %s to %s", async (from, to) => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("INSERT INTO users (email, role, name, password_hash) VALUES (?, ?, ?, 'placeholder')")
      .run("role-change@test.com", from, "Role Change");
    const owner = rawDb.prepare("SELECT id FROM users WHERE email = ?").get("role-change@test.com");
    const created = await createKey(env, headers, { name: "Role-bound key", role: from });
    rawDb.prepare("UPDATE api_keys SET created_by = ? WHERE id = ?").run(owner.id, created.body.apiKey.id);

    const response = await userItemHandler.onRequestPatch({
      request: jsonRequest(`https://example.test/api/admin/users/${owner.id}`, "PATCH", headers, { role: to }),
      env,
      params: { id: String(owner.id) },
    });

    expect(response.status).toBe(200);
    expect(rawDb.prepare("SELECT role FROM users WHERE id = ?").get(owner.id).role).toBe(to);
    expect(
      rawDb.prepare("SELECT revoked_at FROM api_keys WHERE id = ?").get(created.body.apiKey.id).revoked_at,
    ).toBeTruthy();
  });

  it("leaves keys alone when a PATCH re-sends the role the user already has", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("INSERT INTO users (email, role, name, password_hash) VALUES (?, ?, ?, 'placeholder')")
      .run("same-role@test.com", "editor", "Same Role");
    const owner = rawDb.prepare("SELECT id FROM users WHERE email = ?").get("same-role@test.com");
    const created = await createKey(env, headers, { name: "Kept key" });
    rawDb.prepare("UPDATE api_keys SET created_by = ? WHERE id = ?").run(owner.id, created.body.apiKey.id);

    const response = await userItemHandler.onRequestPatch({
      request: jsonRequest(`https://example.test/api/admin/users/${owner.id}`, "PATCH", headers, { role: "editor" }),
      env,
      params: { id: String(owner.id) },
    });

    expect(response.status).toBe(200);
    expect(rawDb.prepare("SELECT revoked_at FROM api_keys WHERE id = ?").get(created.body.apiKey.id).revoked_at).toBe(
      null,
    );
  });

  it("leaves keys alone when a user is reactivated", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("INSERT INTO users (email, role, name, password_hash, is_active) VALUES (?, ?, ?, 'placeholder', 0)")
      .run("reactivate-owner@test.com", "editor", "Reactivate Owner");
    const owner = rawDb.prepare("SELECT id FROM users WHERE email = ?").get("reactivate-owner@test.com");
    const created = await createKey(env, headers, { name: "Untouched key" });
    rawDb.prepare("UPDATE api_keys SET created_by = ? WHERE id = ?").run(owner.id, created.body.apiKey.id);

    const response = await userItemHandler.onRequestPatch({
      request: jsonRequest(`https://example.test/api/admin/users/${owner.id}`, "PATCH", headers, { isActive: true }),
      env,
      params: { id: String(owner.id) },
    });

    expect(response.status).toBe(200);
    expect(rawDb.prepare("SELECT revoked_at FROM api_keys WHERE id = ?").get(created.body.apiKey.id).revoked_at).toBe(
      null,
    );
  });
});
