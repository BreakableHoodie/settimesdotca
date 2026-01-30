import { describe, expect, it } from "vitest";
import { createTestEnv } from "../../../test-utils";
import { hashPassword } from "../../../../utils/crypto.js";
import { generateTotpCode, generateTotpSecret } from "../../../../utils/totp.js";
import * as loginHandler from "../login.js";
import * as mfaVerifyHandler from "../mfa/verify.js";

describe("admin mfa", () => {
  it("requires MFA for totp-enabled user on login", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const passwordHash = await hashPassword("StrongPass1!");
    rawDb
      .prepare(
        "UPDATE users SET password_hash = ?, totp_secret = ?, totp_enabled = 1 WHERE id = 1"
      )
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

    const challenge = rawDb
      .prepare("SELECT * FROM mfa_challenges WHERE token = ?")
      .get(payload.mfaToken);
    expect(challenge).toBeTruthy();
  });

  it("verifies MFA and creates a session", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const secret = generateTotpSecret();
    rawDb
      .prepare(
        "UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = 1"
      )
      .run(secret);

    const mfaToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    rawDb
      .prepare(
        `INSERT INTO mfa_challenges (token, user_id, ip_address, user_agent, expires_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(mfaToken, 1, "127.0.0.1", "test-agent", expiresAt);

    const code = await generateTotpCode(secret);
    const request = new Request(
      "https://example.test/api/admin/auth/mfa/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "127.0.0.1",
          "User-Agent": "test-agent",
        },
        body: JSON.stringify({ mfaToken, code }),
      }
    );

    const response = await mfaVerifyHandler.onRequestPost({ request, env });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);

    const session = rawDb
      .prepare("SELECT * FROM lucia_sessions WHERE user_id = ?")
      .get(1);
    expect(session).toBeTruthy();

    const challenge = rawDb
      .prepare("SELECT used FROM mfa_challenges WHERE token = ?")
      .get(mfaToken);
    expect(challenge.used).toBe(1);
  });
});
