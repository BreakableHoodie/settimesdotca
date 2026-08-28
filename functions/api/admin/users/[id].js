// Individual user management endpoints
// PATCH /api/admin/users/:id - Update user
// DELETE /api/admin/users/:id - Delete user (soft delete)

import { checkPermission } from "../_middleware.js";
import { auditLogStatement } from "../../../utils/auditLogStatement.js";
import { getClientIP, parseJsonObjectBody } from "../../../utils/request.js";
import { validateId } from "../../../utils/validation.js";

// PATCH - Update user (admin only, users can update own name)
export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const { DB } = env;
  const { valid, value: userId } = validateId(params.id);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Invalid ID", code: "INVALID_ID" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const ipAddress = getClientIP(request);

  try {
    // Check permission
    const permCheck = await checkPermission(context, "admin");
    if (permCheck.error) {
      return permCheck.response;
    }

    const currentUser = permCheck.user;

    // Parse request body
    const body = await parseJsonObjectBody(request);
    if (body === null) {
      return new Response(JSON.stringify({ error: "Bad request", message: "Request body must be a JSON object" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const { role, name, firstName, lastName, isActive } = body;
    const allowedFields = new Set(["role", "name", "firstName", "lastName", "isActive"]);
    const unknownFields = Object.keys(body || {}).filter((key) => !allowedFields.has(key));
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
      SELECT id, email, role, name, first_name, last_name, is_active
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
              message: "Cannot remove admin role from the last active admin user",
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

    if (firstName !== undefined || lastName !== undefined) {
      const nextFirstName = firstName !== undefined ? String(firstName).trim() : user.first_name || "";
      const nextLastName = lastName !== undefined ? String(lastName).trim() : user.last_name || "";

      if (!nextFirstName) {
        return new Response(
          JSON.stringify({
            error: "Invalid first name",
            message: "First name is required",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (!nextLastName) {
        return new Response(
          JSON.stringify({
            error: "Invalid last name",
            message: "Last name is required",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const mergedName = `${nextFirstName} ${nextLastName}`.trim();
      updates.push("first_name = ?");
      values.push(nextFirstName);
      updates.push("last_name = ?");
      values.push(nextLastName);
      updates.push("name = ?");
      values.push(mergedName);
    } else if (name !== undefined) {
      const trimmed = String(name).trim();
      if (trimmed.length < 2) {
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
      values.push(trimmed);
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

    const mutationStatements = [
      DB.prepare(
        `
        UPDATE users
        SET ${updates.join(", ")}
        WHERE id = ?
      `,
      ).bind(...values),
    ];

    // Truthiness, not `=== false`, to match the three sites above (the last-admin
    // guard, the is_active write, and the deactivated_at stamp). A body of
    // `{"isActive": 0}` deactivates the user at every one of them, so it must
    // revoke their keys here too or the departed account keeps a live credential.
    const deactivating = isActive !== undefined && !isActive;
    // api_keys.role is frozen at creation and never reconciled against its creator's
    // current role, so a demotion would otherwise leave a bearer credential still
    // carrying the role the user just lost -- letting them re-promote themselves with
    // it once the Bearer path exists. Any role change revokes, not just a demotion:
    // deciding which direction is "safe" needs the rank hierarchy, and over-revoking
    // is the fail-safe error. Reissuing a key is cheap; an un-demotable admin is not.
    const roleChanged = role !== undefined && role !== user.role;
    if (deactivating || roleChanged) {
      mutationStatements.push(
        DB.prepare("UPDATE api_keys SET revoked_at = datetime('now') WHERE created_by = ? AND revoked_at IS NULL").bind(
          userId,
        ),
      );
    }
    if (deactivating) {
      // Matches users/[id]/toggle-status.js, the other endpoint that deactivates.
      // enforceSession already rejects an inactive user, so this is tidiness rather
      // than a live hole -- but two deactivation paths doing different amounts of
      // work is precisely the shape of the bug this change exists to fix.
      mutationStatements.push(DB.prepare("DELETE FROM lucia_sessions WHERE user_id = ?").bind(userId));
    }

    mutationStatements.push(
      auditLogStatement(
        env,
        currentUser.userId,
        "user.updated",
        "user",
        userId,
        {
          changes: { role, name, firstName, lastName, isActive },
        },
        ipAddress,
      ),
    );

    await DB.batch(mutationStatements);

    // Fetch updated user
    const updatedUser = await DB.prepare(
      `
      SELECT id, email, name, first_name, last_name, role, is_active, created_at, last_login, updated_at
      FROM users
      WHERE id = ?
    `,
    )
      .bind(userId)
      .first();

    return new Response(
      JSON.stringify({
        ...updatedUser,
        name: updatedUser.name || [updatedUser.first_name, updatedUser.last_name].filter(Boolean).join(" ") || null,
        firstName: updatedUser.first_name || null,
        lastName: updatedUser.last_name || null,
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

// DELETE - Hard delete user (admin only)
export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const { DB } = env;
  const { valid, value: userId } = validateId(params.id);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Invalid ID", code: "INVALID_ID" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
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

    // api_keys.created_by is ON DELETE RESTRICT, and RESTRICT fires on the EXISTENCE
    // of a referencing row, not its state -- so revoking a key does NOT unblock this,
    // and there is deliberately no endpoint that deletes the row (that would destroy
    // the attribution RESTRICT exists to protect). Deactivation is the supported path:
    // it revokes every active key and leaves both records intact.
    const apiKeyCount = await DB.prepare("SELECT COUNT(*) as count FROM api_keys WHERE created_by = ?")
      .bind(userId)
      .first();
    if (apiKeyCount.count > 0) {
      const plural = apiKeyCount.count === 1 ? "" : "s";
      return new Response(
        JSON.stringify({
          error: "Cannot delete user",
          code: "USER_OWNS_API_KEYS",
          message: `User owns ${apiKeyCount.count} API key${plural}, which must keep their creator for attribution. Deactivate the user instead -- that revokes their key${plural} and preserves both records.`,
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Hard delete with cleanup of references
    // Since some tables don't have ON DELETE SET NULL, we must manually update them
    // to prevent FK constraint failures or data loss.
    // Core tables: events, venues, band_profiles, performances
    // System tables: audit_log, invite_codes (handled by schema ON DELETE SET NULL)
    // Auth tables: lucia_sessions, password_reset_tokens (handled by schema ON DELETE CASCADE)

    const cleanupStmts = [
      // Delink from Events
      DB.prepare("UPDATE events SET created_by_user_id = NULL WHERE created_by_user_id = ?").bind(userId),
      DB.prepare("UPDATE events SET updated_by_user_id = NULL WHERE updated_by_user_id = ?").bind(userId),

      // Delink from Venues
      DB.prepare("UPDATE venues SET created_by_user_id = NULL WHERE created_by_user_id = ?").bind(userId),
      DB.prepare("UPDATE venues SET updated_by_user_id = NULL WHERE updated_by_user_id = ?").bind(userId),

      // Delink from Bands
      DB.prepare("UPDATE band_profiles SET created_by_user_id = NULL WHERE created_by_user_id = ?").bind(userId),
      // band_profiles doesn't have updated_by_user_id in v2 schema generally, but let's check schema to be safe
      // Schema says: updated_at TEXT NOT NULL DEFAULT (datetime('now')) - No updated_by_user_id column logic in schema provided

      // Delink from Performances
      DB.prepare("UPDATE performances SET created_by_user_id = NULL WHERE created_by_user_id = ?").bind(userId),
      DB.prepare("UPDATE performances SET updated_by_user_id = NULL WHERE updated_by_user_id = ?").bind(userId),

      // Delete the user - this will trigger ON DELETE CASCADE for sessions/tokens
      DB.prepare("DELETE FROM users WHERE id = ?").bind(userId),
      auditLogStatement(
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
      ),
    ];

    await DB.batch(cleanupStmts);

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
