import { describe, expect, it } from "vitest";
import { createTestEnv } from "../../../test-utils";
import { generateTotpCode } from "../../../../utils/totp.js";
import { AUTH_ATTEMPT_TYPES } from "../../../../utils/authAttempts.js";
import { isEncryptedTotpSecret } from "../../../../utils/mfaSecrets.js";
import * as mfaStatusHandler from "../status.js";
import * as mfaSetupHandler from "../setup.js";
import * as mfaEnableHandler from "../enable.js";
import * as mfaDisableHandler from "../disable.js";
import * as mfaBackupHandler from "../backup-codes.js";

const buildAuthHeaders = (baseHeaders = {}) => ({
  ...baseHeaders,
  "Content-Type": "application/json",
});

// Enabling MFA revokes every existing session and issues a fresh one (#1253
// review), so a test that keeps going after enable must switch to it.
function adoptSessionFrom(response, headers) {
  const cookie = response.headers.getSetCookie().find((value) => /session_token=/.test(value));
  if (!cookie) throw new Error("enable did not issue a session cookie");
  const sessionId = cookie.split(";")[0].split("=")[1];
  headers.Authorization = `Bearer ${sessionId}`;
}

describe("admin mfa settings", () => {
  it("returns status and setup flow toggles setupPending", async () => {
    const { env, headers, rawDb } = createTestEnv({ role: "admin", mfaEnrolled: false });

    const statusReq = new Request("https://example.test/api/admin/mfa/status", {
      method: "GET",
      headers,
    });
    const statusRes = await mfaStatusHandler.onRequestGet({
      request: statusReq,
      env,
    });
    expect(statusRes.status).toBe(200);
    const statusPayload = await statusRes.json();
    expect(statusPayload.totpEnabled).toBe(false);
    expect(statusPayload.setupPending).toBe(false);

    const setupReq = new Request("https://example.test/api/admin/mfa/setup", {
      method: "POST",
      headers: buildAuthHeaders(headers),
      body: JSON.stringify({}),
    });
    const setupRes = await mfaSetupHandler.onRequestPost({
      request: setupReq,
      env,
    });
    expect(setupRes.status).toBe(200);
    const setupPayload = await setupRes.json();
    expect(setupPayload.secret).toBeTruthy();
    expect(setupPayload.otpauthUrl).toContain("otpauth://totp/");

    const user = rawDb.prepare("SELECT totp_secret, totp_enabled FROM users WHERE id = 1").get();
    expect(user.totp_secret).toBeTruthy();
    expect(isEncryptedTotpSecret(user.totp_secret)).toBe(true);
    expect(user.totp_secret).not.toBe(setupPayload.secret);
    expect(user.totp_enabled).toBe(0);

    const statusReq2 = new Request("https://example.test/api/admin/mfa/status", {
      method: "GET",
      headers,
    });
    const statusRes2 = await mfaStatusHandler.onRequestGet({
      request: statusReq2,
      env,
    });
    const statusPayload2 = await statusRes2.json();
    expect(statusPayload2.setupPending).toBe(true);
  });

  it("enables MFA and issues backup codes", async () => {
    const { env, headers, rawDb } = createTestEnv({ role: "admin", mfaEnrolled: false });
    const setupReq = new Request("https://example.test/api/admin/mfa/setup", {
      method: "POST",
      headers: buildAuthHeaders(headers),
      body: JSON.stringify({}),
    });
    const setupRes = await mfaSetupHandler.onRequestPost({
      request: setupReq,
      env,
    });
    const setupPayload = await setupRes.json();

    const code = await generateTotpCode(setupPayload.secret);
    const enableReq = new Request("https://example.test/api/admin/mfa/enable", {
      method: "POST",
      headers: buildAuthHeaders(headers),
      body: JSON.stringify({ code }),
    });
    const enableRes = await mfaEnableHandler.onRequestPost({
      request: enableReq,
      env,
    });
    expect(enableRes.status).toBe(200);
    const enablePayload = await enableRes.json();
    expect(enablePayload.backupCodes?.length).toBeGreaterThan(0);

    const user = rawDb.prepare("SELECT totp_enabled, backup_codes FROM users WHERE id = 1").get();
    expect(user.totp_enabled).toBe(1);
    expect(user.backup_codes).toBeTruthy();
  });

  // A viewer: 2FA stays optional below editor, so a viewer may still turn it
  // off. Admins and editors cannot (#1253, covered below).
  it("regenerates backup codes and disables MFA", async () => {
    const { env, headers, rawDb } = createTestEnv({ role: "viewer" });
    const setupReq = new Request("https://example.test/api/admin/mfa/setup", {
      method: "POST",
      headers: buildAuthHeaders(headers),
      body: JSON.stringify({}),
    });
    const setupRes = await mfaSetupHandler.onRequestPost({
      request: setupReq,
      env,
    });
    const setupPayload = await setupRes.json();

    const code = await generateTotpCode(setupPayload.secret);
    const enableReq = new Request("https://example.test/api/admin/mfa/enable", {
      method: "POST",
      headers: buildAuthHeaders(headers),
      body: JSON.stringify({ code }),
    });
    const enableRes = await mfaEnableHandler.onRequestPost({ request: enableReq, env });
    adoptSessionFrom(enableRes, headers);

    const regenCode = await generateTotpCode(setupPayload.secret);
    const regenReq = new Request("https://example.test/api/admin/mfa/backup-codes", {
      method: "POST",
      headers: buildAuthHeaders(headers),
      body: JSON.stringify({ code: regenCode }),
    });
    const regenRes = await mfaBackupHandler.onRequestPost({
      request: regenReq,
      env,
    });
    expect(regenRes.status).toBe(200);
    const regenPayload = await regenRes.json();
    expect(regenPayload.backupCodes?.length).toBeGreaterThan(0);

    const disableCode = await generateTotpCode(setupPayload.secret);
    const disableReq = new Request("https://example.test/api/admin/mfa/disable", {
      method: "POST",
      headers: buildAuthHeaders(headers),
      body: JSON.stringify({ code: disableCode }),
    });
    const disableRes = await mfaDisableHandler.onRequestPost({
      request: disableReq,
      env,
    });
    expect(disableRes.status).toBe(200);

    const disableAttempt = rawDb
      .prepare("SELECT success FROM auth_attempts WHERE user_id = ? AND attempt_type = ? ORDER BY id DESC LIMIT 1")
      .get(3, AUTH_ATTEMPT_TYPES.mfaDisable);
    expect(disableAttempt.success).toBe(1);

    const user = rawDb.prepare("SELECT totp_enabled, totp_secret FROM users WHERE id = 3").get();
    expect(user.totp_enabled).toBe(0);
    expect(user.totp_secret).toBeNull();
  });

  it.each(["admin", "editor"])("refuses to disable MFA for an %s and leaves it enabled (#1253)", async (role) => {
    const { env, headers, rawDb } = createTestEnv({ role, mfaEnrolled: false });
    const userId = role === "admin" ? 1 : 2;
    const setupRes = await mfaSetupHandler.onRequestPost({
      request: new Request("https://example.test/api/admin/mfa/setup", {
        method: "POST",
        headers: buildAuthHeaders(headers),
        body: JSON.stringify({}),
      }),
      env,
    });
    const { secret } = await setupRes.json();
    const enableRes = await mfaEnableHandler.onRequestPost({
      request: new Request("https://example.test/api/admin/mfa/enable", {
        method: "POST",
        headers: buildAuthHeaders(headers),
        body: JSON.stringify({ code: await generateTotpCode(secret) }),
      }),
      env,
    });
    adoptSessionFrom(enableRes, headers);

    const disableRes = await mfaDisableHandler.onRequestPost({
      request: new Request("https://example.test/api/admin/mfa/disable", {
        method: "POST",
        headers: buildAuthHeaders(headers),
        body: JSON.stringify({ code: await generateTotpCode(secret) }),
      }),
      env,
    });
    expect(disableRes.status).toBe(403);
    expect((await disableRes.json()).code).toBe("MFA_REQUIRED_FOR_ROLE");
    const user = rawDb.prepare("SELECT totp_enabled, totp_secret FROM users WHERE id = ?").get(userId);
    expect(user.totp_enabled).toBe(1);
    expect(user.totp_secret).toBeTruthy();
  });
});
