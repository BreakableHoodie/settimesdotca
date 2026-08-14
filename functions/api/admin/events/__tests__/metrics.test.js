// Admin event metrics endpoint tests
// GET /api/admin/events/[id]/metrics
import { describe, expect, test, vi } from "vitest";

// Mock RBAC middleware: authenticate via context.data.user.role or x-test-role header
vi.mock("../../_middleware.js", () => ({
  checkPermission: async (context) => {
    const role = context?.data?.user?.role || context?.request?.headers?.get("x-test-role");
    if (!role) {
      return {
        error: true,
        response: new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
    return { error: false, user: { userId: 1, role }, userId: 1 };
  },
  auditLog: async () => {},
}));

import { onRequestGet } from "../[id]/metrics.js";
import { createTestEnv, insertEvent, insertShareLink, insertBand } from "../../../test-utils.js";

describe("GET /api/admin/events/[id]/metrics", () => {
  function call(env, eventId) {
    return onRequestGet({
      request: new Request(`https://example.test/api/admin/events/${eventId}/metrics`, {
        headers: { "x-test-role": "viewer" },
      }),
      params: { id: String(eventId) },
      env,
      data: { user: { userId: 1, role: "viewer" } },
    });
  }

  test("includes share analytics: count, total views, and top routes by views", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Fest", slug: "fest" });
    insertShareLink(rawDb, {
      slug: "routeaaa",
      event_id: event.id,
      event_slug: "fest",
      performance_ids: [1],
      band_names: ["A"],
    });
    insertShareLink(rawDb, {
      slug: "routebbb",
      event_id: event.id,
      event_slug: "fest",
      performance_ids: [1, 2],
      band_names: ["A", "B"],
    });
    rawDb.prepare("UPDATE share_links SET view_count = ? WHERE slug = ?").run(5, "routeaaa");
    rawDb.prepare("UPDATE share_links SET view_count = ? WHERE slug = ?").run(2, "routebbb");

    const res = await call(env, event.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metrics.totalShares).toBe(2);
    expect(body.metrics.totalShareViews).toBe(7);
    expect(body.metrics.topSharedRoutes[0].slug).toBe("routeaaa");
    expect(body.metrics.topSharedRoutes[0].view_count).toBe(5);
  });

  test("top routes carry band_count and created_at, and zero-view shares are excluded (#702)", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Route Fest", slug: "route-fest" });
    // Two distinct bands
    insertShareLink(rawDb, {
      slug: "routeaa2",
      event_id: event.id,
      event_slug: "route-fest",
      performance_ids: [1, 2],
      band_names: ["A", "B"],
      expires_at: "2026-08-20 00:00:00",
    });
    // One band played twice → distinct count is 1, not 2
    insertShareLink(rawDb, {
      slug: "routebb2",
      event_id: event.id,
      event_slug: "route-fest",
      performance_ids: [3, 4],
      band_names: ["C", "C"],
      expires_at: "2026-08-20 00:00:00",
    });
    // Zero-view share must not appear in a "most-viewed" list
    insertShareLink(rawDb, {
      slug: "routezero",
      event_id: event.id,
      event_slug: "route-fest",
      performance_ids: [5],
      band_names: ["D"],
      expires_at: "2026-08-20 00:00:00",
    });
    rawDb.prepare("UPDATE share_links SET view_count = ? WHERE slug = ?").run(5, "routeaa2");
    rawDb.prepare("UPDATE share_links SET view_count = ? WHERE slug = ?").run(2, "routebb2");
    rawDb.prepare("UPDATE share_links SET created_at = ? WHERE slug = ?").run("2026-07-16 07:02:00", "routeaa2");

    const res = await call(env, event.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    const routes = body.metrics.topSharedRoutes;
    // Zero-view share filtered out
    expect(routes.map((r) => r.slug)).toEqual(["routeaa2", "routebb2"]);
    // Distinct band count, not performance count
    expect(routes[0].band_count).toBe(2);
    expect(routes[1].band_count).toBe(1);
    // Creation date surfaced so age is visible
    expect(routes[0].created_at).toBe("2026-07-16 07:02:00");
  });

  test("includes share import totals -- the conversion signal beside shares/views (#703)", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Fest", slug: "fest" });
    insertShareLink(rawDb, {
      slug: "routeccc",
      event_id: event.id,
      event_slug: "fest",
      performance_ids: [1],
      band_names: ["A"],
    });
    insertShareLink(rawDb, {
      slug: "routeddd",
      event_id: event.id,
      event_slug: "fest",
      performance_ids: [1, 2],
      band_names: ["A", "B"],
    });
    rawDb.prepare("UPDATE share_links SET import_count = ? WHERE slug = ?").run(3, "routeccc");
    rawDb.prepare("UPDATE share_links SET import_count = ? WHERE slug = ?").run(1, "routeddd");

    const res = await call(env, event.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metrics.totalShareImports).toBe(4);
  });

  test("event with no share links returns zeroed share import totals, not errors", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Quiet Share Fest", slug: "quiet-share-fest" });

    const res = await call(env, event.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metrics.totalShareImports).toBe(0);
  });

  test("popularBands is ordered by schedule_count desc and totalScheduleBuilds/uniqueVisitors reflect inserted rows", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Band Fest", slug: "band-fest" });

    const perfA = insertBand(rawDb, { name: "Alpha Band", event_id: event.id });
    const perfB = insertBand(rawDb, { name: "Beta Band", event_id: event.id });

    // Alpha Band: 3 schedule builds across 3 sessions
    rawDb
      .prepare("INSERT INTO schedule_builds (event_id, performance_id, user_session) VALUES (?, ?, ?)")
      .run(event.id, perfA.id, "session-1");
    rawDb
      .prepare("INSERT INTO schedule_builds (event_id, performance_id, user_session) VALUES (?, ?, ?)")
      .run(event.id, perfA.id, "session-2");
    rawDb
      .prepare("INSERT INTO schedule_builds (event_id, performance_id, user_session) VALUES (?, ?, ?)")
      .run(event.id, perfA.id, "session-3");
    // Beta Band: 1 schedule build, sharing session-3 with Alpha so the event
    // still has exactly 3 distinct visitor sessions overall
    rawDb
      .prepare("INSERT INTO schedule_builds (event_id, performance_id, user_session) VALUES (?, ?, ?)")
      .run(event.id, perfB.id, "session-3");

    const res = await call(env, event.id);
    expect(res.status).toBe(200);
    const body = await res.json();

    // popularBands should be a non-empty array ordered by schedule_count desc
    expect(Array.isArray(body.metrics.popularBands)).toBe(true);
    expect(body.metrics.popularBands.length).toBeGreaterThan(0);
    expect(body.metrics.popularBands[0].band_name).toBe("Alpha Band");
    expect(body.metrics.popularBands[0].schedule_count).toBe(3);
    expect(body.metrics.popularBands[1].band_name).toBe("Beta Band");
    expect(body.metrics.popularBands[1].schedule_count).toBe(1);

    // totalScheduleBuilds: 4 rows inserted
    expect(body.metrics.totalScheduleBuilds).toBe(4);
    // uniqueVisitors: 3 distinct sessions
    expect(body.metrics.uniqueVisitors).toBe(3);
  });

  describe("telemetry-derived totals (#706)", () => {
    test("sums event_daily_stats across dates into totalEventViews/totalTicketClicks", async () => {
      const { env, rawDb } = createTestEnv();
      const event = insertEvent(rawDb, { name: "Telemetry Fest", slug: "telemetry-fest" });

      rawDb
        .prepare(`INSERT INTO event_daily_stats (event_id, date, event_views, ticket_clicks) VALUES (?, ?, ?, ?)`)
        .run(event.id, "2026-08-01", 10, 2);
      rawDb
        .prepare(`INSERT INTO event_daily_stats (event_id, date, event_views, ticket_clicks) VALUES (?, ?, ?, ?)`)
        .run(event.id, "2026-08-02", 15, 5);

      const res = await call(env, event.id);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metrics.totalEventViews).toBe(25);
      expect(body.metrics.totalTicketClicks).toBe(7);
    });

    test("event with no telemetry rows returns zeroed totals, not errors", async () => {
      const { env, rawDb } = createTestEnv();
      const event = insertEvent(rawDb, { name: "Quiet Telemetry Fest", slug: "quiet-telemetry-fest" });

      const res = await call(env, event.id);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metrics.totalEventViews).toBe(0);
      expect(body.metrics.totalTicketClicks).toBe(0);
    });
  });

  describe("announcementPlanning (#556)", () => {
    // Seeds: Alpha (unannounced) with 3 verified follows (2 in the last 7 days,
    // 1 older), 1 unverified follow, and one verified follower already notified
    // for Alpha's performance; Beta (announced) with 1 verified follow.
    function seedEngagement(rawDb) {
      const event = insertEvent(rawDb, { name: "Engage Fest", slug: "engage-fest" });
      const alpha = insertBand(rawDb, { name: "Alpha Band", event_id: event.id });
      const beta = insertBand(rawDb, { name: "Beta Band", event_id: event.id });
      rawDb.prepare("UPDATE performances SET is_announced = 0 WHERE id = ?").run(alpha.id);
      rawDb.prepare("UPDATE performances SET is_announced = 1 WHERE id = ?").run(beta.id);

      // Two recent verified follows for Alpha
      rawDb
        .prepare(
          `INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token, created_at)
           VALUES (?, ?, 1, ?, datetime('now', '-1 days'))`,
        )
        .run("fan1@example.test", alpha.band_profile_id, "unsub-token-a1");
      rawDb
        .prepare(
          `INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token, created_at)
           VALUES (?, ?, 1, ?, datetime('now', '-2 days'))`,
        )
        .run("fan2@example.test", alpha.band_profile_id, "unsub-token-a2");
      // One OLD verified follow for Alpha (outside the 7-day growth window)
      rawDb
        .prepare(
          `INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token, created_at)
           VALUES (?, ?, 1, ?, datetime('now', '-30 days'))`,
        )
        .run("fan3@example.test", alpha.band_profile_id, "unsub-token-a3");
      // One UNVERIFIED follow for Alpha — must never count anywhere
      rawDb
        .prepare(
          `INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token, created_at)
           VALUES (?, ?, 0, ?, datetime('now'))`,
        )
        .run("pending@example.test", alpha.band_profile_id, "unsub-token-a4");
      // fan1 was already notified for Alpha's performance → excluded from would_notify
      const fan1 = rawDb
        .prepare("SELECT id FROM band_follows WHERE email = ? AND band_profile_id = ?")
        .get("fan1@example.test", alpha.band_profile_id);
      rawDb
        .prepare("INSERT INTO band_follow_notifications (performance_id, band_follow_id) VALUES (?, ?)")
        .run(alpha.id, fan1.id);
      // Beta: two verified follows
      rawDb
        .prepare(
          `INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token, created_at)
           VALUES (?, ?, 1, ?, datetime('now'))`,
        )
        .run("fan4@example.test", beta.band_profile_id, "unsub-token-b1");
      rawDb
        .prepare(
          `INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token, created_at)
           VALUES (?, ?, 1, ?, datetime('now'))`,
        )
        .run("fan5@example.test", beta.band_profile_id, "unsub-token-b2");

      return { event, alpha, beta };
    }

    test("returns per-performance engagement signals, unannounced first", async () => {
      const { env, rawDb } = createTestEnv();
      const { event, alpha, beta } = seedEngagement(rawDb);

      const res = await call(env, event.id);
      expect(res.status).toBe(200);
      const body = await res.json();
      const planning = body.metrics.announcementPlanning;

      expect(Array.isArray(planning)).toBe(true);
      expect(planning.length).toBe(2);

      // Unannounced Alpha ranks first despite Beta being announced later in the list
      expect(planning[0].performance_id).toBe(alpha.id);
      expect(planning[0].band_name).toBe("Alpha Band");
      expect(planning[0].is_announced).toBe(0);
      // 3 verified follows (the unverified one never counts)
      expect(planning[0].follower_count).toBe(3);
      // Only the two follows within the last 7 days
      expect(planning[0].recent_growth).toBe(2);
      // fan1 already has a notification row for this performance → 3 - 1 = 2
      expect(planning[0].would_notify_count).toBe(2);

      expect(planning[1].performance_id).toBe(beta.id);
      expect(planning[1].is_announced).toBe(1);
      expect(planning[1].follower_count).toBe(2);
    });

    test("response contains no follower PII (emails, tokens, consent data)", async () => {
      const { env, rawDb } = createTestEnv();
      const { event } = seedEngagement(rawDb);

      const res = await call(env, event.id);
      expect(res.status).toBe(200);
      const raw = await res.text();

      // COUNT-only contract: none of the band_follows PII columns may leak.
      expect(raw).not.toMatch(/@example\.test/);
      expect(raw).not.toMatch(/unsub-token/);
      expect(raw).not.toMatch(/verification_token|unsubscribe_token|consent_ip|consent_method/);
      expect(raw).not.toMatch(/"email"/);
    });

    test("event with no follows returns zeroed signals, not errors", async () => {
      const { env, rawDb } = createTestEnv();
      const event = insertEvent(rawDb, { name: "Quiet Fest", slug: "quiet-fest" });
      insertBand(rawDb, { name: "Solo Act", event_id: event.id });

      const res = await call(env, event.id);
      expect(res.status).toBe(200);
      const body = await res.json();
      const planning = body.metrics.announcementPlanning;
      expect(planning.length).toBe(1);
      expect(planning[0].follower_count).toBe(0);
      expect(planning[0].recent_growth).toBe(0);
      expect(planning[0].would_notify_count).toBe(0);
    });
  });
});
