// MFA disable endpoint
// POST /api/admin/mfa/disable
// Body: { code: string }

import { checkPermission, auditLog } from "../_middleware.js";
import { AUTH_ATTEMPT_TYPES, checkAuthRateLimit, writeAuthAttempt } from "../../../utils/authAttempts.js";
import { verifyTotp, verifyBackupCode } from "../../../utils/totp.js";
import { loadTotpSecret } from "../../../utils/mfaSecrets.js";
import { getClientIP } from "../../../utils/request.js";
import { revokeAllTrustedDevices } from "../../../utils/trustedDevice.js";

function parseBackupCodes(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to parse backup codes:", error);
    return [];
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);

  const auth = await checkPermission(context, "viewer");
  if (auth.error) {
    return auth.response;
  }

  const userId = auth.user.userId;
  const body = await request.json().catch(() => ({}));
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
      }
    );
  }

  const user = await DB.prepare(
    "SELECT email, totp_secret, totp_enabled, backup_codes FROM users WHERE id = ?"
  )
    .bind(userId)
    .first();

  if (!user) {
    return new Response(
      JSON.stringify({
        error: "Not found",
        message: "User not found",
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  if (Number(user.totp_enabled) !== 1) {
    return new Response(
      JSON.stringify({
        error: "Bad request",
        message: "MFA is not enabled for this account",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const rateCheck = await checkAuthRateLimit(DB, {
    attemptType: AUTH_ATTEMPT_TYPES.mfaDisable,
    ipAddress,
    scope: "user-and-ip",
    userId,
  });
  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({
        error: "Too many attempts",
        message: `Too many failed attempts. Please try again in ${rateCheck.remainingMinutes} minutes.`,
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  let verified = false;
  let totpSecretError = null;
  let totpSecretState = null;
  if (user.totp_secret) {
    try {
      totpSecretState = await loadTotpSecret(user.totp_secret, env);
    } catch (error) {
      totpSecretError = error;
      console.error("[MFA Disable] Failed to decrypt TOTP secret:", error?.message || error);
    }
  }

  if (totpSecretState?.secret) {
    verified = await verifyTotp(totpSecretState.secret, code);
  }

  if (!verified) {
    const backupCodes = parseBackupCodes(user.backup_codes);
    const result = await verifyBackupCode(code, backupCodes);
    verified = result.valid;
  }

  if (!verified && totpSecretError) {
    return new Response(
      JSON.stringify({
        error: "Server error",
        message: "Failed to verify MFA code",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  if (!verified) {
    await writeAuthAttempt(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.mfaDisable,
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
      }
    );
  }

  await DB.prepare(
    `UPDATE users
     SET totp_enabled = 0, totp_secret = NULL, backup_codes = NULL
     WHERE id = ?`
  )
    .bind(userId)
    .run();

  await revokeAllTrustedDevices(DB, userId);

  await writeAuthAttempt(DB, {
    attemptType: AUTH_ATTEMPT_TYPES.mfaDisable,
    email: user.email,
    ipAddress,
    success: true,
    userAgent: request.headers.get("User-Agent") || "unknown",
    userId,
  });

  await auditLog(
    env,
    userId,
    "mfa.disabled",
    "user",
    userId,
    { email: user.email },
    ipAddress
  );

  return new Response(
    JSON.stringify({
      success: true,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
