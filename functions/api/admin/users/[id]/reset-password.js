// Admin-initiated password reset endpoint
// POST /api/admin/users/[id]/reset-password
// Body: { reason?: string }
// Returns: { success: true, resetUrl: string } or error

import { checkPermission, auditLog } from "../../_middleware.js";
import { generatePasswordResetToken } from "../../../../utils/tokens.js";
import { sanitizeString } from "../../../../utils/validation.js";
import { getClientIP } from "../../../../utils/request.js";
import { sendEmail, isEmailConfigured } from "../../../../utils/email.js";
import { buildResetPasswordEmail } from "../../../../utils/emailTemplates.js";

export async function onRequestPost(context) {
  console.log("[ResetPassword] === ENDPOINT HIT === timestamp:", Date.now());
  const { request, env, params } = context;
  const { DB } = env;

  // RBAC: Require admin role
  console.log("[ResetPassword] Checking permissions for user ID:", params.id);
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
      DELETE FROM lucia_sessions
      WHERE user_id = ?
    `,
    )
      .bind(userId)
      .run();

    const baseUrl = env.PUBLIC_URL || new URL(request.url).origin;
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken.token}`;

    console.log("[ResetPassword] Checking email configuration...");

    if (!isEmailConfigured(env)) {
      console.error("[ResetPassword] Email not configured");
      return new Response(
        JSON.stringify({
          error: "Email not configured",
          message: "Email delivery is not configured. Unable to send reset email.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    const emailPayload = buildResetPasswordEmail({
      resetUrl,
      recipientName: targetUser.name,
    });

    console.log("[ResetPassword] Sending password reset email to:", targetUser.email);
    const emailResult = await sendEmail(env, {
      to: targetUser.email,
      subject: emailPayload.subject,
      text: emailPayload.text,
      html: emailPayload.html,
    });
    console.log("[ResetPassword] Email result:", emailResult);

    if (!emailResult.delivered) {
      console.error("[ResetPassword] Email delivery failed:", emailResult);
      return new Response(
        JSON.stringify({
          error: "Email delivery failed",
          message: "Unable to send reset email. Please try again or check email settings.",
          details: emailResult.reason || "unknown",
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        },
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
        message: `Password reset email sent to ${targetUser.email}`,
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
