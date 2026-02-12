// User management endpoints for admin panel
// GET /api/admin/users - List all users
// POST /api/admin/users - Create new user

import { checkPermission, auditLog } from "./_middleware.js";
import {
  validateEntity,
  VALIDATION_SCHEMAS,
  validationErrorResponse,
} from "../../utils/validation.js";
import { getClientIP } from "../../utils/request.js";
import { sendEmail, isEmailConfigured } from "../../utils/email.js";
import { buildInviteEmail } from "../../utils/emailTemplates.js";

// GET - List all users (admin only)
export async function onRequestGet(context) {
  const { request, env } = context;
  const { DB } = env;

  try {
    // Check permission (admin only)
    const permCheck = await checkPermission(context, "admin");
    if (permCheck.error) {
      return permCheck.response;
    }

    // Get all users (excluding password hashes)
    const { results: users } = await DB.prepare(
      `
      SELECT
        id,
        email,
        name,
        first_name,
        last_name,
        role,
        is_active,
        created_at,
        last_login,
        updated_at
      FROM users
      ORDER BY created_at DESC
    `,
    ).all();

    return new Response(
      JSON.stringify({
        users: users.map((u) => ({
          ...u,
          firstName: u.first_name || null,
          lastName: u.last_name || null,
          name:
            u.name ||
            [u.first_name, u.last_name].filter(Boolean).join(" ") ||
            null,
          isActive: u.is_active === 1, // Convert to camelCase boolean
        })),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Get users error:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch users" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// POST - Invite new user (admin only)
export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);

  try {
    // Check permission (admin only)
    const permCheck = await checkPermission(context, "admin");
    if (permCheck.error) {
      return permCheck.response;
    }

    const currentUser = permCheck.user;

    // Parse request body
    const body = await request.json().catch(() => ({}));

    // Validate input using schema
    const validation = validateEntity(body, VALIDATION_SCHEMAS.userInvite);
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      return validationErrorResponse(firstError, { fields: validation.errors });
    }

    const { email, role, firstName, lastName } = validation.sanitized;
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

    // Check if email already exists
    const existingUser = await DB.prepare(
      `
      SELECT id FROM users WHERE email = ?
    `,
    )
      .bind(email)
      .first();

    if (existingUser) {
      return new Response(
        JSON.stringify({
          error: "Email exists",
          message: "A user with this email already exists",
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const inviteCode = crypto.randomUUID();
    const expiresInDays = 7;
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Create invite code
    const invite = await DB.prepare(
      `
      INSERT INTO invite_codes (code, email, role, created_by_user_id, expires_at)
      VALUES (?, ?, ?, ?, ?)
      RETURNING *
    `,
    )
      .bind(inviteCode, email, role, currentUser.userId, expiresAt)
      .first();

    const baseUrl = env.PUBLIC_URL || new URL(request.url).origin;
    const inviteUrl = new URL("/admin/signup", baseUrl);
    inviteUrl.searchParams.set("code", inviteCode);
    inviteUrl.searchParams.set("email", email);
    if (fullName) {
      inviteUrl.searchParams.set("name", fullName);
    }
    if (firstName) {
      inviteUrl.searchParams.set("first", firstName);
    }
    if (lastName) {
      inviteUrl.searchParams.set("last", lastName);
    }

    let emailResult = { delivered: false, reason: "not_configured" };
    if (isEmailConfigured(env)) {
      const emailPayload = buildInviteEmail({
        inviteUrl: inviteUrl.toString(),
        expiresAt,
        recipientName: fullName || null,
      });

      emailResult = await sendEmail(env, {
        to: email,
        subject: emailPayload.subject,
        text: emailPayload.text,
        html: emailPayload.html,
      });
    } else {
      console.info(`[Email] Invite link for ${email}: ${inviteUrl}`);
    }

    // Audit log
    await auditLog(
      env,
      currentUser.userId,
      "user.invited",
      "invite_code",
      invite?.id,
      {
        email,
        role,
        name: fullName || null,
        firstName,
        lastName,
        inviteCode,
        expiresAt,
        emailDelivered: emailResult.delivered,
      },
      ipAddress,
    );

    // Return invite details (only expose inviteUrl if email delivery failed)
    const responseBody = {
      success: true,
      invite,
      email: emailResult,
    };
    if (!emailResult.delivered) {
      responseBody.inviteUrl = inviteUrl.toString();
    }
    return new Response(JSON.stringify(responseBody), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Create user error:", error);
    return new Response(JSON.stringify({ error: "Failed to create user" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
