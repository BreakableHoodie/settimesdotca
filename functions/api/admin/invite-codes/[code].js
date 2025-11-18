// Admin invite code management
// DELETE /api/admin/invite-codes/[code] - Revoke invite code

import { checkPermission, auditLog } from "../_middleware.js";

// Get client IP from request
function getClientIP(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
    "unknown"
  );
}

// DELETE - Revoke invite code
export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const { DB } = env;
  const { code } = params;

  // RBAC: Require admin role
  const permCheck = await checkPermission(request, env, "admin");
  if (permCheck.error) {
    return permCheck.response;
  }

  const user = permCheck.user;
  const ipAddress = getClientIP(request);

  try {
    // Check if invite exists
    const invite = await DB.prepare(
      `SELECT * FROM invite_codes WHERE code = ?`,
    )
      .bind(code)
      .first();

    if (!invite) {
      return new Response(
        JSON.stringify({
          error: "Not found",
          message: "Invite code not found",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Deactivate invite code
    await DB.prepare(
      `UPDATE invite_codes SET is_active = 0 WHERE code = ?`,
    )
      .bind(code)
      .run();

    // Audit log
    await auditLog(
      env,
      user.userId,
      "invite_code.revoked",
      "invite_code",
      invite.id,
      {
        code,
        wasUsed: invite.used_by_user_id !== null,
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Invite code revoked",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error revoking invite code:", error);

    return new Response(
      JSON.stringify({
        error: "Server error",
        message: "Failed to revoke invite code",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
