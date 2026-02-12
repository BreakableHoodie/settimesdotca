// Admin authentication middleware
// Applies to all /api/admin/* endpoints except /api/admin/auth/*

import { getCookie } from "../../utils/cookies.js";
import { generateCSRFToken, setCSRFCookie, validateCSRFMiddleware } from "../../utils/csrf.js";
import { getClientIP } from "../../utils/request.js";
import { initializeLucia, SESSION_CONFIG } from "../../utils/auth.js";
import { createRequestLogger } from "../../utils/logger.js";

function parseSessionDate(value) {
  if (!value) return null;
  if (value.includes("T")) return new Date(value);
  // SQLite datetime('now') format: "YYYY-MM-DD HH:MM:SS"
  return new Date(value.replace(" ", "T") + "Z");
}

function normalizeUser(user) {
  if (!user) return null;
  const displayName =
    user.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: displayName,
    firstName: user.firstName || null,
    lastName: user.lastName || null,
    isActive: user.isActive,
  };
}

async function resolveSession(request, env) {
  const lucia = initializeLucia(env.DB, request);
  const allowHeaderAuth = env?.ALLOW_HEADER_AUTH === "true";
  const sessionId =
    lucia.readSessionCookie(request.headers.get("Cookie") ?? "") ||
    (allowHeaderAuth
      ? request.headers.get("Authorization")?.replace("Bearer ", "")
      : null);

  if (!sessionId) {
    return { lucia, sessionId: null, session: null, user: null, sessionMeta: null };
  }

  try {
    const { session, user } = await lucia.validateSession(sessionId);
    if (!session || !user) {
      return { lucia, sessionId, session: null, user: null, sessionMeta: null };
    }

    const sessionMeta = await env.DB.prepare(
      "SELECT created_at, last_activity_at FROM lucia_sessions WHERE id = ?"
    )
      .bind(sessionId)
      .first();

    return { lucia, sessionId, session, user, sessionMeta };
  } catch (error) {
    // Log silently - session validation failures are common (expired, invalid)
    return { lucia, sessionId, session: null, user: null, sessionMeta: null };
  }
}

async function enforceSession(request, env) {
  const result = await resolveSession(request, env);
  const { lucia, sessionId, session, user, sessionMeta } = result;

  if (!session || !user) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (sessionId) {
      headers.append("Set-Cookie", lucia.createBlankSessionCookie().serialize());
    }
    return {
      response: new Response(
        JSON.stringify({ error: "Unauthorized", message: "Valid session required" }),
        { status: 401, headers }
      ),
      result,
    };
  }

  if (!user.isActive) {
    return {
      response: new Response(
        JSON.stringify({ error: "Account deactivated" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      ),
      result,
    };
  }

  const now = new Date();
  const createdAt = parseSessionDate(sessionMeta?.created_at) || now;
  const lastActivityAt = parseSessionDate(sessionMeta?.last_activity_at) || createdAt;

  const idleTimeout =
    user.role === "admin"
      ? SESSION_CONFIG.adminIdleTimeout
      : SESSION_CONFIG.idleTimeout;
  const absoluteTimeout =
    user.role === "admin"
      ? SESSION_CONFIG.adminAbsoluteTimeout
      : SESSION_CONFIG.absoluteTimeout;

  const idleElapsed = now.getTime() - lastActivityAt.getTime();
  const absoluteElapsed = now.getTime() - createdAt.getTime();

  if (idleElapsed > idleTimeout || absoluteElapsed > absoluteTimeout) {
    await lucia.invalidateSession(sessionId);
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append("Set-Cookie", lucia.createBlankSessionCookie().serialize());

    return {
      response: new Response(
        JSON.stringify({
          error: "Session expired",
          reason: idleElapsed > idleTimeout ? "inactivity" : "absolute",
        }),
        { status: 401, headers }
      ),
      result,
    };
  }

  await env.DB.prepare(
    "UPDATE lucia_sessions SET last_activity_at = datetime('now') WHERE id = ?"
  )
    .bind(sessionId)
    .run();

  const idleRemaining = Math.max(0, idleTimeout - idleElapsed);
  const absoluteRemaining = Math.max(0, absoluteTimeout - absoluteElapsed);
  const timeRemaining = Math.min(idleRemaining, absoluteRemaining);

  return {
    result,
    pendingCookie: session.fresh ? lucia.createSessionCookie(session.id).serialize() : null,
    timing: { idleRemaining, absoluteRemaining, timeRemaining },
  };
}

// Check if user has required permission based on role hierarchy
// Role hierarchy: admin (3) > editor (2) > viewer (1)
export async function checkPermission(context, requiredRole) {
  const { request, env, data } = context;

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

  const auth = await enforceSession(request, env);
  if (auth.response) {
    return { error: true, response: auth.response };
  }

  const normalizedUser = normalizeUser(auth.result.user);
  const roleHierarchy = { admin: 3, editor: 2, viewer: 1 };
  const userLevel = roleHierarchy[normalizedUser.role] || 0;
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

  return { error: false, user: normalizedUser, lucia: auth.result.lucia, session: auth.result.session };
}

// Audit log function - logs all admin actions
export async function auditLog(
  env,
  userId,
  action,
  resourceType,
  resourceId,
  details,
  ipAddress,
  log = null
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
    if (log) {
      log.warn("Audit log write failed", { action, resourceType, resourceId, error });
    }
  }
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const { pathname } = new URL(request.url);
  const log = createRequestLogger(context);

  // Skip auth check for auth endpoints
  if (pathname.startsWith("/api/admin/auth/")) {
    return next();
  }

  // SECURITY: Validate CSRF token for state-changing requests
  const csrfError = validateCSRFMiddleware(request, env);
  if (csrfError) {
    return csrfError;
  }

  const ipAddress = getClientIP(request);

  try {
    const auth = await enforceSession(request, env);
    if (auth.response) {
      return auth.response;
    }

    const { result, pendingCookie, timing } = auth;
    const { session, user, sessionId, sessionMeta, lucia } = result;

    const normalizedUser = normalizeUser(user);

    const sessionData = {
      user_id: normalizedUser.userId,
      expires_at: session.expiresAt?.toISOString?.() || null,
      created_at: sessionMeta?.created_at || null,
      last_activity_at: sessionMeta?.last_activity_at || new Date().toISOString(),
    };

    const pendingCookies = [];
    if (pendingCookie) {
      pendingCookies.push(pendingCookie);
    }

    const csrfCookie = getCookie(request, "csrf_token");
    if (!csrfCookie) {
      const csrfToken = generateCSRFToken(request, env, sessionId || session.id);
      pendingCookies.push(setCSRFCookie(csrfToken, request));
    }

    context.data = {
      ...context.data,
      authenticated: true,
      user: normalizedUser,
      session: sessionData,
      ipAddress,
      lucia,
    };

    const response = await next();

    const headers = new Headers(response.headers);
    pendingCookies.forEach((cookie) => headers.append("Set-Cookie", cookie));

    const exposeSessionTimingHeaders = env?.EXPOSE_SESSION_TIMING_HEADERS === "true";
    if (timing && exposeSessionTimingHeaders) {
      headers.set("X-Session-Expires-In", Math.floor(timing.timeRemaining / 1000).toString());
      headers.set("X-Session-Idle-Expires-In", Math.floor(timing.idleRemaining / 1000).toString());
      headers.set("X-Session-Absolute-Expires-In", Math.floor(timing.absoluteRemaining / 1000).toString());
      headers.set("X-Session-Warning", timing.timeRemaining < 5 * 60 * 1000 ? "true" : "false");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    log.error("Auth middleware error", { error });

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
