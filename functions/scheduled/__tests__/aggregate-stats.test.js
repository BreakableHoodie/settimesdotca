import { describe, it, expect } from "vitest";
import { createTestEnv } from "../../api/test-utils.js";
import { scheduled } from "../aggregate-stats.js";

async function runScheduled(env) {
  await scheduled({}, env, {});
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("aggregate-stats scheduled job (P1-P3)", () => {
  it("sets total_views to sum of page_views for the profile", async () => {
    const { env, rawDb } = createTestEnv();
    const { lastInsertRowid: profileId } = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)")
      .run("Stat Band", "statband");

    rawDb
      .prepare("INSERT INTO artist_daily_stats (band_profile_id, date, page_views, social_clicks) VALUES (?, ?, ?, ?)")
      .run(profileId, "2026-05-01", 100, 5);
    rawDb
      .prepare("INSERT INTO artist_daily_stats (band_profile_id, date, page_views, social_clicks) VALUES (?, ?, ?, ?)")
      .run(profileId, "2026-05-02", 200, 10);

    await runScheduled(env);

    const profile = rawDb
      .prepare("SELECT total_views, total_social_clicks FROM band_profiles WHERE id = ?")
      .get(profileId);
    expect(profile.total_views).toBe(300);
    expect(profile.total_social_clicks).toBe(15);
  });

  it("resets total_views to 0 for profiles with no stats", async () => {
    const { env, rawDb } = createTestEnv();
    // Insert a profile and manually set non-zero totals (simulating a prior run)
    rawDb
      .prepare(
        "INSERT INTO band_profiles (name, name_normalized, total_views, total_social_clicks, popularity_score) VALUES (?, ?, ?, ?, ?)",
      )
      .run("Stale Band", "staleband", 999, 888, 77.0);
    const profileId = rawDb.prepare("SELECT id FROM band_profiles WHERE name_normalized = ?").get("staleband").id;

    // No artist_daily_stats rows for this profile — aggregation should reset to 0
    await runScheduled(env);

    const profile = rawDb
      .prepare("SELECT total_views, total_social_clicks, popularity_score FROM band_profiles WHERE id = ?")
      .get(profileId);
    expect(profile.total_views).toBe(0);
    expect(profile.total_social_clicks).toBe(0);
    expect(profile.popularity_score).toBe(0);
  });

  it("popularity_score only counts data from the last 30 days", async () => {
    const { env, rawDb } = createTestEnv();
    const { lastInsertRowid: profileId } = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)")
      .run("Trending Band", "trendingband");

    // Recent row — should count toward popularity
    rawDb
      .prepare("INSERT INTO artist_daily_stats (band_profile_id, date, page_views, social_clicks) VALUES (?, ?, ?, ?)")
      .run(profileId, daysAgo(5), 10, 4);
    // Old row — should NOT count toward popularity (> 30 days ago)
    rawDb
      .prepare("INSERT INTO artist_daily_stats (band_profile_id, date, page_views, social_clicks) VALUES (?, ?, ?, ?)")
      .run(profileId, daysAgo(60), 1000, 500);

    await runScheduled(env);

    const profile = rawDb
      .prepare("SELECT total_views, popularity_score FROM band_profiles WHERE id = ?")
      .get(profileId);
    // total_views sums ALL history
    expect(profile.total_views).toBe(1010);
    // popularity_score only counts recent: 10*1 + 4*3 = 22
    expect(profile.popularity_score).toBeCloseTo(22, 1);
  });

  it("deletes artist_daily_stats older than 90 days", async () => {
    const { env, rawDb } = createTestEnv();
    const { lastInsertRowid: profileId } = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)")
      .run("Retention Band", "retentionband");

    rawDb
      .prepare("INSERT INTO artist_daily_stats (band_profile_id, date, page_views) VALUES (?, ?, ?)")
      .run(profileId, daysAgo(91), 50);
    rawDb
      .prepare("INSERT INTO artist_daily_stats (band_profile_id, date, page_views) VALUES (?, ?, ?)")
      .run(profileId, daysAgo(45), 30);
    rawDb
      .prepare("INSERT INTO artist_daily_stats (band_profile_id, date, page_views) VALUES (?, ?, ?)")
      .run(profileId, daysAgo(0), 10);

    await runScheduled(env);

    const remaining = rawDb
      .prepare("SELECT COUNT(*) as count FROM artist_daily_stats WHERE band_profile_id = ?")
      .get(profileId);
    expect(remaining.count).toBe(2); // only -45 days and today survive
  });
});
