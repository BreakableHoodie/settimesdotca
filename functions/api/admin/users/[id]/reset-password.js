// Admin-initiated password reset endpoint
// POST /api/admin/users/[id]/reset-password
// Body: { newPassword: string }
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

    // Audit log the action
    await auditLog(
      env,
      user.userId,
      "user.password_reset",
      "user",
      userId,
      {
        adminEmail: user.email,
        targetEmail: targetUser.email,
      },
      ipAddress,
    );

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
