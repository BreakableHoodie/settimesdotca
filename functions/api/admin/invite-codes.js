// Admin invite codes endpoint
// POST /api/admin/invite-codes - Create new invite code (admin only)
// GET /api/admin/invite-codes - List invite codes (admin only)
// DELETE /api/admin/invite-codes/[id] - Revoke invite code by id (admin only)
//
// The plaintext code exists only in the POST response (#1334): the database
// stores a digest, and no read path returns the code or the digest.

import { checkPermission, auditLog } from "./_middleware.js";
import { requireRecentStepUp } from "../../utils/stepUp.js";
import { isValidEmail, isValidRole, validationErrorResponse, FIELD_LIMITS } from "../../utils/validation.js";
import { getClientIP, parseJsonObjectBody } from "../../utils/request.js";
import { toSqliteDateTime } from "../../utils/authAttempts.js";
import { generateInviteCode } from "../../utils/inviteCodes.js";

// GET - List all invite codes
export async function onRequestGet(context) {
  const { env } = context;
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
        ic.id,
        ic.code_prefix,
        ic.email,
        ic.role,
        ic.created_by_user_id,
        ic.used_by_user_id,
        ic.created_at,
        ic.used_at,
        ic.expires_at,
        ic.is_active,
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

  // An invite code mints an account, possibly an admin one (#1324).
  const stepUpDenied = await requireRecentStepUp(context);
  if (stepUpDenied) return stepUpDenied;

  const user = permCheck.user;
  const ipAddress = getClientIP(request);

  try {
    const body = await parseJsonObjectBody(request);
    if (body === null) {
      return validationErrorResponse("Request body must be a JSON object");
    }
    const { email: rawEmail = null, role = "editor", expiresInDays = 7 } = body;
    // Users are stored lowercased, so the existing-user check must compare lowercased.
    // A whitespace-only string is left as is so it fails validation below:
    // trimmed to "" it would read as "no email" and silently mint an OPEN invite.
    const email = typeof rawEmail === "string" && rawEmail.trim() ? rawEmail.trim().toLowerCase() : rawEmail;

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
      const existingUser = await DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();

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
    const { plaintext: inviteCode, codeHash, codePrefix } = await generateInviteCode();

    // Calculate expiration
    const expiresAt = toSqliteDateTime(new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000));

    // Insert invite code
    const result = await DB.prepare(
      `
      INSERT INTO invite_codes (code, code_prefix, email, role, created_by_user_id, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id, code_prefix, email, role, created_by_user_id, created_at, expires_at, is_active
    `,
    )
      .bind(codeHash, codePrefix, email, role, user.userId, expiresAt)
      .first();

    // Audit log
    await auditLog(
      env,
      user.userId,
      "invite_code.created",
      "invite_code",
      result.id,
      {
        role,
        expiresInDays,
        inviteMode: email ? "email_restricted" : "open",
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        // The plaintext is shown exactly once, here. `code` is the secret;
        // the rest is the stored row minus the digest.
        inviteCode: { ...result, code: inviteCode },
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
