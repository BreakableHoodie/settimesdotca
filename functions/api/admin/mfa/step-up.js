// Step-up re-authentication endpoint (#1324)
// POST /api/admin/mfa/step-up
// Body: { code: string }   -- a current TOTP code, or an unused backup code
//
// Proves the signed-in user still holds their second factor and stamps THIS
// session (lucia_sessions.step_up_at). Identity-changing routes then accept the
// session for STEP_UP_WINDOW_SECONDS. See functions/utils/stepUp.js.
//
// A wrong code is 400 INVALID_MFA_CODE, never 401: the admin client treats any
// 401 as "session gone" and signs the user out. The one deliberate 401 besides
// "no valid session" is STEP_UP_LOCKED, which ends the session too.

import { checkPermission, auditLog } from "../_middleware.js";
import {
  AUTH_ATTEMPT_TYPES,
  MFA_GUESS_LIMIT,
  checkAuthRateLimit,
  mfaGuessAttemptTypes,
  settleAuthAttempt,
  writeAuthAttempt,
} from "../../../utils/authAttempts.js";
import { verifyTotpStep, totpStepIsFresh, verifyBackupCode } from "../../../utils/totp.js";
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

// Never throws: the work this records has already happened (or already failed).
async function settleQuietly(DB, id, outcome) {
  try {
    await settleAuthAttempt(DB, id, outcome);
  } catch (error) {
    console.error("[MFA Step-up] Failed to settle auth attempt:", error?.message || error);
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

  const user = await DB.prepare(
    "SELECT email, totp_secret, totp_enabled, backup_codes, totp_last_step FROM users WHERE id = ?",
  )
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

  // Record the attempt BEFORE checking the code, as a failed row (#1324).
  // Checking first and recording after lets parallel requests all read a count
  // of 0; a row written up front is counted by every request that follows. The
  // limits below therefore count THIS row too, hence the `+ 1`.
  const attemptId = await writeAuthAttempt(DB, {
    attemptType: AUTH_ATTEMPT_TYPES.mfaStepUp,
    email: user.email,
    failureReason: "pending",
    ipAddress,
    success: false,
    userAgent,
    userId,
  });

  // Per USER, no IP, across every 2FA-guessing endpoint: rotating addresses
  // does not help a stolen session. Hitting it ends the session, on purpose.
  const userLimit = await checkAuthRateLimit(DB, {
    attemptType: AUTH_ATTEMPT_TYPES.mfaStepUp,
    attemptTypes: mfaGuessAttemptTypes(),
    maxFailures: MFA_GUESS_LIMIT.maxFailures + 1,
    scope: "user",
    userId,
    windowMs: MFA_GUESS_LIMIT.windowMs,
  });
  if (!userLimit.allowed) {
    await settleQuietly(DB, attemptId, { success: false, failureReason: "user_locked" });
    await DB.prepare("DELETE FROM lucia_sessions WHERE id = ?").bind(sessionId).run();
    return json(401, {
      error: "Session ended",
      code: "STEP_UP_LOCKED",
      message: "Too many failed confirmation attempts. Sign in again.",
    });
  }

  const rateCheck = await checkAuthRateLimit(DB, {
    attemptType: AUTH_ATTEMPT_TYPES.mfaStepUp,
    ipAddress,
    maxFailures: 6,
    scope: "user-and-ip",
    userId,
  });
  if (!rateCheck.allowed) {
    await settleQuietly(DB, attemptId, { success: false, failureReason: "rate_limited" });
    return json(429, {
      error: "Too many attempts",
      message: `Too many failed attempts. Please try again in ${rateCheck.remainingMinutes} minutes.`,
    });
  }

  let verified = false;
  let usedBackupCode = false;
  let remainingBackupCodes = null;
  let totpSecretError = null;
  let matchedStep = null;

  try {
    const totpSecretState = await loadTotpSecret(user.totp_secret, env);
    if (totpSecretState?.secret) {
      // One accepted code per time step (#1333); a replayed step is a wrong code.
      const step = await verifyTotpStep(totpSecretState.secret, code);
      if (totpStepIsFresh(step, user.totp_last_step)) {
        matchedStep = step;
        verified = true;
      }
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
    await settleQuietly(DB, attemptId, { success: false, failureReason: "totp_secret_error" });
    return json(500, { error: "Server error", message: "Failed to verify MFA code" });
  }

  if (!verified) {
    await settleQuietly(DB, attemptId, { success: false, failureReason: "invalid_code" });
    return json(400, {
      error: "Authentication failed",
      code: "INVALID_MFA_CODE",
      message: "Invalid authentication code",
    });
  }

  // The stamp and (for a backup code) the spend commit together or not at
  // all. Both carry the SAME predicate, over the factor as it was read and the
  // session still existing, and the stamp goes first so the spend cannot make
  // its predicate false. If either matches nothing, both did.
  //
  // A TOTP code also claims its time step (#1333). The claim rides in the same
  // predicate, so the stamp commits only if the step is still unspent, and the
  // step write (second, so it cannot falsify the stamp's predicate) carries it
  // too. A parallel request with the same code matches nothing in either.
  const baseFactorPredicate = usedBackupCode
    ? "totp_enabled = ? AND totp_secret IS ? AND backup_codes IS ?"
    : "totp_enabled = ? AND totp_secret IS ?";
  const baseFactorBindings = usedBackupCode
    ? [user.totp_enabled, user.totp_secret ?? null, user.backup_codes ?? null]
    : [user.totp_enabled, user.totp_secret ?? null];
  const claimsStep = !usedBackupCode && matchedStep !== null;
  const factorPredicate = claimsStep
    ? `${baseFactorPredicate} AND (totp_last_step IS NULL OR totp_last_step < ?)`
    : baseFactorPredicate;
  const factorBindings = claimsStep ? [...baseFactorBindings, matchedStep] : baseFactorBindings;
  const factorStillRead = `EXISTS (SELECT 1 FROM users WHERE id = ? AND ${factorPredicate})`;
  const sessionStillExists = "EXISTS (SELECT 1 FROM lucia_sessions WHERE id = ? AND user_id = ?)";

  const statements = [
    DB.prepare(
      `UPDATE lucia_sessions SET step_up_at = unixepoch()
       WHERE id = ? AND user_id = ? AND ${factorStillRead}`,
    ).bind(sessionId, userId, userId, ...factorBindings),
  ];
  if (claimsStep) {
    statements.push(
      DB.prepare(
        `UPDATE users SET totp_last_step = ?
         WHERE id = ? AND ${factorPredicate} AND ${sessionStillExists}`,
      ).bind(matchedStep, userId, ...factorBindings, sessionId, userId),
    );
  }
  if (usedBackupCode) {
    const nextCodes =
      remainingBackupCodes && remainingBackupCodes.length > 0 ? JSON.stringify(remainingBackupCodes) : null;
    statements.push(
      DB.prepare(
        `UPDATE users SET backup_codes = ?
         WHERE id = ? AND ${factorPredicate} AND ${sessionStillExists}`,
      ).bind(nextCodes, userId, ...factorBindings, sessionId, userId),
    );
  }

  const results = await DB.batch(statements);
  if (results.some((result) => result?.meta?.changes === 0)) {
    // If the factor is untouched, the step was spent by a parallel request with
    // this same code: answer exactly as for a wrong code (#1333).
    if (claimsStep) {
      const factorUnchanged = await DB.prepare(`SELECT 1 FROM users WHERE id = ? AND ${baseFactorPredicate}`)
        .bind(userId, ...baseFactorBindings)
        .first();
      if (factorUnchanged) {
        await settleQuietly(DB, attemptId, { success: false, failureReason: "invalid_code" });
        return json(400, {
          error: "Authentication failed",
          code: "INVALID_MFA_CODE",
          message: "Invalid authentication code",
        });
      }
    }
    await settleQuietly(DB, attemptId, { success: false, failureReason: "mfa_changed" });
    return json(409, {
      error: "Conflict",
      code: "MFA_CHANGED",
      message: "Two-factor settings changed. Try again.",
    });
  }

  // From here the step-up has happened. Nothing below may turn it into an error.
  await settleQuietly(DB, attemptId, { success: true });
  await auditLog(env, userId, "mfa.step_up", "user", userId, { backupCode: usedBackupCode }, ipAddress);

  return json(200, {
    success: true,
    stepUpExpiresAt: new Date(Date.now() + STEP_UP_WINDOW_SECONDS * 1000).toISOString(),
  });
}
