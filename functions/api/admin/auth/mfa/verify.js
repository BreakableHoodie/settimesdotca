// MFA verification endpoint
// POST /api/admin/auth/mfa/verify
// Body: { mfaToken: string, code: string, rememberDevice?: boolean }

import { generateCSRFToken, setCSRFCookie } from "../../../../utils/csrf.js";
import { verifyTotp, verifyBackupCode } from "../../../../utils/totp.js";
import { getClientIP } from "../../../../utils/request.js";
import { initializeLucia } from "../../../../utils/auth.js";
import { AUTH_ATTEMPT_TYPES, checkAuthRateLimit, writeAuthAttempt } from "../../../../utils/authAttempts.js";
import { loadTotpSecret } from "../../../../utils/mfaSecrets.js";
import {
  createTrustedDevice,
  createTrustedDeviceCookie,
} from "../../../../utils/trustedDevice.js";

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

  try {
    const body = await request.json().catch(() => ({}));
    const { mfaToken, code, rememberDevice } = body;

    if (!mfaToken || !code) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "MFA token and code are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const challenge = await DB.prepare(
      `
      SELECT c.id as challenge_id,
             c.user_id,
             c.ip_address,
             c.user_agent,
             u.email,
             u.name,
             u.role,
             u.is_active,
             u.totp_enabled,
             u.totp_secret,
             u.backup_codes
      FROM mfa_challenges c
      INNER JOIN users u ON u.id = c.user_id
      WHERE c.token = ? AND c.used = 0 AND c.expires_at > datetime('now')
    `
    )
      .bind(mfaToken)
      .first();

    if (!challenge) {
      const invalidTokenRateCheck = await checkAuthRateLimit(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.mfa,
        ipAddress,
        scope: "ip",
      });
      if (!invalidTokenRateCheck.allowed) {
        return new Response(
          JSON.stringify({
            error: "Too many attempts",
            message: `Too many failed MFA attempts. Please try again in ${invalidTokenRateCheck.remainingMinutes} minutes.`,
          }),
          {
            status: 429,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      await writeAuthAttempt(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.mfa,
        failureReason: "invalid_or_expired_token",
        ipAddress,
        success: false,
        userAgent,
      });

      return new Response(
        JSON.stringify({
          error: "Authentication failed",
          message: "Invalid or expired MFA token",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const ipMismatch =
      challenge.ip_address &&
      challenge.ip_address !== "unknown" &&
      ipAddress !== "unknown" &&
      challenge.ip_address !== ipAddress;
    const uaMismatch =
      challenge.user_agent &&
      userAgent &&
      challenge.user_agent !== "unknown" &&
      challenge.user_agent !== userAgent;

    if (ipMismatch || uaMismatch) {
      await writeAuthAttempt(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.mfa,
        email: challenge.email,
        failureReason: "challenge_mismatch",
        ipAddress,
        success: false,
        userAgent,
        userId: challenge.user_id,
      });

      return new Response(
        JSON.stringify({
          error: "Authentication failed",
          message: "MFA session mismatch",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (Number(challenge.is_active) === 0) {
      await writeAuthAttempt(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.mfa,
        email: challenge.email,
        failureReason: "account_disabled",
        ipAddress,
        success: false,
        userAgent,
        userId: challenge.user_id,
      });

      return new Response(
        JSON.stringify({
          error: "Account disabled",
          message: "Your account has been deactivated.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const rateCheck = await checkAuthRateLimit(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.mfa,
      ipAddress,
      scope: "user-and-ip",
      userId: challenge.user_id,
    });
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: "Too many attempts",
          message: `Too many failed MFA attempts. Please try again in ${rateCheck.remainingMinutes} minutes.`,
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let verified = false;
    let remainingBackupCodes = null;
    let usedBackupCode = false;
    let totpSecretError = null;
    let totpSecretState = null;

    if (Number(challenge.totp_enabled) === 1 && challenge.totp_secret) {
      try {
        totpSecretState = await loadTotpSecret(challenge.totp_secret, env);
      } catch (error) {
        totpSecretError = error;
        console.error("[MFA Verify] Failed to decrypt TOTP secret:", error?.message || error);
      }
    }

    if (totpSecretState?.secret) {
      try {
        verified = await verifyTotp(totpSecretState.secret, code);
      } catch (totpError) {
        console.error("[MFA Verify] TOTP verification threw:", totpError?.message || totpError);
        verified = false;
      }
    }

    if (!verified) {
      const backupCodes = parseBackupCodes(challenge.backup_codes);
      const backupResult = await verifyBackupCode(code, backupCodes);
      if (backupResult.valid) {
        verified = true;
        usedBackupCode = true;
        remainingBackupCodes = backupResult.remaining;
      }
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
        attemptType: AUTH_ATTEMPT_TYPES.mfa,
        email: challenge.email,
        failureReason: "invalid_code",
        ipAddress,
        success: false,
        userAgent,
        userId: challenge.user_id,
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

    // Atomically mark challenge as used BEFORE creating session.
    // The WHERE used = 0 ensures only one concurrent request can succeed.
    const markUsed = await DB.prepare(
      `UPDATE mfa_challenges
       SET used = 1, used_at = datetime('now')
       WHERE id = ? AND used = 0`
    )
      .bind(challenge.challenge_id)
      .run();

    if (!markUsed.meta.changes) {
      return new Response(
        JSON.stringify({
          error: "Authentication failed",
          message: "MFA challenge already used",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (totpSecretState?.shouldPersist || usedBackupCode) {
      const setClauses = [];
      const bindValues = [];

      if (totpSecretState?.shouldPersist) {
        setClauses.push("totp_secret = ?");
        bindValues.push(totpSecretState.encryptedSecret);
      }

      if (usedBackupCode) {
        const nextCodes =
          remainingBackupCodes && remainingBackupCodes.length > 0
            ? JSON.stringify(remainingBackupCodes)
            : null;
        setClauses.push("backup_codes = ?");
        bindValues.push(nextCodes);
      }

      await DB.prepare(
        `UPDATE users
         SET ${setClauses.join(", ")}
         WHERE id = ?`
      )
        .bind(...bindValues, challenge.user_id)
        .run();
    }

    const lucia = initializeLucia(DB, request, env);
    const session = await lucia.createSession(challenge.user_id, {});

    await DB.prepare(
      `UPDATE lucia_sessions
       SET ip_address = ?, user_agent = ?, remember_me = ?
       WHERE id = ?`
    )
      .bind(ipAddress, userAgent, 0, session.id)
      .run();

    await DB.prepare(
      "UPDATE users SET last_login = datetime('now') WHERE id = ?"
    )
      .bind(challenge.user_id)
      .run();

    await writeAuthAttempt(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.mfa,
      email: challenge.email,
      ipAddress,
      success: true,
      userAgent,
      userId: challenge.user_id,
    });

    const csrfToken = generateCSRFToken(request, env, session.id);
    const headers = new Headers({
      "Content-Type": "application/json",
    });
    headers.append("Set-Cookie", lucia.createSessionCookie(session.id).serialize());
    headers.append("Set-Cookie", setCSRFCookie(csrfToken, request));

    // Create trusted device if requested
    if (rememberDevice) {
      try {
        const trustedDevice = await createTrustedDevice(
          DB,
          challenge.user_id,
          ipAddress,
          userAgent
        );
        headers.append(
          "Set-Cookie",
          createTrustedDeviceCookie(trustedDevice.token, request, env)
        );
      } catch (err) {
        // Don't fail login if trusted device creation fails
        console.error("[MFA Verify] Failed to create trusted device:", err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: challenge.user_id,
          email: challenge.email,
          name: challenge.name,
          role: challenge.role,
        },
      }),
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    console.error("MFA verify error:", error);

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
}
