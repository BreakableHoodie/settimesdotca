import { checkPermission } from "../../_middleware.js";

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const { DB } = env;
  const eventId = params.id;

  // RBAC: Require viewer role or higher (read-only metrics)
  const permCheck = await checkPermission(request, env, "viewer");
  if (permCheck.error) {
    return permCheck.response;
  }

  try {
    // Get event metrics
    const metrics = await DB.prepare(
      `
      SELECT
        COUNT(*) as total_schedule_builds,
        COUNT(DISTINCT user_session) as unique_visitors,
        MAX(created_at) as last_updated
      FROM schedule_builds
      WHERE event_id = ?
    `,
    )
      .bind(eventId)
      .first();

    // Get most popular bands
    const popularBands = await DB.prepare(
      `
      SELECT
        b.id as band_id,
        b.name as band_name,
        COUNT(sb.band_id) as schedule_count
      FROM schedule_builds sb
      JOIN bands b ON sb.band_id = b.id
      WHERE sb.event_id = ?
      GROUP BY b.id, b.name
      ORDER BY schedule_count DESC
      LIMIT 10
    `,
    )
      .bind(eventId)
      .all();

    return new Response(
      JSON.stringify({
        success: true,
        metrics: {
          totalScheduleBuilds: metrics?.total_schedule_builds || 0,
          uniqueVisitors: metrics?.unique_visitors || 0,
          lastUpdated: metrics?.last_updated,
          popularBands: popularBands.results || [],
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Metrics error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to load metrics",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
