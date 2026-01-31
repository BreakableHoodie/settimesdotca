// Aggregates artist metrics into band_profiles totals

export async function scheduled(_event, env, _ctx) {
  const { DB } = env;
  if (!DB) {
    return;
  }

  try {
    await DB.prepare(
      `
      UPDATE band_profiles
      SET
        total_views = COALESCE((
          SELECT SUM(page_views)
          FROM artist_daily_stats
          WHERE band_profile_id = band_profiles.id
        ), 0),
        total_social_clicks = COALESCE((
          SELECT SUM(social_clicks)
          FROM artist_daily_stats
          WHERE band_profile_id = band_profiles.id
        ), 0),
        popularity_score = COALESCE((
          SELECT
            SUM(page_views) * 1.0 +
            SUM(social_clicks) * 3.0 +
            SUM(share_count) * 5.0
          FROM artist_daily_stats
          WHERE band_profile_id = band_profiles.id
            AND date >= date('now', '-30 days')
        ), 0)
    `,
    ).run();

    await DB.prepare(
      `
      DELETE FROM artist_daily_stats
      WHERE date < date('now', '-90 days')
    `,
    ).run();
  } catch (error) {
    console.error("[Metrics] Aggregation error:", error);
  }
}
