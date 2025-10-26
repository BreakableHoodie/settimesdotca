// Admin login endpoint
// POST /api/admin/auth/login
// Body: { email: string, password: string }
// Returns: { success: true, user: object, sessionToken: string } or error

import { verifyPassword } from '../../../utils/crypto.js'

// Get client IP from request
function getClientIP(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
    "unknown"
  );
}

// Rate limiting: check failed login attempts
async function checkRateLimit(DB, email, ipAddress) {
  const windowStart = new Date(Date.now() - 10 * 60000).toISOString(); // 10 min window

  const attempts = await DB.prepare(
    `SELECT COUNT(*) as count FROM auth_attempts
     WHERE (email = ? OR ip_address = ?)
     AND attempt_type = 'login'
     AND success = 0
     AND created_at > ?`
  ).bind(email, ipAddress, windowStart).first();

  if (attempts.count >= 5) {
    return { allowed: false, remaining: Math.ceil((new Date(windowStart) - Date.now() + 10 * 60000) / 60000) };
  }

  return { allowed: true };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);
  const userAgent = request.headers.get('User-Agent') || 'unknown';

  try {
    const body = await request.json().catch(() => ({}));
    const { email, password } = body;

    if (!email || !password) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Email and password are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Check rate limit
    const rateCheck = await checkRateLimit(DB, email, ipAddress);
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: "Too many attempts",
          message: `Too many failed login attempts. Please try again in ${rateCheck.remaining} minutes.`,
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Find user with all needed fields
    const user = await DB.prepare(`
      SELECT id, email, password_hash, name, role, is_active
      FROM users
      WHERE email = ?
    `).bind(email).first();

    if (!user) {
      // Log failed attempt (user not found)
      await DB.prepare(
        `INSERT INTO auth_attempts (email, ip_address, user_agent, attempt_type, success, failure_reason)
         VALUES (?, ?, ?, 'login', 0, 'user_not_found')`
      ).bind(email, ipAddress, userAgent).run();

      return new Response(
        JSON.stringify({
          error: "Authentication failed",
          message: "Invalid email or password",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Check if account is active
    if (user.is_active === 0) {
      // Log failed attempt (account disabled)
      await DB.prepare(
        `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success, failure_reason)
         VALUES (?, ?, ?, ?, 'login', 0, 'account_disabled')`
      ).bind(user.id, email, ipAddress, userAgent).run();

      return new Response(
        JSON.stringify({
          error: "Account disabled",
          message: "Your account has been deactivated. Please contact an administrator.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Verify password
    const passwordValid = await verifyPassword(password, user.password_hash);

    if (!passwordValid) {
      // Log failed attempt (invalid password)
      await DB.prepare(
        `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success, failure_reason)
         VALUES (?, ?, ?, ?, 'login', 0, 'invalid_password')`
      ).bind(user.id, email, ipAddress, userAgent).run();

      return new Response(
        JSON.stringify({
          error: "Authentication failed",
          message: "Invalid email or password",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Password valid - check if 2FA is required
    // TODO: Implement 2FA check here when TOTP/WebAuthn/Email OTP are ready
    // For now, proceed with session creation

    // Update last login
    await DB.prepare(
      'UPDATE users SET last_login = datetime(\'now\') WHERE id = ?'
    ).bind(user.id).run();

    // Generate session token
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60000).toISOString(); // 30 min default

    // Create session
    await DB.prepare(
      `INSERT INTO sessions (id, user_id, ip_address, user_agent, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(sessionToken, user.id, ipAddress, userAgent, expiresAt).run();

    // Log successful login
    await DB.prepare(
      `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success)
       VALUES (?, ?, ?, ?, 'login', 1)`
    ).bind(user.id, email, ipAddress, userAgent).run();

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        sessionToken
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Login error:", error);

    return new Response(
      JSON.stringify({
        error: "Server error",
        message: "Failed to process login request",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
