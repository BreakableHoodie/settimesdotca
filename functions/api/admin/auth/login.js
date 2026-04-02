// Admin login endpoint
// POST /api/admin/auth/login
// Body: { email: string, password: string }
// Returns: { success: true, user: object } or error

import { verifyPassword } from "../../../utils/crypto.js";
import { generateCSRFToken, setCSRFCookie } from "../../../utils/csrf.js";
import { getClientIP } from "../../../utils/request.js";
import { initializeLucia } from "../../../utils/auth.js";
import { AUTH_ATTEMPT_TYPES, checkAuthRateLimit, writeAuthAttempt } from "../../../utils/authAttempts.js";
import {
  getTrustedDeviceToken,
  validateTrustedDevice,
} from "../../../utils/trustedDevice.js";

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
    const rateCheck = await checkAuthRateLimit(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.login,
      email,
      ipAddress,
      scope: "email-or-ip",
    });
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
      await writeAuthAttempt(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.login,
        email,
        failureReason: "user_not_found",
        ipAddress,
        success: false,
        userAgent,
      });

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
      await writeAuthAttempt(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.login,
        email,
        failureReason: "activation_required",
        ipAddress,
        success: false,
        userAgent,
        userId: user.id,
      });

      // Use 401 + generic message to prevent account enumeration.
      // requiresActivation hint is preserved for UX but does not change HTTP status.
      return new Response(
        JSON.stringify({
          error: "Authentication failed",
          message: "Invalid email or password",
          requiresActivation: true,
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Check if account is active (deactivated)
    if (user.is_active === 0) {
      // Log failed attempt (account disabled)
      await writeAuthAttempt(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.login,
        email,
        failureReason: "account_disabled",
        ipAddress,
        success: false,
        userAgent,
        userId: user.id,
      });

      // Use 401 + generic message to prevent account enumeration via status codes.
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

    // Verify password
    const passwordValid = await verifyPassword(password, user.password_hash);

    if (!passwordValid) {
      // Log failed attempt (invalid password)
      await writeAuthAttempt(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.login,
        email,
        failureReason: "invalid_password",
        ipAddress,
        success: false,
        userAgent,
        userId: user.id,
      });

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
    // First, check if this is a trusted device (skip MFA)
    let skipMfa = false;
    if (Number(user.totp_enabled) === 1) {
      try {
        const trustedDeviceToken = getTrustedDeviceToken(request);
        if (trustedDeviceToken) {
          const trustedUserId = await validateTrustedDevice(
            DB,
            trustedDeviceToken,
            ipAddress,
            userAgent
          );
          if (trustedUserId === user.id) {
            console.log("[Login] Trusted device validated, skipping MFA for user:", user.id);
            skipMfa = true;
          } else if (trustedUserId !== null) {
            console.log("[Login] Trusted device belongs to different user");
          }
        }
      } catch (trustedDeviceError) {
        // Don't fail login if trusted device check fails - just require MFA
        console.error("[Login] Trusted device check failed:", trustedDeviceError?.message || trustedDeviceError);
        skipMfa = false;
      }
    }

    if (Number(user.totp_enabled) === 1 && !skipMfa) {
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

      await writeAuthAttempt(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.loginMfaChallenge,
        email,
        ipAddress,
        success: true,
        userAgent,
        userId: user.id,
      });

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

    const lucia = initializeLucia(DB, request, env);
    const session = await lucia.createSession(user.id, {});

    await DB.prepare(
      `UPDATE lucia_sessions
       SET ip_address = ?, user_agent = ?, remember_me = ?
       WHERE id = ?`
    )
      .bind(ipAddress, userAgent, 0, session.id)
      .run();

    // Update last login
    await DB.prepare(
      "UPDATE users SET last_login = datetime('now') WHERE id = ?"
    )
      .bind(user.id)
      .run();

    // Log successful login
    await writeAuthAttempt(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.login,
      email,
      ipAddress,
      success: true,
      userAgent,
      userId: user.id,
    });

    // Generate CSRF token
    const csrfToken = generateCSRFToken(request, env, session.id);

    // Set secure HTTPOnly session cookie and CSRF cookie
    const headers = new Headers({
      "Content-Type": "application/json",
    });
    headers.append("Set-Cookie", lucia.createSessionCookie(session.id).serialize());
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
