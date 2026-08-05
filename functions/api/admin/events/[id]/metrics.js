import { checkPermission } from "../../_middleware.js";
import { validateId } from "../../../../utils/validation.js";
import { sortableName } from "../../../../utils/sortableName.js";

export async function onRequestGet(context) {
  const { env, params } = context;
  const { DB } = env;
  const { valid, value: eventId, error: idError } = validateId(params.id);
  if (!valid) {
    return new Response(JSON.stringify({ error: idError }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // RBAC: Require viewer role or higher (read-only metrics)
  const permCheck = await checkPermission(context, "viewer");
  if (permCheck.error) {
    return permCheck.response;
  }

  try {
    const [metricsRes, popularBandsRes, shareStatsRes, topRoutesRes, announcementPlanningRes, telemetryStatsRes] =
      await DB.batch([
        DB.prepare(
          `SELECT COUNT(*) as total_schedule_builds,
                COUNT(DISTINCT user_session) as unique_visitors,
                MAX(created_at) as last_updated
         FROM schedule_builds WHERE event_id = ?`,
        ).bind(eventId),
        DB.prepare(
          `SELECT bp.id as band_id, bp.name as band_name,
                COUNT(sb.performance_id) as schedule_count
         FROM schedule_builds sb
         JOIN performances p ON sb.performance_id = p.id
         JOIN band_profiles bp ON p.band_profile_id = bp.id
         WHERE sb.event_id = ?
         GROUP BY bp.id, bp.name
         ORDER BY schedule_count DESC
         LIMIT 10`,
        ).bind(eventId),
        DB.prepare(
          `SELECT COUNT(*) AS total_shares,
                COALESCE(SUM(view_count), 0) AS total_share_views,
                COALESCE(SUM(import_count), 0) AS total_share_imports
         FROM share_links WHERE event_id = ?`,
        ).bind(eventId),
        DB.prepare(
          `SELECT slug, view_count FROM share_links
         WHERE event_id = ?
         ORDER BY view_count DESC, created_at DESC
         LIMIT 10`,
        ).bind(eventId),
        // Announcement planning: per-performance follower engagement signals for
        // organizers deciding what to announce next. COUNT-based only against
        // band_follows (verified = 1) — never selects email/tokens/consent_ip.
        // See PRIVACY CONTRACT in functions/api/stats/public.js for the same discipline.
        DB.prepare(
          `SELECT
           p.id AS performance_id,
           bp.id AS band_id,
           bp.name AS band_name,
           p.is_announced,
           (SELECT COUNT(*) FROM band_follows bf
              WHERE bf.band_profile_id = bp.id AND bf.verified = 1) AS follower_count,
           (SELECT COUNT(*) FROM band_follows bf
              WHERE bf.band_profile_id = bp.id AND bf.verified = 1
                AND bf.created_at >= datetime('now', '-7 days')) AS recent_growth,
           (SELECT COUNT(*) FROM band_follows bf
              WHERE bf.band_profile_id = bp.id AND bf.verified = 1
                AND NOT EXISTS (
                  SELECT 1 FROM band_follow_notifications bfn
                  WHERE bfn.performance_id = p.id AND bfn.band_follow_id = bf.id
                )) AS would_notify_count
         FROM performances p
         JOIN band_profiles bp ON p.band_profile_id = bp.id
         WHERE p.event_id = ?
         ORDER BY p.is_announced ASC, follower_count DESC, bp.name`,
        ).bind(eventId),
        // Telemetry-derived counts (#706): event_view / ticket_click from
        // functions/api/metrics.js, aggregated per event_id in event_daily_stats.
        // Summed across all dates for this event — best-effort ingestion means
        // this is a floor, not an exact count (see CLAUDE.md "Metrics & Analytics").
        DB.prepare(
          `SELECT COALESCE(SUM(event_views), 0) AS total_event_views,
                COALESCE(SUM(ticket_clicks), 0) AS total_ticket_clicks
         FROM event_daily_stats WHERE event_id = ?`,
        ).bind(eventId),
      ]);

    const metrics = metricsRes.results?.[0];
    const popularBands = popularBandsRes.results || [];
    const shareStats = shareStatsRes.results?.[0];
    const topSharedRoutes = topRoutesRes.results || [];
    const announcementPlanning = announcementPlanningRes.results || [];
    const telemetryStats = telemetryStatsRes.results?.[0];
    // bp.name is only the final tiebreaker here (after is_announced, then
    // follower_count) — SQLite ORDER BY can't strip a leading article inline
    // (#587), so re-derive that last tiebreaker in JS with the article-stripped
    // key. Cheap to do since is_announced/follower_count are already correct
    // from SQL; this only reorders ties on both of those.
    announcementPlanning.sort(
      (a, b) =>
        (a.is_announced ?? 0) - (b.is_announced ?? 0) ||
        (b.follower_count ?? 0) - (a.follower_count ?? 0) ||
        sortableName(a.band_name).localeCompare(sortableName(b.band_name)),
    );

    // Share-link analytics: shares created + total views + top routes by views.
    // Derived directly from share_links (creates are rows; views are view_count),
    // so no separate share telemetry path is needed.
    return new Response(
      JSON.stringify({
        success: true,
        metrics: {
          totalScheduleBuilds: metrics?.total_schedule_builds || 0,
          uniqueVisitors: metrics?.unique_visitors || 0,
          lastUpdated: metrics?.last_updated,
          popularBands: popularBands,
          totalShares: shareStats?.total_shares || 0,
          totalShareViews: shareStats?.total_share_views || 0,
          totalShareImports: shareStats?.total_share_imports || 0,
          topSharedRoutes: topSharedRoutes,
          announcementPlanning: announcementPlanning,
          totalEventViews: telemetryStats?.total_event_views || 0,
          totalTicketClicks: telemetryStats?.total_ticket_clicks || 0,
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
