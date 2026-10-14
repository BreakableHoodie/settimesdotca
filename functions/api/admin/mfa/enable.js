// MFA enable endpoint
// POST /api/admin/mfa/enable
// Body: { code: string }

import { checkPermission, auditLog } from "../_middleware.js";
import { AUTH_ATTEMPT_TYPES, checkAuthRateLimit, writeAuthAttempt } from "../../../utils/authAttempts.js";
import { verifyTotp, generateBackupCodes, hashBackupCode } from "../../../utils/totp.js";
import { loadTotpSecret } from "../../../utils/mfaSecrets.js";
import { getClientIP, parseJsonObjectBody } from "../../../utils/request.js";
import { revokeAllTrustedDevices } from "../../../utils/trustedDevice.js";
import { initializeLucia } from "../../../utils/auth.js";
import { generateCSRFToken, setCSRFCookie } from "../../../utils/csrf.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);

  const auth = await checkPermission(context, "viewer");
  if (auth.error) {
    return auth.response;
  }

  const userId = auth.user.userId;
  const body = await parseJsonObjectBody(request);
  if (body === null) {
    return new Response(JSON.stringify({ error: "Bad request", message: "Authentication code is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { code } = body;

  if (!code) {
    return new Response(
      JSON.stringify({
        error: "Bad request",
        message: "Authentication code is required",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const user = await DB.prepare("SELECT email, totp_secret, totp_enabled FROM users WHERE id = ?").bind(userId).first();

  if (!user) {
    return new Response(
      JSON.stringify({
        error: "Not found",
        message: "User not found",
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (Number(user.totp_enabled) === 1) {
    return new Response(
      JSON.stringify({
        error: "Conflict",
        message: "MFA is already enabled for this account",
      }),
      {
        status: 409,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (!user.totp_secret) {
    return new Response(
      JSON.stringify({
        error: "Bad request",
        message: "MFA setup has not been initiated",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const rateCheck = await checkAuthRateLimit(DB, {
    attemptType: AUTH_ATTEMPT_TYPES.mfaEnable,
    ipAddress,
    scope: "user-and-ip",
    userId,
  });
  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({
        error: "Too many attempts",
        message: `Too many failed MFA enable attempts. Please try again in ${rateCheck.remainingMinutes} minutes.`,
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  let totpSecretState;
  try {
    totpSecretState = await loadTotpSecret(user.totp_secret, env);
  } catch (error) {
    console.error("[MFA Enable] Failed to decrypt TOTP secret:", error?.message || error);
    return new Response(
      JSON.stringify({
        error: "Server error",
        message: "Failed to verify MFA setup",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const valid = await verifyTotp(totpSecretState?.secret, code);
  if (!valid) {
    await writeAuthAttempt(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.mfaEnable,
      email: user.email,
      failureReason: "invalid_code",
      ipAddress,
      success: false,
      userAgent: request.headers.get("User-Agent") || "unknown",
      userId,
    });

    return new Response(
      JSON.stringify({
        error: "Authentication failed",
        message: "Invalid authentication code",
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const backupCodes = generateBackupCodes();
  const hashedCodes = await Promise.all(backupCodes.map((codeValue) => hashBackupCode(codeValue)));

  // `AND totp_enabled = 0`: two concurrent enables with the same code must not
  // both succeed, or the second overwrites the backup codes the first showed.
  const written = await DB.prepare(
    `UPDATE users
     SET totp_enabled = 1, backup_codes = ?, totp_secret = ?
     WHERE id = ? AND totp_enabled = 0`,
  )
    .bind(
      JSON.stringify(hashedCodes),
      totpSecretState?.shouldPersist ? totpSecretState.encryptedSecret : user.totp_secret,
      userId,
    )
    .run();

  if (written?.meta?.changes === 0) {
    return new Response(
      JSON.stringify({
        error: "Conflict",
        message: "MFA is already enabled for this account",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  await revokeAllTrustedDevices(DB, userId);

  // Every session opened before enrolment was opened with the password alone,
  // and the 2FA gate reads the LIVE totp_enabled, so without this a session
  // an attacker opened with a phished password would gain full access the
  // moment the real owner enrolled (#1253 review). Revoke them all and give
  // this request a fresh session, as revoke-all.js does.
  const lucia = context.data?.lucia ?? auth.lucia ?? initializeLucia(DB, request, env);
  await lucia.invalidateUserSessions(userId);
  const newSession = await lucia.createSession(userId, {});
  await DB.prepare("UPDATE lucia_sessions SET ip_address = ?, user_agent = ?, remember_me = 0 WHERE id = ?")
    .bind(ipAddress, request.headers.get("User-Agent"), newSession.id)
    .run();
  const sessionHeaders = new Headers({ "Content-Type": "application/json" });
  sessionHeaders.append("Set-Cookie", lucia.createSessionCookie(newSession.id).serialize());
  sessionHeaders.append("Set-Cookie", setCSRFCookie(generateCSRFToken(request, env, newSession.id), request, env));

  await writeAuthAttempt(DB, {
    attemptType: AUTH_ATTEMPT_TYPES.mfaEnable,
    email: user.email,
    ipAddress,
    success: true,
    userAgent: request.headers.get("User-Agent") || "unknown",
    userId,
  });

  await auditLog(env, userId, "mfa.enabled", "user", userId, { email: user.email }, ipAddress);

  return new Response(
    JSON.stringify({
      success: true,
      backupCodes,
    }),
    {
      status: 200,
      headers: sessionHeaders,
    },
  );
}
