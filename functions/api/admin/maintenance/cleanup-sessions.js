
import { checkPermission, auditLog } from "../_middleware.js";
import { getClientIP } from "../../../utils/request.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  // Only allow admins to trigger cleanup manually
  // If triggered by a cron (future), we might need a different auth mechanism (e.g. API key)
  // For now, we rely on the admin session check.
  const auth = await checkPermission(context, "admin");
  if (auth.error) {
    return auth.response;
  }

  try {
    const now = Math.floor(Date.now() / 1000);

    // Delete expired sessions
    const result = await DB.prepare(
      "DELETE FROM lucia_sessions WHERE expires_at < ?"
    )
      .bind(now)
      .run();

    await auditLog(
      env,
      auth.user.userId,
      "sessions.cleanup",
      "lucia_sessions",
      null,
      { deleted_count: result.meta.changes },
      getClientIP(request),
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleanup complete. Deleted ${result.meta.changes} expired sessions.`,
        deleted_count: result.meta.changes,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Session cleanup error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to cleanup sessions" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
