// Toggle user status endpoint (activate/deactivate)
// POST /api/admin/users/[id]/toggle-status
// Returns: { success: true } or error

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const { DB } = env;

  try {
    // Get admin session from Authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sessionToken = authHeader.substring(7);

    // Verify admin session
    const session = await DB.prepare(
      `
      SELECT u.id, u.email, u.role, u.name
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > datetime('now') AND u.is_active = 1
    `,
    )
      .bind(sessionToken)
      .first();

    if (!session) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if admin has permission
    if (session.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

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
    if (targetUser.id === session.id) {
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

    // Log the action
    await DB.prepare(
      `
      INSERT INTO auth_audit (action, success, ip_address, user_agent, details)
      VALUES (?, 1, ?, ?, ?)
    `,
    )
      .bind(
        newStatus === 1 ? "user_activated" : "user_deactivated",
        request.headers.get("CF-Connecting-IP") || "unknown",
        request.headers.get("User-Agent") || "unknown",
        JSON.stringify({
          admin_id: session.id,
          admin_email: session.email,
          target_user_id: userId,
          target_user_email: targetUser.email,
          new_status: newStatus === 1 ? "active" : "inactive",
        }),
      )
      .run();

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
