// Password reset completion endpoint
// POST /api/auth/reset-password
// Body: { token: string, newPassword: string }
// Returns: { success: true } or error

import { hashPassword, verifyPassword } from "../../utils/crypto.js";
import { validatePassword, FIELD_LIMITS } from "../../utils/validation.js";
import { getClientIP } from "../../utils/request.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const debugId = crypto.randomUUID();

  const withDebug = (payload) => {
    if (env?.RESET_DEBUG === "true") {
      return { ...payload, debugId };
    }
    return payload;
  };

  const logDebug = (stage, details) => {
    console.info("[ResetPassword]", stage, { debugId, ...details });
  };
  const logFailure = async (code, details = {}) => {
    try {
      await DB.prepare(
        `
        INSERT INTO auth_audit (action, success, ip_address, user_agent, details)
        VALUES ('password_reset_failed', 0, ?, ?, ?)
      `,
      )
        .bind(
          getClientIP(request),
          request.headers.get("User-Agent") || "unknown",
          JSON.stringify({ code, debugId, ...details }),
        )
        .run();
    } catch (error) {
      console.error("Password reset failure audit error:", { debugId, error });
    }
  };

  try {
    const { token, newPassword } = await request.json();

    if (!token || !newPassword) {
      logDebug("missing_fields", { hasToken: Boolean(token) });
      await logFailure("MISSING_FIELDS", { hasToken: Boolean(token) });
      return new Response(
        JSON.stringify(
          withDebug({ error: "Token and new password are required", code: "MISSING_FIELDS" })
        ),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Validate password strength
    const passwordCheck = validatePassword(newPassword, {
      minLength: FIELD_LIMITS.password.min,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSpecial: true,
    });
    if (!passwordCheck.valid) {
      logDebug("password_invalid", { reason: passwordCheck.errors[0] });
      await logFailure("PASSWORD_INVALID", { reason: passwordCheck.errors[0] });
      return new Response(
        JSON.stringify({
          ...withDebug({
            error: passwordCheck.errors[0],
            code: "PASSWORD_INVALID",
          }),
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Find valid reset token
    const resetToken = await DB.prepare(
      `
      SELECT prt.id, prt.user_id, prt.expires_at, prt.used,
             u.email, u.name, u.is_active, u.password_hash
      FROM password_reset_tokens prt
      JOIN users u ON prt.user_id = u.id
      WHERE prt.token = ? AND prt.used = 0
    `,
    )
      .bind(token)
      .first();

    if (!resetToken) {
      logDebug("token_invalid", {});
      await logFailure("TOKEN_INVALID");
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
      await logFailure("TOKEN_EXPIRED", { expiresAt: resetToken.expires_at });
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
      await logFailure("USER_INACTIVE", { userId: resetToken.user_id });
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

    // Prevent password reuse
    if (resetToken.password_hash) {
      const samePassword = await verifyPassword(
        newPassword,
        resetToken.password_hash,
      );
      if (samePassword) {
        logDebug("password_reuse", { userId: resetToken.user_id });
        await logFailure("PASSWORD_REUSE", { userId: resetToken.user_id });
        return new Response(
          JSON.stringify({
            ...withDebug({
              error: "New password must be different from the current password",
              code: "PASSWORD_REUSE",
            }),
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Hash new password
    logDebug("hash_start", { userId: resetToken.user_id });
    const passwordHash = await hashPassword(newPassword);
    logDebug("hash_complete", { userId: resetToken.user_id });

    // Update user password
    await DB.prepare(
      `
      UPDATE users
      SET password_hash = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
    )
      .bind(passwordHash, resetToken.user_id)
      .run();

    // Mark reset token as used
    await DB.prepare(
      `
      UPDATE password_reset_tokens
      SET used = 1, used_at = datetime('now')
      WHERE id = ?
    `,
    )
      .bind(resetToken.id)
      .run();

    // Invalidate all existing sessions for this user
    await DB.prepare(
      `
      DELETE FROM lucia_sessions
      WHERE user_id = ?
    `,
    )
      .bind(resetToken.user_id)
      .run();

    // Log the password reset completion
    await DB.prepare(
      `
      INSERT INTO auth_audit (action, success, ip_address, user_agent, details)
      VALUES ('password_reset_completed', 1, ?, ?, ?)
    `,
    )
      .bind(
        getClientIP(request),
        request.headers.get("User-Agent") || "unknown",
        JSON.stringify({
          user_id: resetToken.user_id,
          user_email: resetToken.email,
          reset_token_id: resetToken.id,
        }),
      )
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        message:
          "Password has been reset successfully. Please log in with your new password.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Password reset completion error:", { debugId, error });
    await logFailure("RESET_FAILED", { error: String(error?.message || error) });
    return new Response(JSON.stringify(withDebug({ error: "Failed to reset password", code: "RESET_FAILED" })), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
