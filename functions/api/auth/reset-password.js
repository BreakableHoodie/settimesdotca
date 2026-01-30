// Password reset endpoints
// GET /api/auth/reset-password?token=xxx
// POST /api/auth/reset-password
// Returns: { valid: true, user: { email, name } } or error

export { onRequestPost } from "./reset-password-complete.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const { DB } = env;
  const debugId = crypto.randomUUID();
  const withDebug = (payload) =>
    env?.RESET_DEBUG === "true" ? { ...payload, debugId } : payload;
  const logDebug = (stage, details) => {
    console.info("[ResetPassword]", stage, { debugId, ...details });
  };
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    logDebug("missing_token", {});
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
      logDebug("token_invalid", {});
      return new Response(
        JSON.stringify(
          withDebug({ error: "Invalid or expired reset token", code: "TOKEN_INVALID" })
        ),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if token is expired
    if (new Date(resetToken.expires_at) < new Date()) {
      logDebug("token_expired", { expiresAt: resetToken.expires_at });
      return new Response(
        JSON.stringify(
          withDebug({ error: "Reset token has expired", code: "TOKEN_EXPIRED" })
        ),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if user is active
    if (resetToken.is_active === 0) {
      logDebug("user_inactive", { userId: resetToken.user_id });
      return new Response(
        JSON.stringify(
          withDebug({ error: "User account is inactive", code: "USER_INACTIVE" })
        ),
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
    console.error("Reset token verification error:", { debugId, error });
    return new Response(
      JSON.stringify(withDebug({ error: "Failed to verify reset token", code: "TOKEN_VERIFY_FAILED" })),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
