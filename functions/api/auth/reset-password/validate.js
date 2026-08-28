// Reset token validation endpoint
// POST /api/auth/reset-password/validate
// Body: { token: string }
// Returns: { valid: true, user: { email, name } } or error
//
// Accepts the token in the POST body rather than a query string so it is
// never logged by Cloudflare access logs, stored in browser history, or
// leaked via the Referer header.

import { fromSqliteDateTime } from "../../../utils/authAttempts.js";
import { parseJsonObjectBody } from "../../../utils/request.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  const body = await parseJsonObjectBody(request);
  if (body === null) {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const token = body.token;

  if (!token || typeof token !== "string") {
    return new Response(JSON.stringify({ error: "Missing reset token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const resetToken = await DB.prepare(
      `
      SELECT prt.id, prt.user_id, prt.expires_at, prt.used,
             u.email, u.name, u.is_active
      FROM password_reset_tokens prt
      JOIN users u ON prt.user_id = u.id
      WHERE prt.token = ? AND prt.used = 0
    `,
    )
      .bind(token)
      .first();

    if (!resetToken) {
      return new Response(JSON.stringify({ error: "Invalid or expired reset token", code: "TOKEN_INVALID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (fromSqliteDateTime(resetToken.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Reset token has expired", code: "TOKEN_EXPIRED" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (resetToken.is_active === 0) {
      return new Response(JSON.stringify({ error: "User account is inactive", code: "USER_INACTIVE" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        valid: true,
        user: {
          email: resetToken.email,
          name: resetToken.name,
        },
        expiresAt: resetToken.expires_at,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Reset token validation error:", error);
    return new Response(JSON.stringify({ error: "Failed to verify reset token", code: "TOKEN_VERIFY_FAILED" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
