import { checkPermission } from "../../_middleware.js";
import { validateId } from "../../../../utils/validation.js";
import { AFTER_MIDNIGHT_THRESHOLD_HOUR } from "../../../../utils/eventDay.js";
import { logger } from "../../../../utils/logger.js";

async function loadReferrers(DB, eventId) {
  try {
    const { results } = await DB.prepare(
      `SELECT r.bucket AS bucket, SUM(r.visits) AS visits
       FROM referrer_daily_stats r
       JOIN events e ON e.id = ?
       WHERE r.date >= date(e.date, '-14 days')
         AND r.date <= COALESCE(e.end_date, e.date)
       GROUP BY r.bucket
       ORDER BY visits DESC, r.bucket`,
    )
      .bind(eventId)
      .all();
    return (results || []).map((row) => ({ bucket: row.bucket, visits: row.visits }));
  } catch (error) {
    logger.error("event referrer metrics read failed", { error, eventId });
    // null, not []: the dashboard must not show a failed read as "no visits".
    return null;
  }
}

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
    const [metricsRes, routeSizeRes, popularBandsRes, shareStatsRes, shareTotalsRes, topRoutesRes, telemetryStatsRes] =
      await DB.batch([
        DB.prepare(
          `SELECT COUNT(*) as total_schedule_builds,
                COUNT(DISTINCT visitor_hash) as route_builders,
                MAX(created_at) as last_updated
         FROM schedule_builds WHERE event_id = ?`,
        ).bind(eventId),
        DB.prepare(
          `SELECT CASE
                    WHEN route_size = 1 THEN '1'
                    WHEN route_size BETWEEN 2 AND 3 THEN '2-3'
                    WHEN route_size BETWEEN 4 AND 6 THEN '4-6'
                    WHEN route_size BETWEEN 7 AND 11 THEN '7-11'
                    ELSE '12+'
                  END AS bucket,
                  COUNT(*) AS route_count
           FROM (
              SELECT visitor_hash, COUNT(*) AS route_size
              FROM schedule_builds
              WHERE event_id = ?
              GROUP BY visitor_hash
           )
           GROUP BY bucket
           ORDER BY CASE bucket
             WHEN '1' THEN 1
             WHEN '2-3' THEN 2
             WHEN '4-6' THEN 3
             WHEN '7-11' THEN 4
             ELSE 5
           END`,
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
                 COALESCE(SUM(view_count_legacy), 0) AS total_share_views_legacy,
                 COALESCE(SUM(import_count), 0) AS total_share_imports
         FROM share_links WHERE event_id = ?`,
        ).bind(eventId),
        DB.prepare(
          `SELECT shares, views, views_legacy, imports
         FROM event_share_totals WHERE event_id = ?`,
        ).bind(eventId),
        DB.prepare(
          `SELECT slug, view_count, view_count_legacy, band_names, created_at FROM share_links
         WHERE event_id = ? AND (view_count > 0 OR view_count_legacy > 0)
         -- Unique visitors stay the primary unit; legacy raw fetches only break
         -- ties. Legacy-only rows all have view_count = 0, so without the second
         -- key created_at would decide which of them survive LIMIT 10 -- letting
         -- a 2-fetch route displace a 500-fetch one. The two are never compared
         -- across units: this only orders within the zero-visitor group.
         ORDER BY view_count DESC, COALESCE(view_count_legacy, 0) DESC, created_at DESC
         LIMIT 10`,
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

    // Show-night usage curve (#1246 Q1): event-page views per festival date and
    // Toronto hour. Counts only, no visitor key. Read on its own, not in the
    // batch above: as one statement there, a missing or broken table turned
    // every metric into a 500 (CodeRabbit). A failure is null ("unavailable"),
    // never [], which the dashboard would show as "no views recorded".
    // Festival order within a date: 6 AM first ... 11 PM, then 12-5 AM, because
    // after-midnight hours belong to the END of the night, not the start.
    const festivalHourKey = (hour) => (hour + 24 - AFTER_MIDNIGHT_THRESHOLD_HOUR) % 24;
    let showNightCurve = null;
    try {
      const hourlyViewsRes = await DB.prepare(
        `SELECT festival_date, hour, views FROM event_hourly_views WHERE event_id = ?`,
      )
        .bind(eventId)
        .all();
      showNightCurve = (hourlyViewsRes.results || [])
        .map(({ festival_date, hour, views }) => ({ festival_date, hour, views }))
        .sort(
          (a, b) => a.festival_date.localeCompare(b.festival_date) || festivalHourKey(a.hour) - festivalHourKey(b.hour),
        );
    } catch (error) {
      console.error("Show-night curve read failed:", { eventId, error });
    }

    const referrers = await loadReferrers(DB, eventId);

    const metrics = metricsRes.results?.[0];
    const routeBuilders = metrics?.route_builders || 0;
    const totalEventViews = telemetryStatsRes.results?.[0]?.total_event_views || 0;
    const completionRate = totalEventViews > 0 ? (routeBuilders / totalEventViews) * 100 : undefined;
    const routeSizeCounts = new Map((routeSizeRes.results || []).map((row) => [row.bucket, row.route_count]));
    const routeSizeDistribution = ["1", "2-3", "4-6", "7-11", "12+"].map((bucket) => ({
      bucket,
      route_count: routeSizeCounts.get(bucket) || 0,
    }));
    const popularBands = popularBandsRes.results || [];
    const shareStats = shareStatsRes.results?.[0];
    const shareTotals = shareTotalsRes.results?.[0];
    const topSharedRoutes = (topRoutesRes.results || []).map((row) => {
      // band_names is the JSON snapshot stored at share time; a band playing
      // twice appears twice, so count DISTINCT names — the route size an admin
      // actually cares about. Malformed JSON degrades to 0 bands, not a 500.
      let bandCount;
      try {
        bandCount = new Set(JSON.parse(row.band_names)).size;
      } catch {
        bandCount = 0;
      }
      return {
        slug: row.slug,
        view_count: row.view_count,
        view_count_legacy: row.view_count_legacy,
        created_at: row.created_at,
        band_count: bandCount,
      };
    });
    const telemetryStats = telemetryStatsRes.results?.[0];
    // Share-link analytics: live rows plus aggregate totals folded when rows
    // expired. Route detail remains live-only because it is not retained.
    return new Response(
      JSON.stringify({
        success: true,
        metrics: {
          totalScheduleBuilds: metrics?.total_schedule_builds || 0,
          routeBuilders: routeBuilders,
          completionRate: completionRate,
          routeSizeDistribution: routeSizeDistribution,
          lastUpdated: metrics?.last_updated,
          popularBands: popularBands,
          totalShares: (shareStats?.total_shares || 0) + (shareTotals?.shares || 0),
          totalShareViews: (shareStats?.total_share_views || 0) + (shareTotals?.views || 0),
          totalShareViewsLegacy: (shareStats?.total_share_views_legacy || 0) + (shareTotals?.views_legacy || 0),
          totalShareImports: (shareStats?.total_share_imports || 0) + (shareTotals?.imports || 0),
          topSharedRoutes: topSharedRoutes,
          totalEventViews: telemetryStats?.total_event_views || 0,
          totalTicketClicks: telemetryStats?.total_ticket_clicks || 0,
          showNightCurve,
          referrers,
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
