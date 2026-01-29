// MFA backup codes regeneration endpoint
// POST /api/admin/mfa/backup-codes
// Body: { code: string }

import { checkPermission, auditLog } from "../_middleware.js";
import { verifyTotp, generateBackupCodes, hashBackupCode } from "../../../utils/totp.js";
import { getClientIP } from "../../../utils/request.js";

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

  const valid = await verifyTotp(user.totp_secret, code);
  if (!valid) {
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
