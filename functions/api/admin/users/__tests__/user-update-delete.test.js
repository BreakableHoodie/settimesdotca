import { describe, expect, test } from "vitest";
import { createTestEnv } from "../../../test-utils.js";
import * as userItemHandler from "../[id].js";

describe("Admin user item API", () => {
  test("admin updates user role and name with audit log", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    // Insert a viewer user to update
    rawDb
      .prepare("INSERT INTO users (email, role, name, password_hash) VALUES (?, ?, ?, 'placeholder')")
      .run("viewer2@test.com", "viewer", "View Two");
    const toUpdate = rawDb.prepare("SELECT * FROM users WHERE email = ?").get("viewer2@test.com");

    const request = new Request(`https://example.test/api/admin/users/${toUpdate.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ role: "editor", name: "Editor Two" }),
    });

    const response = await userItemHandler.onRequestPatch({
      request,
      env,
      params: { id: String(toUpdate.id) },
    });
    expect(response.status).toBe(200);
    const updated = rawDb.prepare("SELECT * FROM users WHERE id = ?").get(toUpdate.id);
    expect(updated.role).toBe("editor");
    expect(updated.name).toBe("Editor Two");
    const audit = rawDb
      .prepare("SELECT * FROM audit_log WHERE action = 'user.updated' AND resource_id = ?")
      .get(toUpdate.id);
    expect(audit).toBeTruthy();
  });

  test("cannot demote last admin", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const soleAdmin = rawDb.prepare("SELECT * FROM users WHERE role = 'admin'").get();
    const request = new Request(`https://example.test/api/admin/users/${soleAdmin.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ role: "viewer" }),
    });
    const response = await userItemHandler.onRequestPatch({
      request,
      env,
      params: { id: String(soleAdmin.id) },
    });
    expect(response.status).toBe(400);
    const stillAdmin = rawDb.prepare("SELECT role FROM users WHERE id = ?").get(soleAdmin.id);
    expect(stillAdmin.role).toBe("admin");
  });

  // The demotion pre-check used to count EVERY active admin (target included)
  // with `<= 1`, so demoting an INACTIVE admin while one other admin was active
  // was wrongly refused. It now counts the OTHER active admins, as the
  // deactivation check does.
  test("can demote an inactive admin while another active admin remains", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    rawDb
      .prepare(
        "INSERT INTO users (email, role, name, password_hash, is_active) VALUES (?, 'admin', ?, 'placeholder', 0)",
      )
      .run("dormant-admin@test.com", "Dormant Admin");
    const dormant = rawDb.prepare("SELECT id FROM users WHERE email = ?").get("dormant-admin@test.com");

    const response = await userItemHandler.onRequestPatch({
      request: new Request(`https://example.test/api/admin/users/${dormant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "editor" }),
      }),
      env,
      params: { id: String(dormant.id) },
      data: { user: { userId: 1, role: "admin" } },
    });

    expect(response.status).toBe(200);
    expect(rawDb.prepare("SELECT role FROM users WHERE id = ?").get(dormant.id).role).toBe("editor");
  });

  test("concurrent cross-demotions leave one active admin", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("INSERT INTO users (email, role, name, password_hash) VALUES (?, 'admin', ?, 'placeholder')")
      .run("second-admin@test.com", "Second Admin");
    const secondAdmin = rawDb.prepare("SELECT id FROM users WHERE email = ?").get("second-admin@test.com");

    const makeContext = (actorId, targetId) => ({
      request: new Request(`https://example.test/api/admin/users/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "editor" }),
      }),
      env,
      params: { id: String(targetId) },
      data: { user: { userId: actorId, role: "admin" } },
    });

    const [first, second] = await Promise.all([
      userItemHandler.onRequestPatch(makeContext(1, secondAdmin.id)),
      userItemHandler.onRequestPatch(makeContext(secondAdmin.id, 1)),
    ]);

    const adminCount = rawDb
      .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1")
      .get();
    expect(adminCount.count).toBeGreaterThanOrEqual(1);
    expect([first.status, second.status].filter((status) => status === 200)).toHaveLength(1);
  });

  // The guarded UPDATE and everything that depends on it (key revocation,
  // session deletion, the audit row) commit in ONE batch, and every follow-up is
  // conditioned on the change having applied. So the WINNING demotion revokes
  // its target's keys and writes one audit row, and the LOSING request writes
  // nothing: no revocation of a still-admin's keys, no audit row claiming a
  // change that did not happen. A two-batch version could leave a demoted user
  // with live keys if the second batch failed.
  test("a lost last-admin race writes nothing; the winner revokes its target's keys in the same batch", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("INSERT INTO users (email, role, name, password_hash) VALUES (?, 'admin', ?, 'placeholder')")
      .run("second-admin@test.com", "Second Admin");
    const secondAdmin = rawDb.prepare("SELECT id FROM users WHERE email = ?").get("second-admin@test.com");
    const seedKey = (ownerId, hash) =>
      rawDb
        .prepare(
          "INSERT INTO api_keys (name, key_prefix, key_hash, role, created_by, expires_at) VALUES (?, ?, ?, 'admin', ?, datetime('now', '+30 days'))",
        )
        .run(`key-${ownerId}`, "st_test", hash, ownerId);
    seedKey(1, "test-hash-placeholder-a");
    seedKey(secondAdmin.id, "test-hash-placeholder-b");

    const patch = (actorId, targetId) =>
      userItemHandler.onRequestPatch({
        request: new Request(`https://example.test/api/admin/users/${targetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "editor" }),
        }),
        env,
        params: { id: String(targetId) },
        data: { user: { userId: actorId, role: "admin" } },
      });
    await Promise.all([patch(1, secondAdmin.id), patch(secondAdmin.id, 1)]);

    const demoted = rawDb.prepare("SELECT id FROM users WHERE role = 'editor' AND id IN (1, ?)").all(secondAdmin.id);
    const stillAdmin = rawDb.prepare("SELECT id FROM users WHERE role = 'admin' AND id IN (1, ?)").all(secondAdmin.id);
    expect(demoted).toHaveLength(1);
    expect(stillAdmin).toHaveLength(1);

    const revoked = (ownerId) =>
      rawDb.prepare("SELECT revoked_at FROM api_keys WHERE created_by = ?").get(ownerId).revoked_at;
    expect(revoked(demoted[0].id)).toBeTruthy();
    expect(revoked(stillAdmin[0].id)).toBeNull();

    const audits = rawDb.prepare("SELECT resource_id FROM audit_log WHERE action = 'user.updated'").all();
    expect(audits).toHaveLength(1);
    expect(String(audits[0].resource_id)).toBe(String(demoted[0].id));
  });

  test("admin deactivates user and sets deactivation metadata", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("INSERT INTO users (email, role, name, password_hash) VALUES (?, ?, ?, 'placeholder')")
      .run("tempuser@test.com", "viewer", "Temp User");
    const temp = rawDb.prepare("SELECT * FROM users WHERE email = ?").get("tempuser@test.com");
    const request = new Request(`https://example.test/api/admin/users/${temp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ isActive: false }),
    });
    const response = await userItemHandler.onRequestPatch({
      request,
      env,
      params: { id: String(temp.id) },
    });
    expect(response.status).toBe(200);
    const updated = rawDb
      .prepare("SELECT is_active, deactivated_at, deactivated_by FROM users WHERE id = ?")
      .get(temp.id);
    expect(updated.is_active).toBe(0);
    expect(updated.deactivated_at).toBeTruthy();
    expect(updated.deactivated_by).toBe(1); // admin user id
    const audit = rawDb
      .prepare("SELECT * FROM audit_log WHERE action = 'user.updated' AND resource_id = ?")
      .get(temp.id);
    expect(audit).toBeTruthy();
  });

  test("cannot delete self", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const admin = rawDb.prepare("SELECT * FROM users WHERE role = 'admin'").get();
    const request = new Request(`https://example.test/api/admin/users/${admin.id}`, {
      method: "DELETE",
      headers: { ...headers },
    });
    const response = await userItemHandler.onRequestDelete({
      request,
      env,
      params: { id: String(admin.id) },
    });
    expect(response.status).toBe(400);
  });

  test("admin permanently deletes a non-admin user and logs action", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    rawDb
      .prepare("INSERT INTO users (email, role, name, password_hash) VALUES (?, ?, ?, 'placeholder')")
      .run("delme@test.com", "viewer", "Del Me");
    const target = rawDb.prepare("SELECT * FROM users WHERE email = ?").get("delme@test.com");
    const request = new Request(`https://example.test/api/admin/users/${target.id}`, {
      method: "DELETE",
      headers: { ...headers },
    });
    const response = await userItemHandler.onRequestDelete({
      request,
      env,
      params: { id: String(target.id) },
    });
    expect(response.status).toBe(200);
    const updated = rawDb.prepare("SELECT * FROM users WHERE id = ?").get(target.id);
    expect(updated).toBeUndefined();
    const audit = rawDb
      .prepare("SELECT * FROM audit_log WHERE action = 'user.deleted' AND resource_id = ?")
      .get(target.id);
    expect(audit).toBeTruthy();
  });

  test("deleting user unlinks created content instead of cascading delete", async () => {
    const { env, rawDb, headers, user: _user } = createTestEnv({ role: "admin" });

    // Create a user to be deleted
    rawDb
      .prepare("INSERT INTO users (email, role, name, password_hash) VALUES (?, ?, ?, 'placeholder')")
      .run("creator@test.com", "editor", "Content Creator");
    const creator = rawDb.prepare("SELECT * FROM users WHERE email = ?").get("creator@test.com");

    // Create content linked to this user
    rawDb
      .prepare("INSERT INTO events (name, slug, date, created_by_user_id) VALUES (?, ?, ?, ?)")
      .run("Test Event", "test-event", "2026-01-01", creator.id);
    rawDb.prepare("INSERT INTO venues (name, created_by_user_id) VALUES (?, ?)").run("Test Venue", creator.id);
    rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized, created_by_user_id) VALUES (?, ?, ?)")
      .run("Test Band", "test-band", creator.id);

    // Verify links exist
    const eventBefore = rawDb.prepare("SELECT * FROM events WHERE created_by_user_id = ?").get(creator.id);
    expect(eventBefore).toBeTruthy();

    // Delete the user
    const request = new Request(`https://example.test/api/admin/users/${creator.id}`, {
      method: "DELETE",
      headers: { ...headers },
    });
    const response = await userItemHandler.onRequestDelete({
      request,
      env,
      params: { id: String(creator.id) },
    });

    expect(response.status).toBe(200);

    // Verify user is gone
    const userCheck = rawDb.prepare("SELECT * FROM users WHERE id = ?").get(creator.id);
    expect(userCheck).toBeUndefined();

    // Verify content still exists but is unlinked
    const eventAfter = rawDb.prepare("SELECT * FROM events WHERE slug = ?").get("test-event");
    expect(eventAfter).toBeTruthy(); // Still exists
    expect(eventAfter.created_by_user_id).toBeNull(); // Unlinked

    const venueAfter = rawDb.prepare("SELECT * FROM venues WHERE name = ?").get("Test Venue");
    expect(venueAfter).toBeTruthy();
    expect(venueAfter.created_by_user_id).toBeNull();

    const bandAfter = rawDb.prepare("SELECT * FROM band_profiles WHERE name_normalized = ?").get("test-band");
    expect(bandAfter).toBeTruthy();
    expect(bandAfter.created_by_user_id).toBeNull();
  });
});
