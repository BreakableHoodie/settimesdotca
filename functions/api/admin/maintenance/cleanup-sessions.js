import { checkPermission, auditLog } from "../_middleware.js";
import { getClientIP } from "../../../utils/request.js";
import { runRetentionCleanup } from "./retention.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = await checkPermission(context, "admin");
  if (auth.error) {
    return auth.response;
  }

  try {
    const results = await runRetentionCleanup(env);

    await auditLog(env, auth.user.userId, "maintenance.cleanup", "system", null, results, getClientIP(request));

    return new Response(
      JSON.stringify({
        success: true,
        message: "Cleanup complete.",
        ...results,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Cleanup error:", error);
    return new Response(JSON.stringify({ error: "Failed to run cleanup" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
