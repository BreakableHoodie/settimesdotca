import { setSessionCookie } from "../../../utils/cookies.js";
import { hashPassword } from "../../../utils/crypto.js";
import { generateCSRFToken, setCSRFCookie } from "../../../utils/csrf.js";
import { isValidEmail, validatePassword, FIELD_LIMITS } from "../../../utils/validation.js";
import { getClientIP } from "../../../utils/request.js";

// Rate limiting: check failed signup attempts
async function checkRateLimit(DB, email, ipAddress) {
  const windowMs = 10 * 60 * 1000;
  const windowStart = new Date(Date.now() - windowMs).toISOString();

  const attempts = await DB.prepare(
    `SELECT COUNT(*) as count, MIN(created_at) as earliest_attempt
     FROM auth_attempts
     WHERE (email = ? OR ip_address = ?)
     AND attempt_type = 'signup'
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

  try {
    const signupEnabled = env?.ALLOW_ADMIN_SIGNUP === "true";
    if (!signupEnabled) {
      return new Response(
        JSON.stringify({
          error: "Signup disabled",
          message: "Self-serve signup is not available at this time.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const { email, password, name, role, inviteCode } = await request.json();

    // SECURITY: Require invite code for all signups
    if (!inviteCode) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Invite code is required for signup",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validation
    if (!email || !password) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Email and password are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Email format validation
    if (!isValidEmail(email)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Invalid email format",
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
          message: `Too many failed signup attempts. Please try again in ${rateCheck.remainingMinutes} minutes.`,
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Password strength validation
    const passwordCheck = validatePassword(password, {
      minLength: FIELD_LIMITS.password.min,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSpecial: true,
    });
    if (!passwordCheck.valid) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: passwordCheck.errors[0],
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // SECURITY: Validate invite code
    const invite = await DB.prepare(
      `
      SELECT * FROM invite_codes
      WHERE code = ?
      AND is_active = 1
      AND expires_at > datetime('now')
      AND used_by_user_id IS NULL
    `
    )
      .bind(inviteCode)
      .first();

    if (!invite) {
      // Log failed signup attempt
      await DB.prepare(
        `INSERT INTO auth_attempts (email, ip_address, user_agent, attempt_type, success, failure_reason)
         VALUES (?, ?, ?, 'signup', 0, 'invalid_invite_code')`
      )
        .bind(email, ipAddress, request.headers.get("User-Agent") || "unknown")
        .run();

      return new Response(
        JSON.stringify({
          error: "Invalid invite code",
          message:
            "The invite code is invalid, expired, or has already been used",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // If invite is email-restricted, verify email matches
    if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
      await DB.prepare(
        `INSERT INTO auth_attempts (email, ip_address, user_agent, attempt_type, success, failure_reason)
         VALUES (?, ?, ?, 'signup', 0, 'email_mismatch')`
      )
        .bind(email, ipAddress, request.headers.get("User-Agent") || "unknown")
        .run();

      return new Response(
        JSON.stringify({
          error: "Email mismatch",
          message:
            "This invite code is restricted to a different email address",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // SECURITY: Use role from invite code, not from request
    // This prevents privilege escalation
    const userRole = invite.role;

    // Ignore any role parameter passed by client to prevent privilege escalation
    if (role === "admin") {
      console.warn(
        `Signup attempt with admin role blocked for email: ${email}`
      );
    }

    // Check if user already exists
    const existingUser = await DB.prepare(
      "SELECT id FROM users WHERE email = ?"
    )
      .bind(email)
      .first();

    if (existingUser) {
      return new Response(
        JSON.stringify({
          error: "Conflict",
          message: "Email already registered",
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await DB.prepare(
      "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?) RETURNING id, email, name, role"
    )
      .bind(email, passwordHash, name || null, userRole)
      .first();

    // Mark invite code as used
    await DB.prepare(
      "UPDATE invite_codes SET used_by_user_id = ?, used_at = datetime('now') WHERE code = ?"
    )
      .bind(user.id, inviteCode)
      .run();

    // Log successful signup
    await DB.prepare(
      `INSERT INTO auth_attempts (user_id, email, ip_address, user_agent, attempt_type, success)
       VALUES (?, ?, ?, ?, 'signup', 1)`
    )
      .bind(
        user.id,
        email,
        ipAddress,
        request.headers.get("User-Agent") || "unknown"
      )
      .run();

    // Generate session token
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    // Create session in database
    await DB.prepare(
      "INSERT INTO sessions (session_token, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(
        sessionToken,
        user.id,
        expiresAt,
        ipAddress,
        request.headers.get("User-Agent") || "unknown"
      )
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
          name: user.name,
          role: user.role,
        },
      }),
      {
        status: 201,
        headers,
      }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return new Response(
      JSON.stringify({
        error: "Server error",
        message: "Failed to create account",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
