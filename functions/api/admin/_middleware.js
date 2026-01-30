// Admin authentication middleware
// Applies to all /api/admin/* endpoints except /api/admin/auth/*

import { getCookie, setSessionCookie } from "../../utils/cookies.js";
import { generateCSRFToken, setCSRFCookie } from "../../utils/csrf.js";
import { validateCSRFMiddleware } from "../../utils/csrf.js";
import { getClientIP } from "../../utils/request.js";

// Verify session token and get user
const SESSION_IDLE_MINUTES = 30;
const SESSION_REFRESH_THRESHOLD_SECONDS = 60;

function parseSessionDate(value) {
  if (!value) return null;
  if (value.includes("T")) return new Date(value);
  // SQLite datetime('now') format: "YYYY-MM-DD HH:MM:SS"
  return new Date(value.replace(" ", "T") + "Z");
}

async function verifySession(DB, sessionToken) {
  if (!sessionToken) {
    return null;
  }

  // Check if sessions table exists (will be created by 2FA migration)
  try {
    const session = await DB.prepare(
      `
      SELECT s.id as session_id,
             s.session_token,
             s.expires_at,
             s.last_activity_at,
             u.id as user_id,
             u.email,
             u.role,
             u.name,
             u.first_name,
             u.last_name,
             u.is_active
      FROM sessions s
      INNER JOIN users u ON s.user_id = u.id
      WHERE s.session_token = ? AND s.expires_at > datetime('now')
    `
    )
      .bind(sessionToken)
      .first();

    if (session && session.is_active === 1) {
      const now = new Date();
      const lastActivity = parseSessionDate(session.last_activity_at) || now;
      const expiresAtDate = parseSessionDate(session.expires_at) || now;
      const secondsSinceActivity = Math.floor(
        (now.getTime() - lastActivity.getTime()) / 1000
      );
      const secondsUntilExpiry = Math.floor(
        (expiresAtDate.getTime() - now.getTime()) / 1000
      );
      let expiresAt = session.expires_at;
      let lastActivityAt = session.last_activity_at;
      let refreshed = false;

      if (
        secondsSinceActivity >= SESSION_REFRESH_THRESHOLD_SECONDS ||
        secondsUntilExpiry <= SESSION_REFRESH_THRESHOLD_SECONDS
      ) {
        const refreshedExpiry = new Date(
          now.getTime() + SESSION_IDLE_MINUTES * 60 * 1000
        ).toISOString();

        await DB.prepare(
          `
          UPDATE sessions
          SET last_activity_at = datetime('now'),
              expires_at = ?
          WHERE session_token = ?
        `
        )
          .bind(refreshedExpiry, sessionToken)
          .run();

        expiresAt = refreshedExpiry;
        lastActivityAt = now.toISOString();
        refreshed = true;
      }

      return {
        user: {
          userId: session.user_id,
          email: session.email,
          role: session.role,
          name:
            session.name ||
            [session.first_name, session.last_name].filter(Boolean).join(" ") ||
            null,
          firstName: session.first_name || null,
          lastName: session.last_name || null,
        },
        session: {
          sessionToken: session.session_token,
          expiresAt,
          lastActivityAt,
        },
        sessionRefreshed: refreshed,
      };
    }
  } catch (error) {
    // Log the actual error for debugging
    console.error("Session verification error:", error.message);

    // Check if it's a missing table error
    if (error.message?.includes("no such table")) {
      console.error(
        "CRITICAL: Required auth tables missing. Run database migrations."
      );
    }

    return null;
  }

  return null;
}

