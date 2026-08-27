// Admin API key item endpoint
// DELETE /api/admin/api-keys/:id - Revoke an API key (admin only)

import { checkPermission } from "../_middleware.js";
import { auditLogStatement } from "../../../utils/auditLogStatement.js";
import { getClientIP } from "../../../utils/request.js";
import { validateId } from "../../../utils/validation.js";

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const { DB } = env;
  const permCheck = await checkPermission(context, "admin");
  if (permCheck.error) {
    return permCheck.response;
  }

  const { valid, value: keyId } = validateId(params.id);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Invalid ID", code: "INVALID_ID" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const key = await DB.prepare("SELECT id, revoked_at FROM api_keys WHERE id = ?").bind(keyId).first();
    if (!key) {
      return new Response(JSON.stringify({ error: "Not found", message: "API key not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (key.revoked_at !== null) {
      return new Response(JSON.stringify({ error: "Conflict", message: "API key is already revoked" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    const user = permCheck.user;
    await DB.batch([
      DB.prepare("UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL").bind(keyId),
      auditLogStatement(env, user.userId, "api_key.revoked", "api_key", keyId, {}, getClientIP(request)),
    ]);

    return new Response(JSON.stringify({ success: true, message: "API key revoked" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error revoking API key:", error);
    return new Response(JSON.stringify({ error: "Failed to revoke API key" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
