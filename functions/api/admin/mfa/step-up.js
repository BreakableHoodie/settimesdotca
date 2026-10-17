// Step-up re-authentication endpoint (#1324)
// POST /api/admin/mfa/step-up
// Body: { code: string }   -- a current TOTP code, or an unused backup code
//
// Proves the signed-in user still holds their second factor and stamps THIS
// session (lucia_sessions.step_up_at). Identity-changing routes then accept the
// session for STEP_UP_WINDOW_SECONDS. See functions/utils/stepUp.js.

import { checkPermission, auditLog } from "../_middleware.js";
import { AUTH_ATTEMPT_TYPES, checkAuthRateLimit, writeAuthAttempt } from "../../../utils/authAttempts.js";
import { verifyTotp, verifyBackupCode } from "../../../utils/totp.js";
import { loadTotpSecret } from "../../../utils/mfaSecrets.js";
import { getClientIP, parseJsonObjectBody } from "../../../utils/request.js";
import { STEP_UP_WINDOW_SECONDS } from "../../../utils/stepUp.js";

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

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
  const userAgent = request.headers.get("User-Agent") || "unknown";

  const auth = await checkPermission(context, "viewer");
  if (auth.error) {
    return auth.response;
  }

  // A key has no second factor to present. The middleware refuses keys under
  // /api/admin/mfa/ before this runs; this is the backstop.
  if (context.data?.apiKey) {
    return json(403, { error: "Forbidden", code: "STEP_UP_KEY_FORBIDDEN", message: "API keys cannot step up." });
  }

  // Fail closed: without the session id there is nothing to stamp.
  const sessionId = context.data?.session?.id;
  if (!sessionId) {
    return json(401, { error: "Unauthorized", message: "Valid session required" });
  }

  const userId = auth.user.userId;
  const body = await parseJsonObjectBody(request);
  if (body === null) {
    return json(400, { error: "Bad request", message: "Authentication code is required" });
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return json(400, { error: "Bad request", message: "Authentication code is required" });
  }

  const user = await DB.prepare("SELECT email, totp_secret, totp_enabled, backup_codes FROM users WHERE id = ?")
    .bind(userId)
    .first();
  if (!user) {
    return json(404, { error: "Not found", message: "User not found" });
  }
  if (Number(user.totp_enabled) !== 1 || !user.totp_secret) {
    return json(400, {
      error: "Bad request",
      code: "MFA_NOT_ENABLED",
      message: "Turn on two-factor authentication to confirm this action.",
    });
  }

  const rateCheck = await checkAuthRateLimit(DB, {
    attemptType: AUTH_ATTEMPT_TYPES.mfaStepUp,
    ipAddress,
    scope: "user-and-ip",
    userId,
  });
  if (!rateCheck.allowed) {
    return json(429, {
      error: "Too many attempts",
      message: `Too many failed attempts. Please try again in ${rateCheck.remainingMinutes} minutes.`,
    });
  }

  let verified = false;
  let usedBackupCode = false;
  let remainingBackupCodes = null;
  let totpSecretError = null;

  try {
    const totpSecretState = await loadTotpSecret(user.totp_secret, env);
    if (totpSecretState?.secret) {
      verified = await verifyTotp(totpSecretState.secret, code);
    }
  } catch (error) {
    totpSecretError = error;
    console.error("[MFA Step-up] Failed to verify TOTP:", error?.message || error);
  }

  if (!verified) {
    const result = await verifyBackupCode(code, parseBackupCodes(user.backup_codes));
    if (result.valid) {
      verified = true;
      usedBackupCode = true;
      remainingBackupCodes = result.remaining;
    }
  }

  if (!verified && totpSecretError) {
    return json(500, { error: "Server error", message: "Failed to verify MFA code" });
  }

  if (!verified) {
    await writeAuthAttempt(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.mfaStepUp,
      email: user.email,
      failureReason: "invalid_code",
      ipAddress,
      success: false,
      userAgent,
      userId,
    });
    return json(401, { error: "Authentication failed", message: "Invalid authentication code" });
  }

  if (usedBackupCode) {
    // Spend the code only over the list this request read (#1253): two
    // requests presenting the same code must not both succeed, and a reset
    // that landed meanwhile must not be undone. Nothing is stamped if the
    // write lost.
    const nextCodes =
      remainingBackupCodes && remainingBackupCodes.length > 0 ? JSON.stringify(remainingBackupCodes) : null;
    const written = await DB.prepare(
      `UPDATE users SET backup_codes = ?
       WHERE id = ? AND totp_enabled = ? AND totp_secret IS ? AND backup_codes IS ?`,
    )
      .bind(nextCodes, userId, user.totp_enabled, user.totp_secret ?? null, user.backup_codes ?? null)
      .run();
    if (written?.meta?.changes === 0) {
      return json(409, {
        error: "Conflict",
        code: "MFA_CHANGED",
        message: "Two-factor settings changed. Try again.",
      });
    }
  }

  const stamped = await DB.prepare("UPDATE lucia_sessions SET step_up_at = unixepoch() WHERE id = ? AND user_id = ?")
    .bind(sessionId, userId)
    .run();
  if (stamped?.meta?.changes === 0) {
    return json(401, { error: "Unauthorized", message: "Valid session required" });
  }

  await writeAuthAttempt(DB, {
    attemptType: AUTH_ATTEMPT_TYPES.mfaStepUp,
    email: user.email,
    ipAddress,
    success: true,
    userAgent,
    userId,
  });
  await auditLog(env, userId, "mfa.step_up", "user", userId, { backupCode: usedBackupCode }, ipAddress);

  return json(200, {
    success: true,
    stepUpExpiresAt: new Date(Date.now() + STEP_UP_WINDOW_SECONDS * 1000).toISOString(),
  });
}
