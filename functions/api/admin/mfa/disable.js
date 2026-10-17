// MFA disable endpoint
// POST /api/admin/mfa/disable
// Body: { code: string }

import { checkPermission, auditLog } from "../_middleware.js";
import { mfaRequiredForRole } from "../../../utils/mfaPolicy.js";
import { AUTH_ATTEMPT_TYPES } from "../../../utils/authAttempts.js";
import { beginMfaGuess, settleQuietly } from "../../../utils/mfaGuessGate.js";
import { verifyTotpStep, totpStepIsFresh, verifyBackupCode, TOTP_CODE_ALREADY_USED } from "../../../utils/totp.js";
import { loadTotpSecret } from "../../../utils/mfaSecrets.js";
import { getClientIP, parseJsonObjectBody } from "../../../utils/request.js";
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

  // Admins and editors must keep 2FA on (#1253). Refused before the code is
  // even checked: the answer does not depend on it.
  if (mfaRequiredForRole(auth.user.role)) {
    return new Response(
      JSON.stringify({
        error: "Two-factor authentication is required for your role",
        code: "MFA_REQUIRED_FOR_ROLE",
        message: "Admins and editors cannot turn off two-factor authentication.",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const userId = auth.user.userId;
  const body = await parseJsonObjectBody(request);
  if (body === null) {
    return new Response(JSON.stringify({ error: "Bad request", message: "JSON object body is required" }), {
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

  const user = await DB.prepare(
    "SELECT email, totp_secret, totp_enabled, backup_codes, totp_last_step FROM users WHERE id = ?",
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
      },
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
      },
    );
  }

  // Pending attempt, per-user lockout (ends the session), per-IP limit (#1324).
  const { attemptId, response: limited } = await beginMfaGuess(DB, {
    attemptType: AUTH_ATTEMPT_TYPES.mfaDisable,
    email: user.email,
    ipAddress,
    sessionId: context.data?.session?.id,
    userAgent: request.headers.get("User-Agent") || "unknown",
    userId,
  });
  if (limited) {
    return limited;
  }

  let verified = false;
  let replayedCode = false;
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
    // One accepted code per time step (#1333); a spent step is "already used".
    const step = await verifyTotpStep(totpSecretState.secret, code);
    if (totpStepIsFresh(step, user.totp_last_step)) {
      // Claim the step before the effect, bound to the factor just verified.
      const claimed = await DB.prepare(
        `UPDATE users SET totp_last_step = ?
         WHERE id = ? AND totp_enabled = 1 AND totp_secret IS ?
           AND (totp_last_step IS NULL OR totp_last_step < ?)`,
      )
        .bind(step, userId, user.totp_secret ?? null, step)
        .run();
      verified = claimed?.meta?.changes !== 0;
      if (!verified) {
        // Lost the claim: a parallel request spent this step, unless the factor
        // itself changed underneath us (then it is just a failed code).
        const row = await DB.prepare(
          "SELECT totp_last_step AS last_step FROM users WHERE id = ? AND totp_enabled = 1 AND totp_secret IS ?",
        )
          .bind(userId, user.totp_secret ?? null)
          .first();
        replayedCode = Boolean(row) && row.last_step !== null && row.last_step >= step;
      }
    } else if (step !== null) {
      replayedCode = true;
    }
  }

  if (!verified && !replayedCode) {
    const backupCodes = parseBackupCodes(user.backup_codes);
    const result = await verifyBackupCode(code, backupCodes);
    verified = result.valid;
  }

  if (!verified && totpSecretError) {
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

  if (!verified && replayedCode) {
    await settleQuietly(DB, attemptId, { success: false, failureReason: "replayed_code" });
    return new Response(JSON.stringify({ error: "Authentication failed", ...TOTP_CODE_ALREADY_USED }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!verified) {
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

  await DB.prepare(
    `UPDATE users
     SET totp_enabled = 0, totp_secret = NULL, backup_codes = NULL, totp_last_step = NULL
     WHERE id = ?`,
  )
    .bind(userId)
    .run();

  await revokeAllTrustedDevices(DB, userId);

  await settleQuietly(DB, attemptId, { success: true });

  await auditLog(env, userId, "mfa.disabled", "user", userId, { email: user.email }, ipAddress);

  return new Response(
    JSON.stringify({
      success: true,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
