// MFA status endpoint
// GET /api/admin/mfa/status

import { checkPermission } from "../_middleware.js";

export async function onRequestGet(context) {
  const { env } = context;
  const { DB } = env;

  const auth = await checkPermission(context, "viewer");
  if (auth.error) {
    return auth.response;
  }

  const userId = auth.user.userId;

  const user = await DB.prepare(
    `
    SELECT totp_enabled, totp_secret, backup_codes
    FROM users
    WHERE id = ?
  `
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

  const totpEnabled = Number(user.totp_enabled) === 1;
  const setupPending = !totpEnabled && Boolean(user.totp_secret);
  const hasBackupCodes = Boolean(user.backup_codes);

  return new Response(
    JSON.stringify({
      totpEnabled,
      setupPending,
      hasBackupCodes,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
