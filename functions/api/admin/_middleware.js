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
      SELECT s.*, u.id as user_id, u.email, u.role, u.name
      FROM sessions s
      INNER JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > datetime('now')
    `
    )
      .bind(sessionToken)
      .first();

    if (session) {
      // Update last activity
      await DB.prepare(
        `UPDATE sessions SET last_activity_at = datetime('now') WHERE id = ?`
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
        }
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
      }
    );
  }
}
