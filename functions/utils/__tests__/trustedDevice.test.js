import { describe, expect, it } from "vitest";
import { createTestEnv, mockUsers } from "../../api/test-utils.js";
import { createTrustedDevice, validateTrustedDevice } from "../trustedDevice.js";

const IP_A = "1.2.3.4";
const IP_B = "5.6.7.8";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Test";
const UA_OTHER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Other";

async function seedDevice(DB, userId, ip = IP_A, ua = UA) {
  const { token } = await createTrustedDevice(DB, userId, ip, ua);
  return token;
}

describe("validateTrustedDevice", () => {
  it("returns user_id when IP and UA both match", async () => {
    const { env } = createTestEnv();
    const token = await seedDevice(env.DB, mockUsers.editor.id);
    const result = await validateTrustedDevice(env.DB, token, IP_A, UA);
    expect(result).toBe(mockUsers.editor.id);
  });

  it("returns user_id and refreshes fingerprint when UA matches but IP changed", async () => {
    const { env, rawDb } = createTestEnv();
    const token = await seedDevice(env.DB, mockUsers.editor.id, IP_A, UA);

    const result = await validateTrustedDevice(env.DB, token, IP_B, UA);
    expect(result).toBe(mockUsers.editor.id);

    // Both ip_address and device_fingerprint should reflect the new IP
    const updated = rawDb
      .prepare("SELECT ip_address, device_fingerprint FROM trusted_devices WHERE user_id = ?")
      .get(mockUsers.editor.id);
    expect(updated.ip_address).toBe(IP_B);
    // Fingerprint is SHA-256(IP_B:UA) — must differ from original SHA-256(IP_A:UA).
    // Seed a reference device with IP_A to get its fingerprint for comparison.
    await createTrustedDevice(env.DB, mockUsers.admin.id, IP_A, UA);
    const ipARow = rawDb
      .prepare("SELECT device_fingerprint FROM trusted_devices WHERE user_id = ?")
      .get(mockUsers.admin.id);
    expect(updated.device_fingerprint).not.toBe(ipARow.device_fingerprint);
  });

  it("returns null when UA mismatches even if IP matches", async () => {
    const { env } = createTestEnv();
    const token = await seedDevice(env.DB, mockUsers.editor.id, IP_A, UA);
    const result = await validateTrustedDevice(env.DB, token, IP_A, UA_OTHER);
    expect(result).toBeNull();
  });

  it("returns null when both IP and UA mismatch", async () => {
    const { env } = createTestEnv();
    const token = await seedDevice(env.DB, mockUsers.editor.id, IP_A, UA);
    const result = await validateTrustedDevice(env.DB, token, IP_B, UA_OTHER);
    expect(result).toBeNull();
  });

  it("returns null for an expired device", async () => {
    const { env, rawDb } = createTestEnv();
    const token = await seedDevice(env.DB, mockUsers.editor.id);
    rawDb
      .prepare("UPDATE trusted_devices SET expires_at = datetime('now', '-1 second') WHERE user_id = ?")
      .run(mockUsers.editor.id);

    const result = await validateTrustedDevice(env.DB, token, IP_A, UA);
    expect(result).toBeNull();
  });

  it("returns null for a missing or invalid token", async () => {
    const { env } = createTestEnv();
    expect(await validateTrustedDevice(env.DB, null, IP_A, UA)).toBeNull();
    expect(await validateTrustedDevice(env.DB, "not-a-real-token", IP_A, UA)).toBeNull();
  });

  describe("legacy rows (no ua_hash)", () => {
    async function seedLegacyDevice(rawDb, DB, userId, ip = IP_A, ua = UA) {
      // createTrustedDevice writes ua_hash; we clear it to simulate pre-migration rows
      const { token } = await createTrustedDevice(DB, userId, ip, ua);
      rawDb.prepare("UPDATE trusted_devices SET ua_hash = NULL WHERE user_id = ?").run(userId);
      return token;
    }

    it("returns user_id when full fingerprint matches", async () => {
      const { env, rawDb } = createTestEnv();
      const token = await seedLegacyDevice(rawDb, env.DB, mockUsers.editor.id);
      const result = await validateTrustedDevice(env.DB, token, IP_A, UA);
      expect(result).toBe(mockUsers.editor.id);
    });

    it("returns null when IP changes (no ua_hash to fall back on)", async () => {
      const { env, rawDb } = createTestEnv();
      const token = await seedLegacyDevice(rawDb, env.DB, mockUsers.editor.id, IP_A, UA);
      const result = await validateTrustedDevice(env.DB, token, IP_B, UA);
      expect(result).toBeNull();
    });
  });
});
