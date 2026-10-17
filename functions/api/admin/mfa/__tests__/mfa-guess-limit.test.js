// backup-codes and disable take a TOTP code from a live session, so a stolen
// session can guess on them. They share step-up's guess limit (#1324): a pending
// attempt recorded before verifying, a per-USER limit across every guessing
// endpoint (no IP) that ends the session, and a per-IP limit.
import { describe, expect, it } from "vitest";
import { createTestEnv } from "../../../test-utils.js";
import { generateTotpCode } from "../../../../utils/totp.js";
import * as backupHandler from "../backup-codes.js";
import * as disableHandler from "../disable.js";

const SECRET = "JBSWY3DPEHPK3PXP";

// A viewer, because admins and editors are refused on disable before any of this.
const ENDPOINTS = [
  { name: "backup-codes", handler: backupHandler, type: "mfa_backup_codes" },
  { name: "disable", handler: disableHandler, type: "mfa_disable" },
];

const call = (handler, env, headers, code, ip) =>
  handler.onRequestPost({
    request: new Request("https://example.test/api/admin/mfa/x", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", ...(ip ? { "CF-Connecting-IP": ip } : {}) },
      body: JSON.stringify({ code }),
    }),
    env,
  });

const sessionCount = (rawDb, sessionId) =>
  rawDb.prepare("SELECT COUNT(*) AS n FROM lucia_sessions WHERE id = ?").get(sessionId).n;

async function wrongCode() {
  const good = await generateTotpCode(SECRET);
  return { good, wrong: good === "000000" ? "111111" : "000000" };
}

for (const { name, handler, type } of ENDPOINTS) {
  describe(`mfa/${name} guess limit (#1324)`, () => {
    const setup = () => createTestEnv({ role: "viewer", mfaEnrolled: true });

    it("an IP-rotating attacker is stopped at the per-user limit and the session is deleted", async () => {
      const { env, rawDb, headers, sessionId } = setup();
      const { good, wrong } = await wrongCode();
      for (let i = 0; i < 10; i += 1) {
        const response = await call(handler, env, headers, wrong, `203.0.113.${i + 1}`);
        expect(response.status).toBe(400);
      }
      expect(sessionCount(rawDb, sessionId)).toBe(1);

      const locked = await call(handler, env, headers, good, "198.51.100.77");
      expect(locked.status).toBe(401);
      expect((await locked.json()).code).toBe("STEP_UP_LOCKED");
      expect(sessionCount(rawDb, sessionId)).toBe(0);
      // The right code was NOT honoured: nothing was issued or turned off.
      const row = rawDb.prepare("SELECT totp_enabled, backup_codes FROM users WHERE id = 3").get();
      expect(row.totp_enabled).toBe(1);
      expect(row.backup_codes).toBeNull();
    });

    it("failures on the other guessing endpoints count toward the same per-user limit", async () => {
      const { env, rawDb, headers, sessionId } = setup();
      const insert = rawDb.prepare(
        "INSERT INTO auth_attempts (user_id, ip_address, attempt_type, success, failure_reason) VALUES (3, ?, ?, 0, 'invalid_code')",
      );
      for (let i = 0; i < 10; i += 1) insert.run(`10.0.0.${i}`, i % 2 ? "mfa_step_up" : "mfa_backup_codes");
      const response = await call(handler, env, headers, await generateTotpCode(SECRET));
      expect(response.status).toBe(401);
      expect(sessionCount(rawDb, sessionId)).toBe(0);
    });

    it("concurrent wrong guesses are all counted", async () => {
      const { env, rawDb, headers, sessionId } = setup();
      const { wrong } = await wrongCode();
      const results = await Promise.all(
        Array.from({ length: 14 }, (_, i) => call(handler, env, headers, wrong, `192.0.2.${i + 1}`)),
      );
      expect(results.filter((r) => r.status === 401).length).toBeGreaterThanOrEqual(4);
      expect(rawDb.prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE attempt_type = ?").get(type).n).toBe(14);
      expect(sessionCount(rawDb, sessionId)).toBe(0);
    });

    it("one address is stopped by the per-IP limit with 429", async () => {
      const { env, headers } = setup();
      const { wrong } = await wrongCode();
      const statuses = [];
      for (let i = 0; i < 6; i += 1) statuses.push((await call(handler, env, headers, wrong)).status);
      expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
    });

    it("settles ONE row per attempt: invalid_code on a miss, success on a hit", async () => {
      const { env, rawDb, headers } = setup();
      const { wrong } = await wrongCode();
      expect((await call(handler, env, headers, wrong)).status).toBe(400);
      expect(
        rawDb.prepare("SELECT success, failure_reason FROM auth_attempts WHERE attempt_type = ?").all(type),
      ).toEqual([{ success: 0, failure_reason: "invalid_code" }]);

      rawDb.prepare("DELETE FROM auth_attempts").run();
      expect((await call(handler, env, headers, await generateTotpCode(SECRET))).status).toBe(200);
      expect(
        rawDb.prepare("SELECT success, failure_reason FROM auth_attempts WHERE attempt_type = ?").all(type),
      ).toEqual([{ success: 1, failure_reason: null }]);
    });
  });
}

describe("mfa/disable keeps its role refusal ahead of the guess limit", () => {
  it("an admin gets MFA_REQUIRED_FOR_ROLE and records no attempt", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const response = await call(disableHandler, env, headers, "000000");
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("MFA_REQUIRED_FOR_ROLE");
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM auth_attempts").get().n).toBe(0);
  });
});
