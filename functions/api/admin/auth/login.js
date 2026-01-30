// Admin login endpoint
// POST /api/admin/auth/login
// Body: { email: string, password: string }
// Returns: { success: true, user: object } or error

import { setSessionCookie } from "../../../utils/cookies.js";
import { verifyPassword } from "../../../utils/crypto.js";
import { generateCSRFToken, setCSRFCookie } from "../../../utils/csrf.js";
import { getClientIP } from "../../../utils/request.js";

// Rate limiting: check failed login attempts
async function checkRateLimit(DB, email, ipAddress) {
  const windowMs = 10 * 60 * 1000;
  const windowStart = new Date(Date.now() - windowMs).toISOString();

  const attempts = await DB.prepare(
    `SELECT COUNT(*) as count, MIN(created_at) as earliest_attempt
     FROM auth_attempts
     WHERE (email = ? OR ip_address = ?)
     AND attempt_type = 'login'
     AND success = 0
     AND created_at > ?`
  )
    .bind(email, ipAddress, windowStart)
    .first();

  if (Number(attempts.count) >= 5) {
    const earliestTs = attempts.earliest_attempt
      ? new Date(attempts.earliest_attempt).getTime()
      : Date.now();
    const elapsed = Date.now() - earliestTs;
    const remainingMs = Math.max(0, windowMs - elapsed);
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));

    return {
      allowed: false,
      remainingMinutes,
    };
  }

  return { allowed: true };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);
  const userAgent = request.headers.get("User-Agent") || "unknown";

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
          message: `Too many failed login attempts. Please try again in ${rateCheck.remainingMinutes} minutes.`,
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Find user with all needed fields
    const user = await DB.prepare(
      `
      SELECT id, email, password_hash, name, first_name, last_name, role, is_active,
             activation_token, activation_token_expires_at, activated_at,
             totp_enabled, totp_secret
      FROM users
      WHERE email = ?
    `
    )
      .bind(email)
      .first();

    if (!user) {
      // Log failed attempt (user not found)
      await DB.prepare(
        `INSERT INTO auth_attempts (email, ip_address, user_agent, attempt_type, success, failure_reason)
         VALUES (?, ?, ?, 'login', 0, 'user_not_found')`
      )
        .bind(email, ipAddress, userAgent)
        .run();

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

    // Check if account is activated
    if (user.is_active === 0 && !user.activated_at) {
      await DB.prepare(
        `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success, failure_reason)
         VALUES (?, ?, ?, ?, 'login', 0, 'activation_required')`
      )
        .bind(user.id, email, ipAddress, userAgent)
        .run();

      return new Response(
        JSON.stringify({
          error: "Account not activated",
          message:
            "Please check your email and activate your account before logging in.",
          requiresActivation: true,
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Check if account is active (deactivated)
    if (user.is_active === 0) {
      // Log failed attempt (account disabled)
      await DB.prepare(
        `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success, failure_reason)
         VALUES (?, ?, ?, ?, 'login', 0, 'account_disabled')`
      )
        .bind(user.id, email, ipAddress, userAgent)
        .run();

      return new Response(
        JSON.stringify({
          error: "Account disabled",
          message:
            "Your account has been deactivated. Please contact an administrator.",
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
      )
        .bind(user.id, email, ipAddress, userAgent)
        .run();

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

    // Password valid - check if TOTP is required
    if (Number(user.totp_enabled) === 1) {
      if (!user.totp_secret) {
        console.error("TOTP enabled but missing secret for user:", user.id);
        return new Response(
          JSON.stringify({
            error: "MFA configuration error",
            message:
              "Multi-factor authentication is not configured correctly. Contact an administrator.",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const mfaToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      await DB.prepare(
        `
        DELETE FROM mfa_challenges
        WHERE user_id = ?
          AND (used = 1 OR expires_at <= datetime('now'))
      `
      )
        .bind(user.id)
        .run();

      await DB.prepare(
        `INSERT INTO mfa_challenges (token, user_id, ip_address, user_agent, expires_at)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(mfaToken, user.id, ipAddress, userAgent, expiresAt)
        .run();

      await DB.prepare(
        `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success)
         VALUES (?, ?, ?, ?, 'login_mfa_challenge', 1)`
      )
        .bind(user.id, email, ipAddress, userAgent)
        .run();

      return new Response(
        JSON.stringify({
          mfaRequired: true,
          mfaToken,
          user: {
            email: user.email,
            name:
              user.name ||
              [user.first_name, user.last_name].filter(Boolean).join(" ") ||
              null,
            firstName: user.first_name || null,
            lastName: user.last_name || null,
            role: user.role,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Generate session token
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60000).toISOString(); // 30 min default

    // Create session
    await DB.prepare(
      `INSERT INTO sessions (session_token, user_id, ip_address, user_agent, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(sessionToken, user.id, ipAddress, userAgent, expiresAt)
      .run();

    // Update last login
    await DB.prepare(
      "UPDATE users SET last_login = datetime('now') WHERE id = ?"
    )
      .bind(user.id)
      .run();

    // Log successful login
    await DB.prepare(
      `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success)
       VALUES (?, ?, ?, ?, 'login', 1)`
    )
      .bind(user.id, email, ipAddress, userAgent)
      .run();

    // Generate CSRF token
    const csrfToken = generateCSRFToken();

    // Set secure HTTPOnly session cookie and CSRF cookie
    const headers = new Headers({
      "Content-Type": "application/json",
    });
    headers.append(
      "Set-Cookie",
      setSessionCookie(sessionToken, false, request)
    );
    headers.append("Set-Cookie", setCSRFCookie(csrfToken, request));

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name:
            user.name ||
            [user.first_name, user.last_name].filter(Boolean).join(" ") ||
            null,
          firstName: user.first_name || null,
          lastName: user.last_name || null,
          role: user.role,
        },
      }),
      {
        status: 200,
        headers,
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
