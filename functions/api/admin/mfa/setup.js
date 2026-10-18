// MFA setup endpoint
// POST /api/admin/mfa/setup
// Body (only when 2FA is already on): { code: string }
//
// First-time setup writes the new secret over a disabled factor. While 2FA is
// ON the same endpoint starts a RE-ENROLMENT (#1318): the caller must prove
// the current factor (a fresh TOTP code or an unused backup code), and the new
// secret goes into `totp_pending_secret`. The live `totp_secret` is untouched,
// so the old authenticator keeps working until `mfa/enable` confirms a code
// from the new app and swaps them.

import { checkPermission, auditLog } from "../_middleware.js";
import {
  generateTotpSecret,
  buildOtpAuthUrl,
  verifyTotpStep,
  totpStepIsFresh,
  verifyBackupCode,
  TOTP_CODE_ALREADY_USED,
} from "../../../utils/totp.js";
import { encryptTotpSecret, loadTotpSecret } from "../../../utils/mfaSecrets.js";
import { AUTH_ATTEMPT_TYPES } from "../../../utils/authAttempts.js";
import { beginMfaGuess, settleQuietly } from "../../../utils/mfaGuessGate.js";
import { getClientIP, parseJsonObjectBody } from "../../../utils/request.js";

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

const alreadyEnabled = () => json(409, { error: "Conflict", message: "MFA is already enabled for this account" });

