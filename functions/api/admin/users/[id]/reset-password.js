// Admin-initiated password reset endpoint
// POST /api/admin/users/[id]/reset-password
// Body: { newPassword: string }
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
    const { newPassword } = await request.json().catch(() => ({}));

    // Validate password strength
    if (!newPassword || newPassword.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

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

    if (targetUser.is_active === 0) {
      return new Response(
        JSON.stringify({ error: "Cannot reset password for inactive user" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Hash the new password (in production, use bcrypt or similar)
    const passwordHash = await hashPassword(newPassword);

    // Update user's password
    await DB.prepare(
      `
      UPDATE users
      SET password_hash = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
    )
      .bind(passwordHash, userId)
      .run();

    // Log the action to audit_log
    await DB.prepare(
      `
      INSERT INTO audit_log (user_id, action, resource_type, resource_id, details)
      VALUES (?, 'user.password_reset', 'user', ?, ?)
    `,
    )
      .bind(
        session.id,
        userId,
        JSON.stringify({
          admin_email: session.email,
          target_email: targetUser.email,
        }),
      )
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        message: `Password updated for ${targetUser.email}`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Admin password reset error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to reset password" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// Simple password hashing (in production, use bcrypt or argon2)
async function hashPassword(password) {
  // For testing, just prepend 'hashed_'
  // In production, use: await bcrypt.hash(password, 10)
  return `hashed_${password}`;
}
