// User management endpoints for admin panel
// GET /api/admin/users - List all users
// POST /api/admin/users - Create new user

import { hashPassword } from '../../utils/crypto.js'
import { checkPermission, auditLog } from './_middleware.js'

// Get client IP from request
function getClientIP(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
    "unknown"
  );
}

// GET - List all users (admin only)
export async function onRequestGet(context) {
  const { request, env } = context;
  const { DB } = env;

  try {
    // Check permission (admin only)
    const permCheck = await checkPermission(request, env, 'admin');
    if (permCheck.error) {
      return permCheck.response;
    }

    const user = permCheck.user;

    // Get all users (excluding password hashes)
    const { results: users } = await DB.prepare(`
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
    `).all();

    return new Response(JSON.stringify({
      users: users.map(u => ({
        ...u,
        isActive: u.is_active === 1  // Convert to camelCase boolean
      }))
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Get users error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch users' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
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
    const permCheck = await checkPermission(request, env, 'admin');
    if (permCheck.error) {
      return permCheck.response;
    }

    const currentUser = permCheck.user;

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { email, password, role, name } = body;

    // Validation
    if (!email || !password || !role || !name) {
      return new Response(JSON.stringify({
        error: 'Bad request',
        message: 'Email, password, role, and display name are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({
        error: 'Invalid email',
        message: 'Please provide a valid email address'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate password length
    if (password.length < 8) {
      return new Response(JSON.stringify({
        error: 'Invalid password',
        message: 'Password must be at least 8 characters long'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate role
    if (!['admin', 'editor', 'viewer'].includes(role)) {
      return new Response(JSON.stringify({
        error: 'Invalid role',
        message: 'Role must be admin, editor, or viewer'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate name length
    if (name.length < 2) {
      return new Response(JSON.stringify({
        error: 'Invalid name',
        message: 'Display name must be at least 2 characters long'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if email already exists
    const existingUser = await DB.prepare(`
      SELECT id FROM users WHERE email = ?
    `).bind(email).first();

    if (existingUser) {
      return new Response(JSON.stringify({
        error: 'Email exists',
        message: 'A user with this email already exists'
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const result = await DB.prepare(`
      INSERT INTO users (email, password_hash, role, name, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).bind(email, passwordHash, role, name).run();

    const newUserId = result.meta.last_row_id;

    // Audit log
    await auditLog(env, currentUser.userId, 'user.created', 'user', newUserId, {
      email,
      role,
      name
    }, ipAddress);

    // Return created user (without password)
    return new Response(JSON.stringify({
      id: newUserId,
      email,
      role,
      name,
      isActive: true
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Create user error:', error);
    return new Response(JSON.stringify({ error: 'Failed to create user' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
