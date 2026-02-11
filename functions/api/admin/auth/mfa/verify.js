// MFA verification endpoint
// POST /api/admin/auth/mfa/verify
// Body: { mfaToken: string, code: string, rememberDevice?: boolean }

import { generateCSRFToken, setCSRFCookie } from "../../../../utils/csrf.js";
import { verifyTotp, verifyBackupCode } from "../../../../utils/totp.js";
import { getClientIP } from "../../../../utils/request.js";
import { initializeLucia } from "../../../../utils/auth.js";
import {
  createTrustedDevice,
  createTrustedDeviceCookie,
} from "../../../../utils/trustedDevice.js";

async function checkRateLimit(DB, userId, ipAddress) {
  const windowMs = 10 * 60 * 1000;
  const windowStart = new Date(Date.now() - windowMs).toISOString();

  const attempts = await DB.prepare(
    `SELECT COUNT(*) as count, MIN(created_at) as earliest_attempt
     FROM auth_attempts
     WHERE (user_id = ? OR ip_address = ?)
       AND attempt_type = 'mfa'
       AND success = 0
       AND created_at > ?`
  )
    .bind(userId, ipAddress, windowStart)
    .first();

  if (Number(attempts.count) >= 5) {
    const earliestTs = attempts.earliest_attempt
      ? new Date(attempts.earliest_attempt).getTime()
      : Date.now();
    const elapsed = Date.now() - earliestTs;
    const remainingMs = Math.max(0, windowMs - elapsed);
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));

    return {
      allowed: false,
      remainingMinutes,
    };
  }

  return { allowed: true };
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
      await DB.prepare(
        `INSERT INTO auth_attempts (email, ip_address, user_agent, attempt_type, success, failure_reason)
         VALUES (?, ?, ?, 'mfa', 0, 'invalid_or_expired_token')`
      )
        .bind(null, ipAddress, userAgent)
        .run();

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
      await DB.prepare(
        `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success, failure_reason)
         VALUES (?, ?, ?, ?, 'mfa', 0, 'challenge_mismatch')`
      )
        .bind(challenge.user_id, challenge.email, ipAddress, userAgent)
        .run();

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
      await DB.prepare(
        `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success, failure_reason)
         VALUES (?, ?, ?, ?, 'mfa', 0, 'account_disabled')`
      )
        .bind(challenge.user_id, challenge.email, ipAddress, userAgent)
        .run();

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

    const rateCheck = await checkRateLimit(DB, challenge.user_id, ipAddress);
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

    if (Number(challenge.totp_enabled) === 1 && challenge.totp_secret) {
      try {
        verified = await verifyTotp(challenge.totp_secret, code);
        console.log("[MFA Verify] TOTP verification result:", verified);
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

    if (!verified) {
      await DB.prepare(
        `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success, failure_reason)
         VALUES (?, ?, ?, ?, 'mfa', 0, 'invalid_code')`
      )
        .bind(challenge.user_id, challenge.email, ipAddress, userAgent)
        .run();

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

    const lucia = initializeLucia(DB, request);
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

    if (usedBackupCode) {
      const nextCodes =
        remainingBackupCodes && remainingBackupCodes.length > 0
          ? JSON.stringify(remainingBackupCodes)
          : null;
      await DB.prepare(
        "UPDATE users SET backup_codes = ? WHERE id = ?"
      )
        .bind(nextCodes, challenge.user_id)
        .run();
    }

    await DB.prepare(
      `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success)
       VALUES (?, ?, ?, ?, 'mfa', 1)`
    )
      .bind(challenge.user_id, challenge.email, ipAddress, userAgent)
      .run();

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
          createTrustedDeviceCookie(trustedDevice.token, request)
        );
        console.log("[MFA Verify] Created trusted device for user:", challenge.user_id);
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
