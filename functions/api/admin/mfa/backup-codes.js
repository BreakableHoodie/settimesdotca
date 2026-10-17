// MFA backup codes regeneration endpoint
// POST /api/admin/mfa/backup-codes
// Body: { code: string }

import { checkPermission, auditLog } from "../_middleware.js";
import { AUTH_ATTEMPT_TYPES } from "../../../utils/authAttempts.js";
import { beginMfaGuess, settleQuietly } from "../../../utils/mfaGuessGate.js";
import {
  verifyTotpStep,
  totpStepIsFresh,
  TOTP_CODE_ALREADY_USED,
  generateBackupCodes,
  hashBackupCode,
} from "../../../utils/totp.js";
import { loadTotpSecret } from "../../../utils/mfaSecrets.js";
import { getClientIP, parseJsonObjectBody } from "../../../utils/request.js";

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

  const user = await DB.prepare("SELECT email, totp_secret, totp_enabled, totp_last_step FROM users WHERE id = ?")
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
      },
    );
  }

  if (Number(user.totp_enabled) !== 1 || !user.totp_secret) {
    return new Response(
      JSON.stringify({
        error: "Bad request",
        message: "MFA must be enabled to regenerate backup codes",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Pending attempt, per-user lockout (ends the session), per-IP limit (#1324).
  const { attemptId, response: limited } = await beginMfaGuess(DB, {
    attemptType: AUTH_ATTEMPT_TYPES.mfaBackupCodes,
    email: user.email,
    ipAddress,
    sessionId: context.data?.session?.id,
    userAgent: request.headers.get("User-Agent") || "unknown",
    userId,
  });
  if (limited) {
    return limited;
  }

  let totpSecretState;
  try {
    totpSecretState = await loadTotpSecret(user.totp_secret, env);
  } catch (error) {
    console.error("[MFA Backup Codes] Failed to decrypt TOTP secret:", error?.message || error);
    await settleQuietly(DB, attemptId, { success: false, failureReason: "totp_secret_error" });
    return new Response(
      JSON.stringify({
        error: "Server error",
        message: "Failed to verify MFA code",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // One accepted code per time step (#1333); a spent step is "already used".
  const matchedStep = await verifyTotpStep(totpSecretState?.secret, code);
  let valid = totpStepIsFresh(matchedStep, user.totp_last_step);
  let replayedCode = matchedStep !== null && !valid;
  if (valid) {
    // Claim the step BEFORE the new codes exist, bound to the factor verified.
    // Losing means a parallel request spent this code (or the factor changed).
    const claimed = await DB.prepare(
      `UPDATE users SET totp_last_step = ?
       WHERE id = ? AND totp_enabled = 1 AND totp_secret = ?
         AND (totp_last_step IS NULL OR totp_last_step < ?)`,
    )
      .bind(matchedStep, userId, user.totp_secret, matchedStep)
      .run();
    valid = claimed?.meta?.changes !== 0;
    if (!valid) {
      const row = await DB.prepare(
        "SELECT totp_last_step AS last_step FROM users WHERE totp_enabled = 1 AND totp_secret = ? AND id = ?",
      )
        .bind(user.totp_secret, userId)
        .first();
      replayedCode = Boolean(row) && row.last_step !== null && row.last_step >= matchedStep;
    }
  }
  if (!valid && replayedCode) {
    await settleQuietly(DB, attemptId, { success: false, failureReason: "replayed_code" });
    return new Response(JSON.stringify({ error: "Authentication failed", ...TOTP_CODE_ALREADY_USED }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!valid) {
    await settleQuietly(DB, attemptId, { success: false, failureReason: "invalid_code" });

    return new Response(
      JSON.stringify({
        error: "Authentication failed",
        code: "INVALID_MFA_CODE",
        message: "Invalid authentication code",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const backupCodes = generateBackupCodes();
  const hashedCodes = await Promise.all(backupCodes.map((codeValue) => hashBackupCode(codeValue)));

  // Only over the factor this request verified: a reset that commits after the
  // read must not get the old secret written back as a pending setup (#1253).
  const written = await DB.prepare(
    "UPDATE users SET backup_codes = ?, totp_secret = ? WHERE id = ? AND totp_enabled = 1 AND totp_secret = ?",
  )
    .bind(
      JSON.stringify(hashedCodes),
      totpSecretState?.shouldPersist ? totpSecretState.encryptedSecret : user.totp_secret,
      userId,
      user.totp_secret,
    )
    .run();

  if (written?.meta?.changes === 0) {
    await settleQuietly(DB, attemptId, { success: false, failureReason: "mfa_changed" });
    return new Response(
      JSON.stringify({
        error: "Conflict",
        code: "MFA_SETUP_CHANGED",
        message: "Two-factor settings changed while this request was running. Reload and try again.",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  await settleQuietly(DB, attemptId, { success: true });

  await auditLog(env, userId, "mfa.backup_codes.regenerated", "user", userId, { email: user.email }, ipAddress);

  return new Response(
    JSON.stringify({
      success: true,
      backupCodes,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
