// #1253 review: admins and editors cannot turn their own 2FA off, so an admin
// must be able to reset a colleague's lost authenticator without a D1 write.
import { describe, expect, it } from "vitest";
import { createTestEnv } from "../../../test-utils.js";
import * as resetMfa from "../[id]/reset-mfa.js";

function seedFactorState(rawDb, userId) {
  rawDb
    .prepare(
      "UPDATE users SET totp_enabled = 1, totp_secret = 'enc:test-secret', backup_codes = '[\"x\"]' WHERE id = ?",
    )
    .run(userId);
  rawDb
    .prepare("INSERT INTO lucia_sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .run(crypto.randomUUID(), userId, Math.floor(Date.now() / 1000) + 3600);
  rawDb
    .prepare("INSERT INTO trusted_devices (user_id, token, expires_at) VALUES (?, ?, '2099-01-01 00:00:00')")
    .run(userId, `test-device-${userId}`);
  rawDb
    .prepare(
      "INSERT INTO api_keys (name, key_prefix, key_hash, role, created_by, expires_at) VALUES ('k', 'st_test', ?, 'editor', ?, '2099-01-01 00:00:00')",
    )
    .run(`test-hash-${userId}`, userId);
}

async function callReset(env, headers, id) {
  return resetMfa.onRequestPost({
    request: new Request(`https://example.test/api/admin/users/${id}/reset-mfa`, { method: "POST", headers }),
    env,
    params: { id: String(id) },
    data: {},
  });
}

describe("POST /api/admin/users/:id/reset-mfa (#1253)", () => {
  it("clears the editor's factor and ends everything authenticated under it", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    seedFactorState(rawDb, 2);

    const response = await callReset(env, headers, 2);
    expect(response.status).toBe(200);

    expect(rawDb.prepare("SELECT totp_enabled, totp_secret, backup_codes FROM users WHERE id = 2").get()).toEqual({
      totp_enabled: 0,
      totp_secret: null,
      backup_codes: null,
    });
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM lucia_sessions WHERE user_id = 2").get().n).toBe(0);
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM trusted_devices WHERE user_id = 2").get().n).toBe(0);
    expect(
      rawDb.prepare("SELECT COUNT(*) AS n FROM api_keys WHERE created_by = 2 AND revoked_at IS NULL").get().n,
    ).toBe(0);
    expect(
      rawDb.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'user.mfa_reset' AND resource_id = '2'").get()
        .n,
    ).toBe(1);
  });

  it("refuses an admin resetting their own factor and changes nothing", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const response = await callReset(env, headers, 1);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("CANNOT_RESET_OWN_MFA");
    expect(rawDb.prepare("SELECT totp_enabled FROM users WHERE id = 1").get().totp_enabled).toBe(1);
  });

  it("refuses an editor and changes nothing", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    rawDb.prepare("UPDATE users SET totp_enabled = 1 WHERE id = 1").run();
    const response = await callReset(env, headers, 1);
    expect(response.status).toBe(403);
    expect(rawDb.prepare("SELECT totp_enabled FROM users WHERE id = 1").get().totp_enabled).toBe(1);
  });

  it("returns 404 for a user that does not exist", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });
    expect((await callReset(env, headers, 999)).status).toBe(404);
  });
});
