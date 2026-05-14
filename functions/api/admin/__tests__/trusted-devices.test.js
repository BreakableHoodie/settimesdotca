import { describe, expect, test } from "vitest";
import { createTestEnv, mockUsers } from "../../test-utils.js";
import { onRequestGet, onRequestDelete } from "../trusted-devices.js";

const BASE_URL = "https://example.test/api/admin/trusted-devices";

function makeCtx(env, userId) {
  return { env, data: { user: { userId, role: "editor", email: "editor@test" } } };
}

function insertDevice(rawDb, { userId, expired = false } = {}) {
  const expiresExpr = expired
    ? "datetime('now', '-1 day')"
    : "datetime('now', '+30 days')";
  const info = rawDb
    .prepare(
      `INSERT INTO trusted_devices (user_id, token, device_fingerprint, ip_address, user_agent, expires_at, last_used_at)
       VALUES (?, ?, 'fp', '1.2.3.4', 'Mozilla/5.0', ${expiresExpr}, datetime('now'))`,
    )
    .run(userId, crypto.randomUUID());
  return rawDb.prepare("SELECT * FROM trusted_devices WHERE id = ?").get(info.lastInsertRowid);
}

describe("GET /api/admin/trusted-devices", () => {
  test("returns only non-expired devices for the requesting user", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    insertDevice(rawDb, { userId: mockUsers.editor.id });
    insertDevice(rawDb, { userId: mockUsers.editor.id });
    insertDevice(rawDb, { userId: mockUsers.editor.id, expired: true }); // should not appear
    insertDevice(rawDb, { userId: mockUsers.admin.id });                 // another user's device

    const response = await onRequestGet({
      request: new Request(BASE_URL),
      ...makeCtx(env, mockUsers.editor.id),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.devices).toHaveLength(2);
    // Sensitive token field must not be exposed
    expect(payload.devices[0]).not.toHaveProperty("token");
    expect(payload.devices[0]).toHaveProperty("id");
    expect(payload.devices[0]).toHaveProperty("ip_address");
  });

  test("returns empty array when user has no trusted devices", async () => {
    const { env } = createTestEnv({ role: "editor" });

    const response = await onRequestGet({
      request: new Request(BASE_URL),
      ...makeCtx(env, mockUsers.editor.id),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.devices).toEqual([]);
  });
});

describe("DELETE /api/admin/trusted-devices", () => {
  test("successfully revokes own device", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const device = insertDevice(rawDb, { userId: mockUsers.editor.id });

    const response = await onRequestDelete({
      request: new Request(BASE_URL, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: device.id }),
      }),
      ...makeCtx(env, mockUsers.editor.id),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(rawDb.prepare("SELECT * FROM trusted_devices WHERE id = ?").get(device.id)).toBeUndefined();
  });

  test("returns 404 when deviceId belongs to a different user (enumeration protection)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const adminDevice = insertDevice(rawDb, { userId: mockUsers.admin.id });

    const response = await onRequestDelete({
      request: new Request(BASE_URL, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: adminDevice.id }),
      }),
      ...makeCtx(env, mockUsers.editor.id),
    });

    expect(response.status).toBe(404);
    // Admin's device must be untouched
    expect(rawDb.prepare("SELECT * FROM trusted_devices WHERE id = ?").get(adminDevice.id)).toBeTruthy();
  });

  test("returns 400 when deviceId is missing", async () => {
    const { env } = createTestEnv({ role: "editor" });

    const response = await onRequestDelete({
      request: new Request(BASE_URL, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      ...makeCtx(env, mockUsers.editor.id),
    });

    expect(response.status).toBe(400);
  });

  test("ownership check works when userId is passed as a string (D1 integer vs Lucia string)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const device = insertDevice(rawDb, { userId: mockUsers.editor.id });

    // Simulate Lucia returning userId as a string
    const response = await onRequestDelete({
      request: new Request(BASE_URL, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: device.id }),
      }),
      env,
      data: { user: { userId: String(mockUsers.editor.id), role: "editor", email: "editor@test" } },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
  });
});
