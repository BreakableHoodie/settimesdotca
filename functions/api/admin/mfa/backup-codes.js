// MFA backup codes regeneration endpoint
// POST /api/admin/mfa/backup-codes
// Body: { code: string }

import { checkPermission, auditLog } from "../_middleware.js";
import { verifyTotp, generateBackupCodes, hashBackupCode } from "../../../utils/totp.js";
import { getClientIP } from "../../../utils/request.js";

async function checkRateLimit(DB, userId, ipAddress) {
  const windowMs = 10 * 60 * 1000;
  const windowStart = new Date(Date.now() - windowMs).toISOString();

  const attempts = await DB.prepare(
    `SELECT COUNT(*) as count, MIN(created_at) as earliest_attempt
     FROM auth_attempts
     WHERE user_id = ?
       AND ip_address = ?
       AND attempt_type = 'mfa_backup_codes'
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
    "SELECT email, totp_secret, totp_enabled FROM users WHERE id = ?"
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

  if (Number(user.totp_enabled) !== 1 || !user.totp_secret) {
    return new Response(
      JSON.stringify({
        error: "Bad request",
        message: "MFA must be enabled to regenerate backup codes",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const rateCheck = await checkRateLimit(DB, userId, ipAddress);
  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({
        error: "Too many attempts",
        message: `Too many failed backup code regeneration attempts. Please try again in ${rateCheck.remainingMinutes} minutes.`,
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const valid = await verifyTotp(user.totp_secret, code);
  if (!valid) {
    await DB.prepare(
      `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success, failure_reason)
       VALUES (?, ?, ?, ?, 'mfa_backup_codes', 0, 'invalid_code')`
    )
      .bind(userId, user.email, ipAddress, request.headers.get("User-Agent") || "unknown")
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

  const backupCodes = generateBackupCodes();
  const hashedCodes = await Promise.all(
    backupCodes.map(codeValue => hashBackupCode(codeValue))
  );

  await DB.prepare("UPDATE users SET backup_codes = ? WHERE id = ?")
    .bind(JSON.stringify(hashedCodes), userId)
    .run();

  await DB.prepare(
    `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success)
     VALUES (?, ?, ?, ?, 'mfa_backup_codes', 1)`
  )
    .bind(userId, user.email, ipAddress, request.headers.get("User-Agent") || "unknown")
    .run();

  await auditLog(
    env,
    userId,
    "mfa.backup_codes.regenerated",
    "user",
    userId,
    { email: user.email },
    ipAddress
  );

  return new Response(
    JSON.stringify({
      success: true,
      backupCodes,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
