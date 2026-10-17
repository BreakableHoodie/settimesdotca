import { describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../../test-utils";
import { hashPassword } from "../../../../utils/crypto.js";
import { generateTotpCode, generateTotpSecret, hashBackupCode } from "../../../../utils/totp.js";
import { AUTH_ATTEMPT_TYPES } from "../../../../utils/authAttempts.js";
import { encryptTotpSecret, isEncryptedTotpSecret } from "../../../../utils/mfaSecrets.js";
import * as loginHandler from "../login.js";
import * as mfaVerifyHandler from "../mfa/verify.js";

describe("admin mfa", () => {
  it("requires MFA for totp-enabled user on login", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const passwordHash = await hashPassword("StrongPass1!");
    rawDb
      .prepare("UPDATE users SET password_hash = ?, totp_secret = ?, totp_enabled = 1 WHERE id = 1")
      .run(passwordHash, "JBSWY3DPEHPK3PXP");

    const request = new Request("https://example.test/api/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@test",
        password: "StrongPass1!",
      }),
    });

    const response = await loginHandler.onRequestPost({ request, env });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.mfaRequired).toBe(true);
    expect(payload.mfaToken).toBeTruthy();

    const challenge = rawDb.prepare("SELECT * FROM mfa_challenges WHERE token = ?").get(payload.mfaToken);
    expect(challenge).toBeTruthy();

    const user = rawDb.prepare("SELECT totp_secret FROM users WHERE id = ?").get(1);
    expect(isEncryptedTotpSecret(user.totp_secret)).toBe(true);
  });

  it("verifies MFA and creates a session", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const secret = generateTotpSecret();
    const encryptedSecret = await encryptTotpSecret(secret, env);
    rawDb.prepare("UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = 1").run(encryptedSecret);

    const mfaToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    rawDb
      .prepare(
        `INSERT INTO mfa_challenges (token, user_id, ip_address, user_agent, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(mfaToken, 1, "127.0.0.1", "test-agent", expiresAt);

    const code = await generateTotpCode(secret);
    const request = new Request("https://example.test/api/admin/auth/mfa/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "127.0.0.1",
        "User-Agent": "test-agent",
      },
      body: JSON.stringify({ mfaToken, code }),
    });

    const response = await mfaVerifyHandler.onRequestPost({ request, env });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);

    const session = rawDb.prepare("SELECT * FROM lucia_sessions WHERE user_id = ?").get(1);
    expect(session).toBeTruthy();

    const challenge = rawDb.prepare("SELECT used FROM mfa_challenges WHERE token = ?").get(mfaToken);
    expect(challenge.used).toBe(1);
  });

  it("consumes a backup code before completing MFA login", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const secret = generateTotpSecret();
    const encryptedSecret = await encryptTotpSecret(secret, env);
    const backupCode = "ABCD-12";
    const backupCodes = [await hashBackupCode(backupCode)];
    rawDb
      .prepare("UPDATE users SET totp_secret = ?, totp_enabled = 1, backup_codes = ? WHERE id = 1")
      .run(encryptedSecret, JSON.stringify(backupCodes));

    const mfaToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    rawDb
      .prepare(
        `INSERT INTO mfa_challenges (token, user_id, ip_address, user_agent, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(mfaToken, 1, "127.0.0.1", "test-agent", expiresAt);

    const request = new Request("https://example.test/api/admin/auth/mfa/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "127.0.0.1",
        "User-Agent": "test-agent",
      },
      body: JSON.stringify({ mfaToken, code: backupCode }),
    });

    const response = await mfaVerifyHandler.onRequestPost({ request, env });
    expect(response.status).toBe(200);

    const user = rawDb.prepare("SELECT backup_codes FROM users WHERE id = ?").get(1);
    expect(user.backup_codes).toBeNull();
  });

  it("allows backup-code login when the encrypted TOTP secret cannot be decrypted", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const secret = generateTotpSecret();
    const encryptedSecret = await encryptTotpSecret(secret, env);
    const backupCode = "ABCD-34";
    const backupCodes = [await hashBackupCode(backupCode)];
    rawDb
      .prepare("UPDATE users SET totp_secret = ?, totp_enabled = 1, backup_codes = ? WHERE id = 1")
      .run(encryptedSecret, JSON.stringify(backupCodes));

    const mfaToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    rawDb
      .prepare(
        `INSERT INTO mfa_challenges (token, user_id, ip_address, user_agent, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(mfaToken, 1, "127.0.0.1", "test-agent", expiresAt);

    env.MFA_TOTP_ENCRYPTION_KEY = "";

    const request = new Request("https://example.test/api/admin/auth/mfa/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "127.0.0.1",
        "User-Agent": "test-agent",
      },
      body: JSON.stringify({ mfaToken, code: backupCode }),
    });

    const response = await mfaVerifyHandler.onRequestPost({ request, env });
    expect(response.status).toBe(200);

    const session = rawDb.prepare("SELECT * FROM lucia_sessions WHERE user_id = ? ORDER BY created_at DESC").get(1);
    expect(session).toBeTruthy();

    const user = rawDb.prepare("SELECT backup_codes FROM users WHERE id = ?").get(1);
    expect(user.backup_codes).toBeNull();
  });

  it("counts the guess when the TOTP secret cannot be loaded and the backup code is wrong (#1335)", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const encryptedSecret = await encryptTotpSecret(generateTotpSecret(), env);
    rawDb
      .prepare("UPDATE users SET totp_secret = ?, totp_enabled = 1, backup_codes = NULL WHERE id = 1")
      .run(encryptedSecret);
    const mfaToken = crypto.randomUUID();
    rawDb
      .prepare(
        `INSERT INTO mfa_challenges (token, user_id, ip_address, user_agent, expires_at)
         VALUES (?, 1, '127.0.0.1', 'test-agent', ?)`,
      )
      .run(mfaToken, new Date(Date.now() + 5 * 60 * 1000).toISOString());
    env.MFA_TOTP_ENCRYPTION_KEY = "";
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await mfaVerifyHandler.onRequestPost({
      request: new Request("https://example.test/api/admin/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "127.0.0.1", "User-Agent": "test-agent" },
        body: JSON.stringify({ mfaToken, code: "WRONG-CODE" }),
      }),
      env,
    });
    errors.mockRestore();

    expect(response.status).toBe(500);
    expect(
      rawDb
        .prepare("SELECT success, failure_reason, user_id FROM auth_attempts WHERE attempt_type = ?")
        .all(AUTH_ATTEMPT_TYPES.mfa),
    ).toEqual([{ success: 0, failure_reason: "totp_secret_error", user_id: 1 }]);
  });

  it("replaces any previously active MFA challenge when login issues a new token", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const passwordHash = await hashPassword("StrongPass1!");
    rawDb
      .prepare("UPDATE users SET password_hash = ?, totp_secret = ?, totp_enabled = 1 WHERE id = 1")
      .run(passwordHash, "JBSWY3DPEHPK3PXP");

    const staleToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    rawDb
      .prepare(
        `INSERT INTO mfa_challenges (token, user_id, ip_address, user_agent, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(staleToken, 1, "127.0.0.1", "test-agent", expiresAt);

    const request = new Request("https://example.test/api/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@test",
        password: "StrongPass1!",
      }),
    });

    const response = await loginHandler.onRequestPost({ request, env });
    expect(response.status).toBe(200);
    const payload = await response.json();

    const activeChallenges = rawDb.prepare("SELECT token FROM mfa_challenges WHERE user_id = ? AND used = 0").all(1);
    expect(activeChallenges).toHaveLength(1);
    expect(activeChallenges[0].token).toBe(payload.mfaToken);

    const staleChallenge = rawDb.prepare("SELECT COUNT(*) as c FROM mfa_challenges WHERE token = ?").get(staleToken);
    expect(staleChallenge.c).toBe(0);
  });

  it("rate limits invalid or expired MFA tokens by IP before challenge lookup", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });

    rawDb
      .prepare(
        `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success, failure_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(null, null, "127.0.0.1", "test-agent", AUTH_ATTEMPT_TYPES.mfa, 0, "invalid_or_expired_token");
    rawDb
      .prepare(
        `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success, failure_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(null, null, "127.0.0.1", "test-agent", AUTH_ATTEMPT_TYPES.mfa, 0, "invalid_or_expired_token");
    rawDb
      .prepare(
        `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success, failure_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(null, null, "127.0.0.1", "test-agent", AUTH_ATTEMPT_TYPES.mfa, 0, "invalid_or_expired_token");
    rawDb
      .prepare(
        `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success, failure_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(null, null, "127.0.0.1", "test-agent", AUTH_ATTEMPT_TYPES.mfa, 0, "invalid_or_expired_token");
    rawDb
      .prepare(
        `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success, failure_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(null, null, "127.0.0.1", "test-agent", AUTH_ATTEMPT_TYPES.mfa, 0, "invalid_or_expired_token");

    const request = new Request("https://example.test/api/admin/auth/mfa/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "127.0.0.1",
        "User-Agent": "test-agent",
      },
      body: JSON.stringify({ mfaToken: "invalid-token", code: "123456" }),
    });

    const response = await mfaVerifyHandler.onRequestPost({ request, env });
    expect(response.status).toBe(429);
  });

  // Two logins spending different backup codes both read the full list; the
  // later write must not restore the code the earlier one spent (#1253 review).
  it("refuses a backup-code login whose list another login changed mid-request", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const encryptedSecret = await encryptTotpSecret(generateTotpSecret(), env);
    const codes = ["ABCD-12", "EFGH-34"];
    const hashed = await Promise.all(codes.map((c) => hashBackupCode(c)));
    rawDb
      .prepare("UPDATE users SET totp_secret = ?, totp_enabled = 1, backup_codes = ? WHERE id = 1")
      .run(encryptedSecret, JSON.stringify(hashed));
    rawDb.prepare("DELETE FROM lucia_sessions WHERE user_id = 1").run();
    const mfaToken = crypto.randomUUID();
    rawDb
      .prepare(
        `INSERT INTO mfa_challenges (token, user_id, ip_address, user_agent, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(mfaToken, 1, "127.0.0.1", "test-agent", new Date(Date.now() + 300000).toISOString());

    // The other login spent EFGH-34 and committed first.
    const prepare = env.DB.prepare.bind(env.DB);
    let interleaved = false;
    env.DB.prepare = (sql) => {
      if (!interleaved && sql.includes("AND backup_codes IS ?")) {
        interleaved = true;
        rawDb.prepare("UPDATE users SET backup_codes = ? WHERE id = 1").run(JSON.stringify([hashed[0]]));
      }
      return prepare(sql);
    };

    const response = await mfaVerifyHandler.onRequestPost({
      request: new Request("https://example.test/api/admin/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "127.0.0.1", "User-Agent": "test-agent" },
        body: JSON.stringify({ mfaToken, code: codes[0] }),
      }),
      env,
    });
    expect(interleaved).toBe(true);
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("MFA_CHANGED");
    const user = rawDb.prepare("SELECT backup_codes FROM users WHERE id = 1").get();
    expect(JSON.parse(user.backup_codes)).toEqual([hashed[0]]);
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM lucia_sessions WHERE user_id = 1").get().n).toBe(0);
  });
});
