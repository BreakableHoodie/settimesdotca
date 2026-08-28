// Admin API key collection endpoints
// POST /api/admin/api-keys - Create an API key (admin only)
// GET /api/admin/api-keys - List API keys (admin only)

import { checkPermission } from "./_middleware.js";
import { auditLogStatementForInsertedRow } from "../../utils/auditLogStatement.js";
import { generateApiKey } from "../../utils/apiKeys.js";
import { toSqliteDateTime } from "../../utils/authAttempts.js";
import { FIELD_LIMITS, isValidRole, sanitizeString, validationErrorResponse } from "../../utils/validation.js";
import { getClientIP, parseJsonObjectBody } from "../../utils/request.js";

const API_KEY_COLUMNS = "id, name, key_prefix, role, created_by, created_at, expires_at, last_used_at, revoked_at";

export async function onRequestGet(context) {
  const { env } = context;
  const { DB } = env;

  const permCheck = await checkPermission(context, "admin");
  if (permCheck.error) {
    return permCheck.response;
  }

  try {
    const result = await DB.prepare(`SELECT ${API_KEY_COLUMNS} FROM api_keys ORDER BY created_at DESC, id DESC`).all();

    return new Response(JSON.stringify({ apiKeys: result.results || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Error fetching API keys:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch API keys" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  const permCheck = await checkPermission(context, "admin");
  if (permCheck.error) {
    return permCheck.response;
  }

  try {
    const parsed = await parseJsonObjectBody(request);
    if (parsed === null) {
      return validationErrorResponse("Request body must be a JSON object");
    }
    const body = parsed;
    const name = sanitizeString(body.name || "");
    const role = body.role || "viewer";

    if (!name || name.length > FIELD_LIMITS.shortText.max) {
      return validationErrorResponse(`Name must be between 1 and ${FIELD_LIMITS.shortText.max} characters`);
    }
    if (!isValidRole(role)) {
      return validationErrorResponse("Role must be admin, editor, or viewer");
    }

    let requestedExpiry;
    if (body.expiresAt !== undefined) {
      requestedExpiry = new Date(body.expiresAt);
    }
    let generated;
    try {
      generated = await generateApiKey(requestedExpiry);
    } catch (error) {
      return validationErrorResponse(error.message);
    }
    const user = permCheck.user;
    const ipAddress = getClientIP(request);

    // Bound rather than left to the column default, so the response can report the
    // stored value exactly without a second read. See the response note below.
    const createdAt = toSqliteDateTime(new Date());

    const [insert] = await DB.batch([
      DB.prepare(
        `INSERT INTO api_keys (name, key_prefix, key_hash, role, created_by, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(name, generated.keyPrefix, generated.keyHash, role, user.userId, createdAt, generated.expiresAt),
      // The new key's id does not exist until the INSERT above runs, so the audit row
      // resolves it by lookup -- keeping both writes in one atomic batch.
      auditLogStatementForInsertedRow(
        env,
        user.userId,
        "api_key.created",
        "api_key",
        { table: "api_keys", where: { key_hash: generated.keyHash } },
        { role },
        ipAddress,
      ),
    ]);

    // The row is assembled from what was just written rather than read back. A second
    // query here would sit OUTSIDE the batch, so a transient failure on it would return
    // 500 for a key that is already live -- and its plaintext, which exists only in this
    // response, would be gone. Worse, a null result spreads to nothing, handing back a
    // secret with no id to revoke it by.
    return new Response(
      JSON.stringify({
        success: true,
        apiKey: {
          id: insert.meta.last_row_id,
          name,
          key_prefix: generated.keyPrefix,
          role,
          created_by: user.userId,
          created_at: createdAt,
          expires_at: generated.expiresAt,
          last_used_at: null,
          revoked_at: null,
          // The only copy of the secret. Never stored, never recoverable.
          plaintext: generated.plaintext,
        },
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Error creating API key:", error);
    return new Response(JSON.stringify({ error: "Failed to create API key" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
