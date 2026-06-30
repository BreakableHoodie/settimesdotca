// Aggregates artist metrics into band_profiles totals and runs data retention cleanup.

import { runRetentionCleanup } from "../api/admin/maintenance/retention.js";

export async function scheduled(_event, env, _ctx) {
  const { DB } = env;
  if (!DB) {
    return;
  }

  try {
    // Two-pass approach: reset all to 0, then fill from a single GROUP BY aggregation.
    // This replaces three correlated subqueries (O(B×S)) with one scan of artist_daily_stats.
    await DB.batch([
      DB.prepare(
        `UPDATE band_profiles SET total_views = 0, total_social_clicks = 0, popularity_score = 0`,
      ),
      DB.prepare(
        `UPDATE band_profiles
         SET
           total_views        = agg.total_views,
           total_social_clicks = agg.total_social_clicks,
           popularity_score   = agg.popularity_score
         FROM (
           SELECT
             band_profile_id,
             SUM(page_views)    AS total_views,
             SUM(social_clicks) AS total_social_clicks,
             SUM(
               CASE WHEN date >= date('now', '-30 days')
                    THEN page_views * 1.0 + social_clicks * 3.0
                    ELSE 0 END
             ) AS popularity_score
           FROM artist_daily_stats
           GROUP BY band_profile_id
         ) AS agg
         WHERE band_profiles.id = agg.band_profile_id`,
      ),
    ]);

    await DB.prepare(
      `
      DELETE FROM artist_daily_stats
      WHERE date < date('now', '-90 days')
    `,
    ).run();
  } catch (error) {
    console.error("[Metrics] Aggregation error:", error);
  }

  try {
    await runRetentionCleanup(env);
    console.log("[Retention] Cleanup complete.");
  } catch (error) {
    console.error("[Retention] Cleanup error:", error);
  }
}
