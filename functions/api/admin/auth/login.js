// Admin login endpoint
// POST /api/admin/auth/login
// Body: { email: string, password: string }
// Returns: { success: true, user: object } or error

import { verifyPassword, hashPassword } from "../../../utils/crypto.js";
import { generateCSRFToken, setCSRFCookie } from "../../../utils/csrf.js";
import { getClientIP } from "../../../utils/request.js";
import { initializeLucia } from "../../../utils/auth.js";
import { AUTH_ATTEMPT_TYPES, checkAuthRateLimit, writeAuthAttempt } from "../../../utils/authAttempts.js";
import { loadTotpSecret } from "../../../utils/mfaSecrets.js";
import { getTrustedDeviceToken, validateTrustedDevice } from "../../../utils/trustedDevice.js";
import { logger } from "../../../utils/logger.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);
  const userAgent = request.headers.get("User-Agent") || "unknown";

  try {
    const body = await request.json().catch(() => ({}));
    const { email: rawEmail, password } = body;

    if (!rawEmail || !password) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Email and password are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const email = rawEmail.trim().toLowerCase();

    // Per-email rate limit: blocks targeted attacks on a known account (5 failures)
    const emailRateCheck = await checkAuthRateLimit(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.login,
      email,
      ipAddress,
      scope: "email",
      maxFailures: 5,
    });
    if (!emailRateCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: "Too many attempts",
          message: `Too many failed login attempts. Please try again in ${emailRateCheck.remainingMinutes} minutes.`,
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Per-IP rate limit: blocks credential-stuffing across many accounts (20 failures)
    const ipRateCheck = await checkAuthRateLimit(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.login,
      email,
      ipAddress,
      scope: "ip",
      maxFailures: 20,
    });
    if (!ipRateCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: "Too many attempts",
          message: `Too many failed login attempts. Please try again in ${ipRateCheck.remainingMinutes} minutes.`,
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Find user with all needed fields
    const user = await DB.prepare(
      `
      SELECT id, email, password_hash, name, first_name, last_name, role, is_active,
             activation_token, activation_token_expires_at, activated_at,
             totp_enabled, totp_secret
      FROM users
      WHERE LOWER(email) = ?
    `,
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
        },
      );
    }

    // Verify password FIRST to prevent account-enumeration via account-state branches.
    // An attacker submitting any password to an existing email must not learn whether
    // the account exists or what state it is in until they prove knowledge of the password.
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
        },
      );
    }

    // Password is valid — opportunistically upgrade the hash if it was created with
    // fewer than 600 000 iterations. Best-effort: a write failure must not block login.
    try {
      const storedIterations = Number(user.password_hash.split("$")[1]);
      if (storedIterations && storedIterations < 600000) {
        const newHash = await hashPassword(password);
        await DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(newHash, user.id).run();
      }
    } catch (rehashError) {
      logger.warn("opportunistic password rehash failed (login not affected)", {
        userId: user.id,
        error: rehashError?.message,
      });
    }

    // Password proven — now safe to reveal account state without enumeration risk.

    // Check if account is not yet activated (registered but email not confirmed)
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

      // Password was proven above, so revealing requiresActivation here does not
      // enable account enumeration — the caller already knows the password is correct.
      return new Response(
        JSON.stringify({
          error: "Authentication failed",
          message: "Invalid email or password",
          requiresActivation: true,
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if account has been deactivated by an admin
    if (user.is_active === 0) {
      await writeAuthAttempt(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.login,
        email,
        failureReason: "account_disabled",
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
        },
      );
    }

    // Password valid - check if TOTP is required
    // First, check if this is a trusted device (skip MFA)
    let skipMfa = false;
    if (Number(user.totp_enabled) === 1) {
      try {
        const trustedDeviceToken = getTrustedDeviceToken(request);
        if (trustedDeviceToken) {
          const trustedUserId = await validateTrustedDevice(DB, trustedDeviceToken, ipAddress, userAgent);
          if (trustedUserId === user.id) {
            logger.debug("trusted device validated, skipping MFA", {
              userId: user.id,
            });
            skipMfa = true;
          } else if (trustedUserId !== null) {
            logger.debug("trusted device belongs to different user", {
              userId: user.id,
            });
          }
        }
      } catch (trustedDeviceError) {
        // Don't fail login if trusted device check fails - just require MFA
        console.error("[Login] Trusted device check failed:", trustedDeviceError?.message || trustedDeviceError);
        skipMfa = false;
      }
    }

    if (Number(user.totp_enabled) === 1 && !skipMfa) {
      let totpSecretState;
      try {
        totpSecretState = await loadTotpSecret(user.totp_secret, env);
      } catch (error) {
        console.error("[Login] Failed to decrypt TOTP secret:", error?.message || error);
        return new Response(
          JSON.stringify({
            error: "MFA configuration error",
            message: "Multi-factor authentication is not configured correctly. Contact an administrator.",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (totpSecretState?.shouldPersist) {
        await DB.prepare(
          `UPDATE users
           SET totp_secret = ?
           WHERE id = ? AND totp_secret = ?`,
        )
          .bind(totpSecretState.encryptedSecret, user.id, user.totp_secret)
          .run();
      }

      const totpSecret = totpSecretState?.secret;

      if (!totpSecret) {
        console.error("TOTP enabled but missing secret for user:", user.id);
        return new Response(
          JSON.stringify({
            error: "MFA configuration error",
            message: "Multi-factor authentication is not configured correctly. Contact an administrator.",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const mfaToken = crypto.randomUUID();
      // Store in SQLite datetime format (YYYY-MM-DD HH:MM:SS) so TEXT comparisons
      // against datetime('now') are lexicographically correct. ISO 8601 with 'T'
      // sorts greater than the space-separated SQLite format at the same instant,
      // which would allow expired challenges to pass the verify query.
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);

      await DB.prepare(
        `INSERT INTO mfa_challenges (token, user_id, ip_address, user_agent, expires_at, used, used_at)
         VALUES (?, ?, ?, ?, ?, 0, NULL)
         ON CONFLICT(user_id) WHERE used = 0 DO UPDATE SET
           token = excluded.token,
           ip_address = excluded.ip_address,
           user_agent = excluded.user_agent,
           expires_at = excluded.expires_at,
           used = 0,
           used_at = NULL,
           created_at = datetime('now')`,
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
            name: user.name || [user.first_name, user.last_name].filter(Boolean).join(" ") || null,
            firstName: user.first_name || null,
            lastName: user.last_name || null,
            role: user.role,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const lucia = initializeLucia(DB, request, env);
    await lucia.invalidateUserSessions(user.id);
    const session = await lucia.createSession(user.id, {});

    await DB.prepare(
      `UPDATE lucia_sessions
       SET ip_address = ?, user_agent = ?, remember_me = ?
       WHERE id = ?`,
    )
      .bind(ipAddress, userAgent, 0, session.id)
      .run();

    // Update last login
    await DB.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").bind(user.id).run();

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
          name: user.name || [user.first_name, user.last_name].filter(Boolean).join(" ") || null,
          firstName: user.first_name || null,
          lastName: user.last_name || null,
          role: user.role,
        },
      }),
      {
        status: 200,
        headers,
      },
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
      },
    );
  }
}
