// POST /api/admin/users/:id/reset-mfa
// Admin-only recovery for a lost authenticator (#1253 review). Admins and
// editors cannot turn their own 2FA off, so without this a lost phone plus
// lost backup codes could only be fixed with a direct D1 write.
//
// Clears the target's TOTP secret and backup codes and ends everything that
// was authenticated under the old factor: sessions, trusted devices and API
// keys. The target re-enrols on their next login (the 2FA gate sends an admin
// or editor straight to setup). An admin cannot reset their own 2FA here;
// that would turn a stolen admin session into a way to strip the factor.
import { checkPermission } from "../../_middleware.js";
import { auditLogStatement } from "../../../../utils/auditLogStatement.js";
import { getClientIP } from "../../../../utils/request.js";
import { validateId } from "../../../../utils/validation.js";

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const { DB } = env;

  const permCheck = await checkPermission(context, "admin");
  if (permCheck.error) {
    return permCheck.response;
  }

  const admin = permCheck.user;
  const ipAddress = getClientIP(request);

  const idResult = validateId(params.id);
  if (!idResult.valid) {
    return new Response(JSON.stringify({ error: "Bad request", message: idResult.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const userId = idResult.value;

  if (userId === admin.userId) {
    return new Response(
      JSON.stringify({
        error: "Cannot reset your own two-factor authentication",
        code: "CANNOT_RESET_OWN_MFA",
        message: "Ask another admin to reset it.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const target = await DB.prepare("SELECT id, email FROM users WHERE id = ?").bind(userId).first();
    if (!target) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    await DB.batch([
      DB.prepare(
        "UPDATE users SET totp_enabled = 0, totp_secret = NULL, backup_codes = NULL, updated_at = datetime('now') WHERE id = ?",
      ).bind(userId),
      DB.prepare("DELETE FROM lucia_sessions WHERE user_id = ?").bind(userId),
      DB.prepare("DELETE FROM trusted_devices WHERE user_id = ?").bind(userId),
      DB.prepare("UPDATE api_keys SET revoked_at = datetime('now') WHERE created_by = ? AND revoked_at IS NULL").bind(
        userId,
      ),
      auditLogStatement(
        env,
        admin.userId,
        "user.mfa_reset",
        "user",
        userId,
        { adminEmail: admin.email, targetEmail: target.email },
        ipAddress,
      ),
    ]);

    return new Response(JSON.stringify({ success: true, message: "Two-factor authentication reset" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Reset MFA error:", error);
    return new Response(JSON.stringify({ error: "Failed to reset two-factor authentication" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
