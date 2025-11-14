import { checkPermission, auditLog } from "../_middleware.js";

export async function onRequestPatch(context) {
  const { request, env } = context;

  // RBAC: Require editor role or higher
  const permCheck = await checkPermission(request, env, "editor");
  if (permCheck.error) {
    return permCheck.response;
  }

  const user = permCheck.user;
  const ipAddress =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
    "unknown";

  const { band_ids, action, ignore_conflicts, ...params } =
    await request.json();

  if (!Array.isArray(band_ids) || band_ids.length === 0) {
    return new Response(JSON.stringify({ error: "Invalid band_ids" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    let result;

    if (action === "move_venue") {
      const { venue_id } = params;

      // Build batch update statements (ATOMIC - all or nothing)
      const statements = band_ids.map((id) =>
        env.DB.prepare("UPDATE bands SET venue_id = ? WHERE id = ?").bind(
          venue_id,
          id,
        ),
      );

      result = await env.DB.batch(statements);
    } else if (action === "change_time") {
      const { start_time } = params;

      // Preserve duration when changing time
      const statements = band_ids.map((id) =>
        env.DB.prepare(
          `
          UPDATE bands
          SET start_time = ?,
              end_time = datetime(?, '+' ||
                (strftime('%s', end_time) - strftime('%s', start_time)) || ' seconds')
          WHERE id = ?
        `,
        ).bind(start_time, start_time, id),
      );

      result = await env.DB.batch(statements);
    } else if (action === "delete") {
      const placeholders = band_ids.map(() => "?").join(",");
      result = await env.DB.prepare(
        `DELETE FROM bands WHERE id IN (${placeholders})`,
      )
        .bind(...band_ids)
        .run();
    }

    // Audit log the bulk operation
    await auditLog(
      env,
      user.userId,
      `band.bulk_${action}`,
      "band",
      null,
      {
        action,
        bandIds: band_ids,
        bandCount: band_ids.length,
        params,
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        updated: band_ids.length,
        action: action,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Bulk operation failed:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Database operation failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
