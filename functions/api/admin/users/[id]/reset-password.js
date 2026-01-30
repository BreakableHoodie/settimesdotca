// Admin-initiated password reset endpoint
// POST /api/admin/users/[id]/reset-password
// Body: { reason?: string }
// Returns: { success: true, resetUrl: string } or error

import { checkPermission, auditLog } from "../../_middleware.js";
import { generatePasswordResetToken } from "../../../../utils/tokens.js";
import { sanitizeString } from "../../../../utils/validation.js";
import { getClientIP } from "../../../../utils/request.js";
import { sendEmail, isEmailConfigured } from "../../../../utils/email.js";

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
    const userId = params.id;
    const { reason } = await request.json().catch(() => ({}));
    const sanitizedReason = reason ? sanitizeString(reason).slice(0, 500) : null;

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

    if (targetUser.is_active === 0) {
      return new Response(
        JSON.stringify({ error: "Cannot reset password for inactive user" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Generate reset token and persist it
    const resetToken = generatePasswordResetToken(userId, user.userId);
    await DB.prepare(
      `
      INSERT INTO password_reset_tokens (user_id, token, created_by, expires_at, ip_address, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    )
      .bind(
        userId,
        resetToken.token,
        user.userId,
        resetToken.expiresAt,
        ipAddress,
        sanitizedReason,
      )
      .run();

    // Revoke existing sessions to force re-authentication
    await DB.prepare(
      `
      DELETE FROM sessions
      WHERE user_id = ?
    `,
    )
      .bind(userId)
      .run();

    const baseUrl = env.PUBLIC_URL || new URL(request.url).origin;
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken.token}`;

    if (isEmailConfigured(env)) {
      const subject = "Reset your SetTimes password";
      const text = `A password reset was requested for your account.\n\nReset your password: ${resetUrl}\n\nIf you didn't request this, you can ignore this email.`;
      const html = `
        <p>A password reset was requested for your account.</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>If you didn't request this, you can ignore this email.</p>
      `.trim();

      await sendEmail(env, {
        to: targetUser.email,
        subject,
        text,
        html,
      });
    } else {
      console.info(
        `[Email] Password reset link for ${targetUser.email}: ${resetUrl}`,
      );
    }

    // Audit log the action
    await auditLog(
      env,
      user.userId,
      "user.password_reset",
      "user",
      userId,
      {
        adminEmail: user.email,
        targetEmail: targetUser.email,
        reason: sanitizedReason,
        resetTokenId: resetToken.token,
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        resetUrl,
        message: `Password reset link generated for ${targetUser.email}`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Admin password reset error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to reset password" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