// Check if user has required permission based on role hierarchy
// Role hierarchy: admin (3) > editor (2) > viewer (1)
export async function checkPermission(context, requiredRole) {
  // console.log('checkPermission context:', context);
  const { request, env, data } = context;

  // Optimization: Use user from context if available (set by onRequest)
  if (data && data.user) {
    const user = data.user;
    const roleHierarchy = { admin: 3, editor: 2, viewer: 1 };
    const userLevel = roleHierarchy[user.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    if (userLevel < requiredLevel) {
      return {
        error: true,
        response: new Response(
          JSON.stringify({
            error: "Forbidden",
            message: "Insufficient permissions",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        ),
      };
    }

    return { error: false, user };
  }

  // Fallback: Verify session manually (if middleware didn't run or for testing)
  const allowHeaderAuth = env?.ALLOW_HEADER_AUTH === "true";
  // SECURITY: Read session token from HTTPOnly cookie
  const sessionToken =
    getCookie(request, "session_token") ||
    (allowHeaderAuth
      ? request.headers.get("Authorization")?.replace("Bearer ", "")
      : null);

  if (!sessionToken) {
    return {
      error: true,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  const sessionData = await verifySession(env.DB, sessionToken);

  if (!sessionData) {
    return {
      error: true,
      response: new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  const user = sessionData.user;
  const roleHierarchy = { admin: 3, editor: 2, viewer: 1 };
  const userLevel = roleHierarchy[user.role] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;

  if (userLevel < requiredLevel) {
    return {
      error: true,
      response: new Response(
        JSON.stringify({
          error: "Forbidden",
          message: "Insufficient permissions",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  return { error: false, user, session: sessionData.session };
}

// Audit log function - logs all admin actions
export async function auditLog(
  env,
  userId,
  action,
  resourceType,
  resourceId,
  details,
  ipAddress
) {
  try {
    await env.DB.prepare(
      `
      INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    )
      .bind(
        userId,
        action,
        resourceType || null,
        resourceId || null,
        details ? JSON.stringify(details) : null,
        ipAddress || "unknown"
      )
      .run();
  } catch (error) {
    // Log error but don't fail the request if audit logging fails
    console.error("Audit log error:", error);
  }
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const { pathname } = new URL(request.url);

  // Skip auth check for auth endpoints
  if (pathname.includes("/api/admin/auth/")) {
    return next();
  }

  // SECURITY: Validate CSRF token for state-changing requests
  const csrfError = validateCSRFMiddleware(request, env);
  if (csrfError) {
    return csrfError;
  }

  const { DB } = env;
  const ipAddress = getClientIP(request);

  try {
    // SECURITY: Read session token from HTTPOnly cookie
    const allowHeaderAuth = env?.ALLOW_HEADER_AUTH === "true";
    const sessionToken =
      getCookie(request, "session_token") ||
      (allowHeaderAuth
        ? request.headers.get("Authorization")?.replace("Bearer ", "")
        : null);

    // Verify session
    const sessionData = await verifySession(DB, sessionToken);

    if (!sessionData) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Valid session required",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Refresh session cookie when expiry is extended in the DB
    if (sessionData?.sessionRefreshed) {
      const currentCookie = getCookie(request, "session_token");
      if (currentCookie) {
        const cookieHeader = setSessionCookie(currentCookie, false, request);
        context.data = {
          ...context.data,
          pendingSetCookie: context.data?.pendingSetCookie
            ? [...context.data.pendingSetCookie, cookieHeader]
            : [cookieHeader],
        };
      }
    }

    // Refresh CSRF token cookie if missing (keeps long sessions working)
    const csrfCookie = getCookie(request, "csrf_token");
    if (!csrfCookie) {
      const csrfToken = generateCSRFToken(request, env, sessionToken);
      const csrfCookieHeader = setCSRFCookie(csrfToken, request);
      context.data = {
        ...context.data,
        pendingSetCookie: context.data?.pendingSetCookie
          ? [...context.data.pendingSetCookie, csrfCookieHeader]
          : [csrfCookieHeader],
      };
    }

    // Store auth info in context for handlers to use
    context.data = {
      ...context.data,
      authenticated: true,
      user: sessionData.user,
      session: sessionData.session,
      ipAddress,
    };

    const response = await next();

    if (context.data?.pendingSetCookie) {
      const headers = new Headers(response.headers);
      context.data.pendingSetCookie.forEach((cookie) => headers.append("Set-Cookie", cookie));
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  } catch (error) {
    console.error("Auth middleware error:", error);

    return new Response(
      JSON.stringify({
        error: "Authentication error",
        message: "Failed to verify credentials",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
