// Toggle user status endpoint (activate/deactivate)
// POST /api/admin/users/[id]/toggle-status
// Returns: { success: true } or error

import { checkPermission } from "../../_middleware.js";
import { auditLogStatement } from "../../../../utils/auditLogStatement.js";
import { getClientIP } from "../../../../utils/request.js";
import { validateId } from "../../../../utils/validation.js";

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const { DB } = env;

  // RBAC: Require admin role
  const permCheck = await checkPermission(context, "admin");
  if (permCheck.error) {
    return permCheck.response;
  }

  const user = permCheck.user;
  const ipAddress = getClientIP(request);

  try {
    const idResult = validateId(params.id);
    if (!idResult.valid) {
      return new Response(JSON.stringify({ error: "Bad request", message: idResult.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const userId = idResult.value;

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
      return new Response(JSON.stringify({ error: "Cannot deactivate your own account" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Toggle user status
    const newStatus = targetUser.is_active === 1 ? 0 : 1;
    const statements = [
      DB.prepare(
        `
      UPDATE users
      SET is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
      ).bind(newStatus, userId),
    ];

    if (newStatus === 0) {
      // Deactivation must cut every credential the account holds, not just its
      // sessions. verifyApiKey's INNER JOIN on users.is_active = 1 is a backstop for
      // a path that forgets this, not a replacement for it: the join follows the
      // account, so it would hand the key back the moment the account is reactivated,
      // while an explicit revocation is permanent. This mirrors the same revocation in
      // the PATCH path of users/[id].js -- both endpoints deactivate, so both must do
      // it. Reactivation deliberately does NOT restore keys; revocation is one-way,
      // exactly as it is at the revoke endpoint.
      statements.push(
        DB.prepare("DELETE FROM lucia_sessions WHERE user_id = ?").bind(userId),
        DB.prepare("UPDATE api_keys SET revoked_at = datetime('now') WHERE created_by = ? AND revoked_at IS NULL").bind(
          userId,
        ),
      );
    }

    statements.push(
      auditLogStatement(
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
      ),
    );

    // One batch: D1 has no BEGIN/COMMIT, so this is the only way the status change,
    // the credential teardown and the audit row cannot disagree with each other.
    await DB.batch(statements);

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
    return new Response(JSON.stringify({ error: "Failed to update user status" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