const factorChanged = () =>
  json(409, {
    error: "Conflict",
    code: "MFA_SETUP_CHANGED",
    message: "Two-factor settings changed while this request was running. Reload and try again.",
  });

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);

  const auth = await checkPermission(context, "viewer");
  if (auth.error) {
    return auth.response;
  }

  const userId = auth.user.userId;

  const user = await DB.prepare(
    "SELECT email, totp_enabled, totp_secret, backup_codes, totp_last_step FROM users WHERE id = ?",
  )
    .bind(userId)
    .first();

  if (!user) {
    return json(404, { error: "Not found", message: "User not found" });
  }

  const reenrolling = Number(user.totp_enabled) === 1;
  let code = "";
  if (reenrolling) {
    const body = await parseJsonObjectBody(request);
    code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code) {
      return json(409, {
        error: "Conflict",
        code: "MFA_CODE_REQUIRED_TO_REENROL",
        message: "MFA is already enabled. Enter a current authenticator or backup code to move to a new app.",
      });
    }
  }

  // Proof of the CURRENT factor. Pending attempt, per-user lockout (ends the
  // session), per-IP limit: the same guess budget as every other endpoint that
  // takes a code from a live session (#1324).
  let attemptId = null;
  let matchedStep = null;
  let remainingBackupCodes = null;
  if (reenrolling) {
    const gate = await beginMfaGuess(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.mfaReenrol,
      email: user.email,
      ipAddress,
      sessionId: context.data?.session?.id,
      userAgent: request.headers.get("User-Agent") || "unknown",
      userId,
    });
    if (gate.response) {
      return gate.response;
    }
    attemptId = gate.attemptId;

    let totpSecretState = null;
    if (user.totp_secret) {
      try {
        totpSecretState = await loadTotpSecret(user.totp_secret, env);
      } catch (error) {
        console.error("[MFA Setup] Failed to decrypt TOTP secret:", error?.message || error);
        await settleQuietly(DB, attemptId, { success: false, failureReason: "totp_secret_error" });
        return json(500, { error: "Server error", message: "Failed to verify MFA code" });
      }
    }

    let replayedCode = false;
    if (totpSecretState?.secret) {
      // One accepted code per time step (#1333); a spent step is "already used".
      const step = await verifyTotpStep(totpSecretState.secret, code);
      if (totpStepIsFresh(step, user.totp_last_step)) {
        matchedStep = step;
      } else if (step !== null) {
        replayedCode = true;
      }
    }
    if (matchedStep === null && !replayedCode) {
      const result = await verifyBackupCode(code, parseBackupCodes(user.backup_codes));
      if (result.valid) {
        remainingBackupCodes = result.remaining;
      }
    }

    if (replayedCode) {
      await settleQuietly(DB, attemptId, { success: false, failureReason: "replayed_code" });
      return json(400, { error: "Authentication failed", ...TOTP_CODE_ALREADY_USED });
    }
    if (matchedStep === null && remainingBackupCodes === null) {
      await settleQuietly(DB, attemptId, { success: false, failureReason: "invalid_code" });
      return json(400, {
        error: "Authentication failed",
        code: "INVALID_MFA_CODE",
        message: "Invalid authentication code",
      });
    }
  }

  const secret = generateTotpSecret();
  const otpauthUrl = buildOtpAuthUrl({
    secret,
    email: user.email,
    issuer: "SetTimes",
  });

  let encryptedSecret;
  try {
    encryptedSecret = await encryptTotpSecret(secret, env);
  } catch (error) {
    console.error("[MFA Setup] Failed to encrypt TOTP secret:", error?.message || error);
    if (attemptId) await settleQuietly(DB, attemptId, { success: false, failureReason: "encrypt_error" });
    return json(500, { error: "Server error", message: "Failed to initialize MFA setup" });
  }

  if (!reenrolling) {
    // `AND totp_enabled = 0` re-checks the 409 guard above at write time, so an
    // enable committing in between can never be overwritten back to disabled.
    const written = await DB.prepare(
      `UPDATE users
       SET totp_secret = ?, totp_pending_secret = NULL, totp_enabled = 0, backup_codes = NULL, totp_last_step = NULL
       WHERE id = ? AND totp_enabled = 0`,
    )
      .bind(encryptedSecret, userId)
      .run();

    if (written?.meta?.changes === 0) {
      return alreadyEnabled();
    }

    await auditLog(env, userId, "mfa.setup", "user", userId, { email: user.email }, ipAddress);
    return json(200, { secret, otpauthUrl });
  }

  // ONE conditional write claims the proof and stores the pending secret, over
  // the factor exactly as it was read. A TOTP code claims its time step in the
  // same statement; a backup code is spent in it. Losing the race (a parallel
  // use of the same code, an admin reset, a disable) writes nothing at all.
  const usedBackupCode = matchedStep === null;
  const written = usedBackupCode
    ? await DB.prepare(
        `UPDATE users SET totp_pending_secret = ?, backup_codes = ?
         WHERE id = ? AND totp_enabled = 1 AND totp_secret IS ? AND backup_codes IS ?`,
      )
        .bind(
          encryptedSecret,
          remainingBackupCodes.length > 0 ? JSON.stringify(remainingBackupCodes) : null,
          userId,
          user.totp_secret ?? null,
          user.backup_codes ?? null,
        )
        .run()
    : await DB.prepare(
        `UPDATE users SET totp_pending_secret = ?, totp_last_step = ?
         WHERE id = ? AND totp_enabled = 1 AND totp_secret IS ?
           AND (totp_last_step IS NULL OR totp_last_step < ?)`,
      )
        .bind(encryptedSecret, matchedStep, userId, user.totp_secret ?? null, matchedStep)
        .run();

  if (written?.meta?.changes === 0) {
    if (!usedBackupCode) {
      const row = await DB.prepare(
        "SELECT totp_last_step AS last_step FROM users WHERE id = ? AND totp_enabled = 1 AND totp_secret IS ?",
      )
        .bind(userId, user.totp_secret ?? null)
        .first();
      if (row && row.last_step !== null && row.last_step >= matchedStep) {
        await settleQuietly(DB, attemptId, { success: false, failureReason: "replayed_code" });
        return json(400, { error: "Authentication failed", ...TOTP_CODE_ALREADY_USED });
      }
    }
    await settleQuietly(DB, attemptId, { success: false, failureReason: "mfa_changed" });
    return factorChanged();
  }

  await settleQuietly(DB, attemptId, { success: true });
  await auditLog(
    env,
    userId,
    "mfa.reenrol_started",
    "user",
    userId,
    { email: user.email, backupCode: usedBackupCode },
    ipAddress,
  );

  return json(200, { secret, otpauthUrl, reenrol: true });
}
