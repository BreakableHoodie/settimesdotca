// Admin authentication middleware
// Applies to all /api/admin/* endpoints except /api/admin/auth/*

// Get client IP from request
function getClientIP(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
    "unknown"
  );
}

// Verify session token and get user
async function verifySession(DB, sessionToken) {
  if (!sessionToken) {
    return null;
  }

  // Check if sessions table exists (will be created by 2FA migration)
  try {
    const session = await DB.prepare(
      `
      SELECT s.*, u.id as user_id, u.email, u.role, u.name, u.is_active
      FROM sessions s
      INNER JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > datetime('now')
    `,
    )
      .bind(sessionToken)
      .first();

    if (session && session.is_active === 1) {
      // Update last activity
      await DB.prepare(
        `UPDATE sessions SET last_activity_at = datetime('now') WHERE id = ?`,
      )
        .bind(sessionToken)
        .run();

      return {
        userId: session.user_id,
        email: session.email,
        role: session.role,
        name: session.name,
      };
    }
  } catch (error) {
    // Sessions table doesn't exist yet - fall back to simple check
    console.log("Sessions table not yet created, using fallback auth");
    return null;
  }

  return null;
}

// Check if user has required permission based on role hierarchy
// Role hierarchy: admin (3) > editor (2) > viewer (1)
export async function checkPermission(request, env, requiredRole) {
  const sessionToken =
    request.headers.get("Authorization")?.replace("Bearer ", "") ||
    request.headers.get("X-Session-Token");

  if (!sessionToken) {
    return {
      error: true,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  const user = await verifySession(env.DB, sessionToken);

  if (!user) {
    return {
      error: true,
      response: new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

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
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    };
  }

  return { error: false, user };
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
) {
  try {
    await env.DB.prepare(
      `
      INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    )
      .bind(
        userId,
        action,
        resourceType || null,
        resourceId || null,
        details ? JSON.stringify(details) : null,
        ipAddress || "unknown",
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

  const { DB } = env;
  const ipAddress = getClientIP(request);

  try {
    // Get session token from header or cookie
    const sessionToken =
      request.headers.get("Authorization")?.replace("Bearer ", "") ||
      request.headers.get("X-Session-Token");

    // Verify session
    const user = await verifySession(DB, sessionToken);

    if (!user) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Valid session required",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Store auth info in context for handlers to use
    context.data = {
      ...context.data,
      authenticated: true,
      user,
      ipAddress,
    };

    return next();
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
      },
    );
  }
}
