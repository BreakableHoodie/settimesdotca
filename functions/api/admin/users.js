// User management endpoints for admin panel
// GET /api/admin/users - List all users
// POST /api/admin/users - Create new user

import { hashPassword } from "../../utils/crypto.js";
import { checkPermission, auditLog } from "./_middleware.js";
import {
  validateEntity,
  VALIDATION_SCHEMAS,
  validationErrorResponse,
} from "../../utils/validation.js";
import { getClientIP } from "../../utils/request.js";

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

// POST - Create new user (admin only)
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
    const validation = validateEntity(body, VALIDATION_SCHEMAS.user);
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      return validationErrorResponse(firstError, { fields: validation.errors });
    }

    const { email, password, role, name } = validation.sanitized;

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

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const result = await DB.prepare(
      `
      INSERT INTO users (email, password_hash, role, name, is_active)
      VALUES (?, ?, ?, ?, 1)
    `,
    )
      .bind(email, passwordHash, role, name)
      .run();

    const newUserId = result.meta.last_row_id;

    // Audit log
    await auditLog(
      env,
      currentUser.userId,
      "user.created",
      "user",
      newUserId,
      {
        email,
        role,
        name,
      },
      ipAddress,
    );

    // Return created user (without password)
    return new Response(
      JSON.stringify({
        id: newUserId,
        email,
        role,
        name,
        isActive: true,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Create user error:", error);
    return new Response(JSON.stringify({ error: "Failed to create user" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
