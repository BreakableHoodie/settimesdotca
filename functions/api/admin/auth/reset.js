// Password reset endpoint (master password recovery)
// POST /api/admin/auth/reset
// Body: { masterPassword: string }
// Returns: { success: true, adminPassword: string } or error

function getClientIP(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
    "unknown"
  );
}

async function logAuthEvent(DB, ipAddress, action, success, details = null) {
  await DB.prepare(
    `
    INSERT INTO auth_audit (ip_address, action, success, user_agent, details)
    VALUES (?, ?, ?, ?, ?)
  `
  )
    .bind(
      ipAddress,
      action,
      success ? 1 : 0,
      details?.userAgent || null,
      details ? JSON.stringify(details) : null
    )
    .run();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);

  try {
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { masterPassword } = body;

    if (!masterPassword) {
      await logAuthEvent(DB, ipAddress, "password_reset", false, {
        reason: "missing_master_password",
      });

      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Master password is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Verify master password
    const expectedMasterPassword = env.MASTER_PASSWORD;

    if (masterPassword !== expectedMasterPassword) {
      await logAuthEvent(DB, ipAddress, "password_reset", false, {
        reason: "invalid_master_password",
      });

      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Invalid master password",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Success - return admin password
    await logAuthEvent(DB, ipAddress, "password_reset", true);

    return new Response(
      JSON.stringify({
        success: true,
        adminPassword: env.ADMIN_PASSWORD,
        message: "Admin password retrieved successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Password reset error:", error);

    return new Response(
      JSON.stringify({
        error: "Server error",
        message: "Failed to process password reset request",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
