// Toggle user status endpoint (activate/deactivate)
// POST /api/admin/users/[id]/toggle-status
// Returns: { success: true } or error

import { checkPermission, auditLog } from "../../_middleware.js";

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const { DB } = env;

  // RBAC: Require admin role
  const permCheck = await checkPermission(request, env, "admin");
  if (permCheck.error) {
    return permCheck.response;
  }

  const user = permCheck.user;
  const ipAddress =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
    "unknown";

  try {

    const userId = params.id;

    // Get target user
    const targetUser = await DB.prepare(
      `
      SELECT id, email, name, is_active
      FROM users
      WHERE id = ?
    `,
    )
      .bind(userId)
      .first();

    if (!targetUser) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Prevent admin from deactivating themselves
    if (targetUser.id === user.userId) {
      return new Response(
        JSON.stringify({ error: "Cannot deactivate your own account" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Toggle user status
    const newStatus = targetUser.is_active === 1 ? 0 : 1;
    await DB.prepare(
      `
      UPDATE users
      SET is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
    )
      .bind(newStatus, userId)
      .run();

    // If deactivating, invalidate all sessions for this user
    if (newStatus === 0) {
      await DB.prepare(
        `
        DELETE FROM sessions
        WHERE user_id = ?
      `,
      )
        .bind(userId)
        .run();
    }

    // Audit log the action
    await auditLog(
      env,
      user.userId,
      newStatus === 1 ? "user.activated" : "user.deactivated",
      "user",
      userId,
      {
        adminEmail: user.email,
        targetEmail: targetUser.email,
        newStatus: newStatus === 1 ? "active" : "inactive",
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: `User ${newStatus === 1 ? "activated" : "deactivated"} successfully`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Toggle user status error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to update user status" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
