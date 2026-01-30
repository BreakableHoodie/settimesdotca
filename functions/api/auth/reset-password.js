// Password reset endpoints
// GET /api/auth/reset-password?token=xxx
// POST /api/auth/reset-password
// Returns: { valid: true, user: { email, name } } or error

export { onRequestPost } from "./reset-password-complete.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const { DB } = env;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response(JSON.stringify({ error: "Missing reset token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Find valid reset token
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
      return new Response(
        JSON.stringify({ error: "Invalid or expired reset token" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if token is expired
    if (new Date(resetToken.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Reset token has expired" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if user is active
    if (resetToken.is_active === 0) {
      return new Response(
        JSON.stringify({ error: "User account is inactive" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
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
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Reset token verification error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to verify reset token" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
