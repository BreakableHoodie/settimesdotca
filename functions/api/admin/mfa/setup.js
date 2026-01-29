// MFA setup endpoint
// POST /api/admin/mfa/setup

import { checkPermission, auditLog } from "../_middleware.js";
import { generateTotpSecret, buildOtpAuthUrl } from "../../../utils/totp.js";
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

  const user = await DB.prepare(
    "SELECT email, totp_enabled FROM users WHERE id = ?"
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

  if (Number(user.totp_enabled) === 1) {
    return new Response(
      JSON.stringify({
        error: "Conflict",
        message: "MFA is already enabled for this account",
      }),
      {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const secret = generateTotpSecret();
  const otpauthUrl = buildOtpAuthUrl({
    secret,
    email: user.email,
    issuer: "SetTimes",
  });

  await DB.prepare(
    `UPDATE users
     SET totp_secret = ?, totp_enabled = 0, backup_codes = NULL
     WHERE id = ?`
  )
    .bind(secret, userId)
    .run();

  await auditLog(
    env,
    userId,
    "mfa.setup",
    "user",
    userId,
    { email: user.email },
    ipAddress
  );

  return new Response(
    JSON.stringify({
      secret,
      otpauthUrl,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
