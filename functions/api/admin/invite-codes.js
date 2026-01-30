// Admin invite codes endpoint
// POST /api/admin/invite-codes - Create new invite code (admin only)
// GET /api/admin/invite-codes - List invite codes (admin only)
// DELETE /api/admin/invite-codes/[code] - Revoke invite code (admin only)

import { checkPermission, auditLog } from "./_middleware.js";
import {
  isValidEmail,
  isValidRole,
  validationErrorResponse,
  FIELD_LIMITS,
} from "../../utils/validation.js";
import { getClientIP } from "../../utils/request.js";

// GET - List all invite codes
export async function onRequestGet(context) {
  const { request, env } = context;
  const { DB } = env;

  // RBAC: Require admin role
  const permCheck = await checkPermission(context, "admin");
  if (permCheck.error) {
    return permCheck.response;
  }

  try {
    const result = await DB.prepare(
      `
      SELECT
        ic.*,
        creator.email as creator_email,
        creator.name as creator_name,
        used_by.email as used_by_email,
        used_by.name as used_by_name
      FROM invite_codes ic
      LEFT JOIN users creator ON ic.created_by_user_id = creator.id
      LEFT JOIN users used_by ON ic.used_by_user_id = used_by.id
      ORDER BY ic.created_at DESC
    `,
    ).all();

    return new Response(
      JSON.stringify({
        inviteCodes: result.results || [],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error fetching invite codes:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to fetch invite codes",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// POST - Create new invite code
export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  // RBAC: Require admin role
  const permCheck = await checkPermission(context, "admin");
  if (permCheck.error) {
    return permCheck.response;
  }

  const user = permCheck.user;
  const ipAddress = getClientIP(request);

  try {
    const body = await request.json().catch(() => ({}));
    const {
      email = null,
      role = "editor",
      expiresInDays = 7,
    } = body;

    // Validation using centralized utilities
    if (!isValidRole(role)) {
      return validationErrorResponse("Role must be admin, editor, or viewer");
    }

    if (typeof expiresInDays !== "number" || expiresInDays < 1 || expiresInDays > 365) {
      return validationErrorResponse("Expiry must be between 1 and 365 days");
    }

    if (email) {
      // Validate email format and length
      if (!isValidEmail(email)) {
        return validationErrorResponse("Invalid email format");
      }
      if (email.length > FIELD_LIMITS.email.max) {
        return validationErrorResponse(`Email must be no more than ${FIELD_LIMITS.email.max} characters`);
      }

      // Check if email already registered
      const existingUser = await DB.prepare(
        `SELECT id FROM users WHERE email = ?`,
      )
        .bind(email)
        .first();

      if (existingUser) {
        return new Response(
          JSON.stringify({
            error: "Email already registered",
            message: "A user with this email already exists",
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Generate invite code
    const inviteCode = crypto.randomUUID();

    // Calculate expiration
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Insert invite code
    const result = await DB.prepare(
      `
      INSERT INTO invite_codes (code, email, role, created_by_user_id, expires_at)
      VALUES (?, ?, ?, ?, ?)
      RETURNING *
    `,
    )
      .bind(inviteCode, email, role, user.userId, expiresAt)
      .first();

    // Audit log
    await auditLog(
      env,
      user.userId,
      "invite_code.created",
      "invite_code",
      result.id,
      {
        code: inviteCode,
        email: email || "any",
        role,
        expiresInDays,
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        inviteCode: result,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error creating invite code:", error);

    return new Response(
      JSON.stringify({
        error: "Server error",
        message: "Failed to create invite code",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
