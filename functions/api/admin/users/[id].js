// Individual user management endpoints
// PATCH /api/admin/users/:id - Update user
// DELETE /api/admin/users/:id - Delete user (soft delete)

import { checkPermission, auditLog } from "../_middleware.js";
import { getClientIP } from "../../../utils/request.js";

// PATCH - Update user (admin only, users can update own name)
export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const { DB } = env;
  const userId = parseInt(params.id);
  const ipAddress = getClientIP(request);

  try {
    // Check permission
    const permCheck = await checkPermission(context, "admin");
    if (permCheck.error) {
      return permCheck.response;
    }

    const currentUser = permCheck.user;

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { role, name, isActive } = body;
    const allowedFields = new Set(["role", "name", "isActive"]);
    const unknownFields = Object.keys(body || {}).filter(
      key => !allowedFields.has(key),
    );
    if (unknownFields.length) {
      return new Response(
        JSON.stringify({
          error: "Invalid fields",
          message: `Unknown fields: ${unknownFields.join(", ")}`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if user exists
    const user = await DB.prepare(
      `
      SELECT id, email, role, name, is_active
      FROM users
      WHERE id = ?
    `,
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
        },
      );
    }

    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];

    if (role !== undefined) {
      // Validate role
      if (!["admin", "editor", "viewer"].includes(role)) {
        return new Response(
          JSON.stringify({
            error: "Invalid role",
            message: "Role must be admin, editor, or viewer",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Prevent last admin from being demoted
      if (user.role === "admin" && role !== "admin") {
        const { results: adminUsers } = await DB.prepare(
          `
          SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1
        `,
        ).all();

        if (adminUsers[0].count <= 1) {
          return new Response(
            JSON.stringify({
              error: "Cannot modify last admin",
              message:
                "Cannot remove admin role from the last active admin user",
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      }

      updates.push("role = ?");
      values.push(role);
    }

    if (name !== undefined) {
      // Validate name length
      if (name.length < 2) {
        return new Response(
          JSON.stringify({
            error: "Invalid name",
            message: "Display name must be at least 2 characters long",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      updates.push("name = ?");
      values.push(name);
    }

    if (isActive !== undefined) {
      // Prevent last admin from being deactivated
      if (user.role === "admin" && !isActive) {
        const { results: adminUsers } = await DB.prepare(
          `
          SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?
        `,
        )
          .bind(userId)
          .all();

        if (adminUsers[0].count < 1) {
          return new Response(
            JSON.stringify({
              error: "Cannot deactivate last admin",
              message: "Cannot deactivate the last active admin user",
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      }

      updates.push("is_active = ?");
      values.push(isActive ? 1 : 0);

      if (!isActive) {
        updates.push("deactivated_at = datetime('now')");
        updates.push("deactivated_by = ?");
        values.push(currentUser.userId);
      }
    }

    // No updates provided
    if (updates.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "No valid fields to update",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Add user ID to values
    values.push(userId);

    // Execute update
    await DB.prepare(
      `
      UPDATE users
      SET ${updates.join(", ")}
      WHERE id = ?
    `,
    )
      .bind(...values)
      .run();

    // Audit log
    await auditLog(
      env,
      currentUser.userId,
      "user.updated",
      "user",
      userId,
      {
        changes: { role, name, isActive },
      },
      ipAddress,
    );

    // Fetch updated user
    const updatedUser = await DB.prepare(
      `
      SELECT id, email, name, role, is_active, created_at, last_login, updated_at
      FROM users
      WHERE id = ?
    `,
    )
      .bind(userId)
      .first();

    return new Response(
      JSON.stringify({
        ...updatedUser,
        isActive: updatedUser.is_active === 1,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Update user error:", error);
    return new Response(JSON.stringify({ error: "Failed to update user" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// DELETE - Soft delete user (admin only)
export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const { DB } = env;
  const userId = parseInt(params.id);
  const ipAddress = getClientIP(request);

  try {
    // Check permission (admin only)
    const permCheck = await checkPermission(context, "admin");
    if (permCheck.error) {
      return permCheck.response;
    }

    const currentUser = permCheck.user;

    // Check if user exists
    const user = await DB.prepare(
      `
      SELECT id, email, role, is_active
      FROM users
      WHERE id = ?
    `,
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
        },
      );
    }

    // Prevent deleting yourself
    if (userId === currentUser.userId) {
      return new Response(
        JSON.stringify({
          error: "Cannot delete self",
          message: "You cannot delete your own account",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Prevent deleting last admin
    if (user.role === "admin") {
      const { results: adminUsers } = await DB.prepare(
        `
        SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1
      `,
      ).all();

      if (adminUsers[0].count <= 1) {
        return new Response(
          JSON.stringify({
            error: "Cannot delete last admin",
            message: "Cannot delete the last active admin user",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Soft delete (deactivate)
    await DB.prepare(
      `
      UPDATE users
      SET is_active = 0, deactivated_at = datetime('now'), deactivated_by = ?
      WHERE id = ?
    `,
    )
      .bind(currentUser.userId, userId)
      .run();

    // Also invalidate all sessions for this user
    await DB.prepare(
      `
      DELETE FROM sessions WHERE user_id = ?
    `,
    )
      .bind(userId)
      .run();

    // Audit log
    await auditLog(
      env,
      currentUser.userId,
      "user.deleted",
      "user",
      userId,
      {
        email: user.email,
        role: user.role,
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "User deleted successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Delete user error:", error);
    return new Response(JSON.stringify({ error: "Failed to delete user" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
