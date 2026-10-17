// Admin invite code management
// DELETE /api/admin/invite-codes/[id] - Revoke invite code by numeric id
//
// By id, not by code (#1334): the plaintext is not stored, so it cannot be a key.

import { checkPermission, auditLog } from "../_middleware.js";
import { getClientIP } from "../../../utils/request.js";
import { validateId } from "../../../utils/validation.js";

// DELETE - Revoke invite code
export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const { DB } = env;

  // RBAC: Require admin role
  const permCheck = await checkPermission(context, "admin");
  if (permCheck.error) {
    return permCheck.response;
  }

  const { valid, value: inviteId } = validateId(params.id);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Invalid ID", code: "INVALID_ID" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const user = permCheck.user;
  const ipAddress = getClientIP(request);

  try {
    // Check if invite exists
    const invite = await DB.prepare(`SELECT id, email, used_by_user_id FROM invite_codes WHERE id = ?`)
      .bind(inviteId)
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
    await DB.prepare(`UPDATE invite_codes SET is_active = 0 WHERE id = ?`).bind(inviteId).run();

    // Audit log
    await auditLog(
      env,
      user.userId,
      "invite_code.revoked",
      "invite_code",
      invite.id,
      {
        wasUsed: invite.used_by_user_id !== null,
        inviteMode: invite.email ? "email_restricted" : "open",
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
