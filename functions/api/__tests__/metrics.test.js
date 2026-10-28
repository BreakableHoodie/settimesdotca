// Tests for POST /api/metrics
// Covers: event_view/ticket_click no longer written to page_views_daily (#445 fix),
// page_view events still written as real path keys, catch-logging (swallowed
// page_views_daily failure now emits logger.error), and event_view/ticket_click
// now aggregating per event_id into event_daily_stats (#706 — previously
// allowlisted, validated, and rate-limited but silently dropped).
import { describe, expect, test, vi, afterEach } from "vitest";
import { onRequestPost } from "../metrics.js";
import * as loggerModule from "../../utils/logger.js";
import { createTestEnv, insertBand, insertEvent } from "../test-utils.js";

function makeRequest(events) {
  return new Request("https://example.test/api/metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });
}

describe("POST /api/metrics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("event_view events do NOT write synthetic keys to page_views_daily (#445)", async () => {
    const { env, rawDb } = createTestEnv();

    // 25 event_view events — before the fix these wrote 25 event:N rows; now they
    // should write nothing to page_views_daily (the path page_view already captures
    // the visit; storing synthetic keys caused double-counting).
    const events = Array.from({ length: 25 }, (_, i) => ({
      event: "event_view",
      props: { event_id: i + 1 },
    }));

    const res = await onRequestPost({ request: makeRequest(events), env });
    expect(res.status).toBe(200);

    const rows = rawDb.prepare("SELECT * FROM page_views_daily").all();
    expect(rows).toHaveLength(0);
  });

  test("ticket_click events do NOT write synthetic keys to page_views_daily (#445)", async () => {
    const { env, rawDb } = createTestEnv();

    const events = [
      { event: "ticket_click", props: { event_id: 1 } },
      { event: "ticket_click", props: { event_id: 2 } },
    ];

    const res = await onRequestPost({ request: makeRequest(events), env });
    expect(res.status).toBe(200);

    const rows = rawDb.prepare("SELECT * FROM page_views_daily").all();
    expect(rows).toHaveLength(0);
  });

  test("page_view events still write real path keys to page_views_daily", async () => {
    const { env, rawDb } = createTestEnv();

    const events = [
      { event: "page_view", props: { page: "/event/lwbc16" } },
      { event: "page_view", props: { page: "/event/lwbc16" } },
      { event: "page_view", props: { page: "/bands/cool-band" } },
    ];

    const res = await onRequestPost({ request: makeRequest(events), env });
    expect(res.status).toBe(200);

    const rows = rawDb.prepare("SELECT page, views FROM page_views_daily ORDER BY page").all();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.page === "/event/lwbc16").views).toBe(2);
    expect(rows.find((r) => r.page === "/bands/cool-band").views).toBe(1);
  });

  test("returns 200 and logs a warning when page_views_daily batch fails", async () => {
    const { env } = createTestEnv();

    // Stub env.DB.batch to throw, simulating a D1 write error (e.g. missing
    // migration). better-sqlite3's prepare() validates eagerly so we can't
    // drop the table — instead we inject a failure at batch() time.
    env.DB.batch = async () => {
      throw new Error("simulated page_views_daily write failure");
    };

    const warnSpy = vi.spyOn(loggerModule.logger, "error");

    // page_view events populate pvStmts only (no artist_daily_stats batch).
    const events = [{ event: "page_view", props: { page: "/home" } }];
    const res = await onRequestPost({ request: makeRequest(events), env });

    // Best-effort: must still return 200
    expect(res.status).toBe(200);

    // The swallowed catch must now emit a structured warning
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("page_views_daily"),
      expect.objectContaining({ statementCount: expect.any(Number) }),
    );
  });

  test("drops retired filter_use events without storing or sending them", async () => {
    const { env, rawDb } = createTestEnv();
    env.ANALYTICS = { writeDataPoint: vi.fn() };

    const res = await onRequestPost({
      request: makeRequest([{ event: "filter_use", props: { page: "/x" } }]),
      env,
    });

    expect(res.status).toBe(200);
    expect(env.ANALYTICS.writeDataPoint).not.toHaveBeenCalled();
    expect(rawDb.prepare("SELECT COUNT(*) AS count FROM page_views_daily").get().count).toBe(0);
  });
});

describe("POST /api/metrics — referrer buckets (#1246 Q3)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("counts one visit per request and accumulates across requests", async () => {
    const { env, rawDb } = createTestEnv();

    await onRequestPost({
      request: makeRequest([
        { event: "visit", props: { referrer_bucket: "instagram" } },
        { event: "visit", props: { referrer_bucket: "instagram" } },
      ]),
      env,
    });
    await onRequestPost({
      request: makeRequest([{ event: "visit", props: { referrer_bucket: "instagram" } }]),
      env,
    });

    expect(rawDb.prepare("SELECT bucket, visits FROM referrer_daily_stats").all()).toEqual([
      { bucket: "instagram", visits: 2 },
    ]);
  });

  test("a request flooded with visit events still counts one, for its first valid bucket", async () => {
    const { env, rawDb } = createTestEnv();
    const flood = [
      { event: "visit", props: { referrer_bucket: "evil" } },
      ...Array.from({ length: 49 }, (_, i) => ({
        event: "visit",
        props: { referrer_bucket: i === 0 ? "google" : "instagram" },
      })),
    ];

    await onRequestPost({ request: makeRequest(flood), env });

    expect(rawDb.prepare("SELECT bucket, visits FROM referrer_daily_stats").all()).toEqual([
      { bucket: "google", visits: 1 },
    ]);
  });

  test("keys a visit by festival day: 1 AM belongs to the night before", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // 2026-10-12 01:00 Toronto (EDT, UTC-4): still Oct 11's festival night.
      vi.setSystemTime(new Date(Date.UTC(2026, 9, 12, 5, 0)));
      const { env, rawDb } = createTestEnv();

      await onRequestPost({
        request: makeRequest([{ event: "visit", props: { referrer_bucket: "instagram" } }]),
        env,
      });

      expect(rawDb.prepare("SELECT date, bucket, visits FROM referrer_daily_stats").all()).toEqual([
        { date: "2026-10-11", bucket: "instagram", visits: 1 },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("drops forged referrer labels", async () => {
    const { env, rawDb } = createTestEnv();
    env.ANALYTICS = { writeDataPoint: vi.fn() };

    const res = await onRequestPost({
      request: makeRequest([
        { event: "visit", props: { referrer_bucket: "https://x" } },
        { event: "visit", props: { referrer_bucket: "evil" } },
      ]),
      env,
    });

    expect(res.status).toBe(200);
    expect(rawDb.prepare("SELECT * FROM referrer_daily_stats").all()).toEqual([]);
    expect(env.ANALYTICS.writeDataPoint).not.toHaveBeenCalled();
  });

  test("a referrer write failure does not affect other metrics", async () => {
    const { env, rawDb } = createTestEnv();
    const errorSpy = vi.spyOn(loggerModule.logger, "error");
    rawDb.exec("DROP TABLE referrer_daily_stats");

    const res = await onRequestPost({
      request: makeRequest([
        { event: "page_view", props: { page: "/home" } },
        { event: "visit", props: { referrer_bucket: "direct" } },
      ]),
      env,
    });

    expect(res.status).toBe(200);
    expect(rawDb.prepare("SELECT page, views FROM page_views_daily").all()).toEqual([
      expect.objectContaining({ page: "/home", views: 1 }),
    ]);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("referrer_daily_stats"),
      expect.objectContaining({ bucket: "direct" }),
    );
  });
});

// ---------------------------------------------------------------------------
// event_view / ticket_click → event_daily_stats (#706)
//
// Both events were allowlisted, validated, and rate-limited, but had no
// consumer at all — every one was silently dropped. Fixes attribute each per
// event_id (the only prop the client sends for either event; see
// frontend/src/utils/metrics.js trackEventView/trackTicketClick) into a
// dedicated table rather than page_views_daily, which is path-keyed and
// previously double-counted the same view under two key formats when
// event_id-keyed synthetic rows were mixed in (#445).
// ---------------------------------------------------------------------------
describe("POST /api/metrics — event_view and ticket_click write to event_daily_stats (#706)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("event_view events increment event_views for the right event", async () => {
    const { env, rawDb } = createTestEnv();
    const eventA = insertEvent(rawDb, { name: "Fest A", slug: "fest-a" });
    const eventB = insertEvent(rawDb, { name: "Fest B", slug: "fest-b" });

    const events = [
      { event: "event_view", props: { event_id: eventA.id } },
      { event: "event_view", props: { event_id: eventA.id } },
      { event: "event_view", props: { event_id: eventA.id } },
      { event: "event_view", props: { event_id: eventB.id } },
    ];

    const res = await onRequestPost({ request: makeRequest(events), env });
    expect(res.status).toBe(200);

    const rows = rawDb.prepare("SELECT * FROM event_daily_stats ORDER BY event_id").all();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.event_id === eventA.id).event_views).toBe(3);
    expect(rows.find((r) => r.event_id === eventA.id).ticket_clicks).toBe(0);
    expect(rows.find((r) => r.event_id === eventB.id).event_views).toBe(1);
  });

  test("ticket_click events increment ticket_clicks for the right event", async () => {
    const { env, rawDb } = createTestEnv();
    const eventA = insertEvent(rawDb, { name: "Fest A", slug: "fest-a" });
    const eventB = insertEvent(rawDb, { name: "Fest B", slug: "fest-b" });

    const events = [
      { event: "ticket_click", props: { event_id: eventA.id } },
      { event: "ticket_click", props: { event_id: eventB.id } },
      { event: "ticket_click", props: { event_id: eventB.id } },
    ];

    const res = await onRequestPost({ request: makeRequest(events), env });
    expect(res.status).toBe(200);

    const rows = rawDb.prepare("SELECT * FROM event_daily_stats ORDER BY event_id").all();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.event_id === eventA.id).ticket_clicks).toBe(1);
    expect(rows.find((r) => r.event_id === eventA.id).event_views).toBe(0);
    expect(rows.find((r) => r.event_id === eventB.id).ticket_clicks).toBe(2);
  });

  test("event_view and ticket_click for the same event merge into a single upsert row", async () => {
    const { env, rawDb } = createTestEnv();
    const eventA = insertEvent(rawDb, { name: "Fest A", slug: "fest-a" });

    const events = [
      { event: "event_view", props: { event_id: eventA.id } },
      { event: "event_view", props: { event_id: eventA.id } },
      { event: "ticket_click", props: { event_id: eventA.id } },
    ];

    const res = await onRequestPost({ request: makeRequest(events), env });
    expect(res.status).toBe(200);

    const rows = rawDb.prepare("SELECT * FROM event_daily_stats").all();
    expect(rows).toHaveLength(1);
    expect(rows[0].event_views).toBe(2);
    expect(rows[0].ticket_clicks).toBe(1);
  });

  test("a second batch on the same day accumulates onto the existing row (ON CONFLICT upsert)", async () => {
    const { env, rawDb } = createTestEnv();
    const eventA = insertEvent(rawDb, { name: "Fest A", slug: "fest-a" });

    await onRequestPost({
      request: makeRequest([{ event: "ticket_click", props: { event_id: eventA.id } }]),
      env,
    });
    await onRequestPost({
      request: makeRequest([{ event: "ticket_click", props: { event_id: eventA.id } }]),
      env,
    });

    const rows = rawDb.prepare("SELECT * FROM event_daily_stats").all();
    expect(rows).toHaveLength(1);
    expect(rows[0].ticket_clicks).toBe(2);
  });

  test("an unparseable event_id (missing/zero/negative) is dropped, not written as a row", async () => {
    const { env, rawDb } = createTestEnv();

    const events = [
      { event: "event_view", props: {} },
      { event: "ticket_click", props: { event_id: 0 } },
      { event: "ticket_click", props: { event_id: -5 } },
      { event: "ticket_click", props: { event_id: "not-a-number" } },
    ];

    const res = await onRequestPost({ request: makeRequest(events), env });
    expect(res.status).toBe(200);

    const rows = rawDb.prepare("SELECT * FROM event_daily_stats").all();
    expect(rows).toHaveLength(0);
  });

  test("returns 200 and logs a warning when event_daily_stats batch fails", async () => {
    const { env, rawDb } = createTestEnv();
    // The event must exist: unknown ids are filtered out before any statement
    // is built, so a bogus id would produce an empty batch and never reach the
    // failure path this test is exercising.
    const event = insertEvent(rawDb, { name: "Warn Fest", slug: "warn-fest" });

    // A lone ticket_click event produces no artist_daily_stats or
    // page_views_daily statements, so this is the only batch() call made —
    // safe to stub unconditionally, mirroring the page_views_daily failure
    // test above.
    env.DB.batch = async () => {
      throw new Error("simulated event_daily_stats write failure");
    };

    const warnSpy = vi.spyOn(loggerModule.logger, "error");

    const events = [{ event: "ticket_click", props: { event_id: event.id } }];
    const res = await onRequestPost({ request: makeRequest(events), env });

    // Best-effort: must still return 200
    expect(res.status).toBe(200);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("event_daily_stats"),
      expect.objectContaining({ statementCount: expect.any(Number) }),
    );
  });
});

// ---------------------------------------------------------------------------
// Toronto-local date key, not UTC-sliced (#668, CLAUDE.md "Server-side
// 'today'/'now' is Toronto-local — never UTC-sliced"). The date key written
// into artist_daily_stats/page_views_daily used to come from
// `new Date().toISOString().split("T")[0]`, which flips to the next UTC day
// at 8 PM Eastern — evening traffic was silently misattributed to tomorrow's
// date. Regression for the metrics.js fix restoring eventLocalToday().
// ---------------------------------------------------------------------------
describe("POST /api/metrics — date key is Toronto-local, not UTC (#668)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("evening Toronto traffic is written under the Toronto date, not the UTC date", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Cool Fest", slug: "cool-fest" });
    const band = insertBand(rawDb, { name: "Cool Band", event_id: event.id });

    // 2026-08-02T23:30:00-04:00 is 11:30 PM EDT on Aug 2 in Toronto, but
    // 2026-08-03T03:30:00Z in UTC — the exact drift window the bug hit.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T23:30:00-04:00"));

    const events = [
      { event: "artist_profile_view", props: { band_profile_id: band.band_profile_id } },
      { event: "page_view", props: { page: "/bands/cool-band" } },
    ];

    const res = await onRequestPost({ request: makeRequest(events), env });
    expect(res.status).toBe(200);

    const statsRow = rawDb
      .prepare("SELECT date FROM artist_daily_stats WHERE band_profile_id = ?")
      .get(band.band_profile_id);
    expect(statsRow.date).toBe("2026-08-02");

    const pvRow = rawDb.prepare("SELECT date FROM page_views_daily WHERE page = ?").get("/bands/cool-band");
    expect(pvRow.date).toBe("2026-08-02");
  });

  test("event_view and ticket_click are written under the Toronto date, not the UTC date (#706)", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Long Weekend Band Crawl Vol. 17", slug: "lwbc17" });

    // Same pinned instant as above: 2026-08-02T23:30:00-04:00 is 11:30 PM EDT
    // on Aug 2 in Toronto, but 2026-08-03T03:30:00Z in UTC. Vol. 17 is an
    // evening event (doors 6:30 PM) — getting this wrong would misattribute
    // every post-8PM ticket_click/event_view to the wrong day.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T23:30:00-04:00"));

    const events = [
      { event: "event_view", props: { event_id: event.id } },
      { event: "ticket_click", props: { event_id: event.id } },
    ];

    const res = await onRequestPost({ request: makeRequest(events), env });
    expect(res.status).toBe(200);

    const row = rawDb.prepare("SELECT * FROM event_daily_stats WHERE event_id = ?").get(event.id);
    expect(row.date).toBe("2026-08-02");
    expect(row.event_views).toBe(1);
    expect(row.ticket_clicks).toBe(1);
  });

  test("an unknown event_id is dropped without taking the valid rows down with it", async () => {
    // event_id is client-supplied and only integer-validated. event_daily_stats
    // has an FK to events and D1's batch() is ATOMIC, so an unresolvable id
    // would fail the whole chunk and roll back the real metrics alongside it.
    //
    // Asserts the statement COUNT reaching batch(), not the resulting rows:
    // better-sqlite3 does not replicate D1's atomicity, so a row-level
    // assertion would pass with or without the guard and prove nothing.
    const { env, rawDb } = createTestEnv();
    const known = insertEvent(rawDb, { name: "Real Fest", slug: "real-fest" });

    const batched = [];
    const realBatch = env.DB.batch.bind(env.DB);
    env.DB.batch = async (stmts) => {
      batched.push(stmts.length);
      return realBatch(stmts);
    };

    const res = await onRequestPost({
      request: makeRequest([
        { event: "ticket_click", props: { event_id: known.id } },
        { event: "ticket_click", props: { event_id: 999999 } },
        { event: "event_view", props: { event_id: known.id } },
      ]),
      env,
    });
    expect(res.status).toBe(200);

    // One statement — the known event. The unknown id must never be built.
    expect(batched).toEqual([1]);

    const kept = rawDb.prepare("SELECT * FROM event_daily_stats WHERE event_id = ?").get(known.id);
    expect(kept.ticket_clicks).toBe(1);
    expect(kept.event_views).toBe(1);
  });
});

// Props flow into Analytics Engine blobs (16 KB per datapoint). The sanitizer
// bounds every prop, not only the error_code #1230 added.
describe("POST /api/metrics — prop values are bounded before Analytics Engine", () => {
  test("truncates a long string prop and drops a non-string, non-number one", async () => {
    const { env } = createTestEnv();
    const writeDataPoint = vi.fn();
    env.ANALYTICS = { writeDataPoint };

    const res = await onRequestPost({
      request: makeRequest([
        { event: "turnstile_error", props: { error_code: "x".repeat(20000) } },
        { event: "page_view", props: { page: { nested: "object" } } },
      ]),
      env,
    });
    expect(res.status).toBe(200);

    const blobs = writeDataPoint.mock.calls.map(([point]) => point.blobs);
    expect(blobs[0]).toContain("x".repeat(200));
    expect(blobs[0].every((b) => b.length <= 200)).toBe(true);
    expect(blobs[1]).not.toContain("[object Object]");
  });
});

// Show-night usage curve (#1246 Q1): event_view -> event_hourly_views, keyed by
// FESTIVAL date and Toronto hour, only inside the event's own [date, end_date].
// Oct 2026 is EDT (UTC-4), so instants are written with an explicit -04:00.
describe("POST /api/metrics — show-night curve (event_hourly_views, #1246 Q1)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const view = (eventId) => ({ event: "event_view", props: { event_id: eventId } });
  const post = (env, events) => onRequestPost({ request: makeRequest(events), env });
  const at = (iso) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  };
  const hourly = (rawDb) =>
    rawDb
      .prepare("SELECT event_id, festival_date, hour, views FROM event_hourly_views ORDER BY festival_date, hour")
      .all();

  test("a show-night view lands at its (festival_date, hour); two views in the hour sum", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { slug: "lwbc18", date: "2026-10-11" });
    at("2026-10-11T21:10:00-04:00");

    await post(env, [view(event.id), view(event.id)]);
    await post(env, [view(event.id)]);

    expect(hourly(rawDb)).toEqual([{ event_id: event.id, festival_date: "2026-10-11", hour: 21, views: 3 }]);
  });

  test("a 01:30 view after the show counts on the previous festival date at hour 1", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { slug: "lwbc18", date: "2026-10-11" });
    at("2026-10-12T01:30:00-04:00");

    await post(env, [view(event.id)]);

    expect(hourly(rawDb)).toEqual([{ event_id: event.id, festival_date: "2026-10-11", hour: 1, views: 1 }]);
  });

  test("views outside the window write no hourly row, but the daily stats are still written", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { slug: "lwbc18", date: "2026-10-11" });

    // Day before (evening), 03:00 on the morning of show day (festival date is
    // still the day before), and the day after (afternoon, past 06:00).
    for (const iso of ["2026-10-10T20:00:00-04:00", "2026-10-11T03:00:00-04:00", "2026-10-12T14:00:00-04:00"]) {
      at(iso);
      const res = await post(env, [view(event.id)]);
      expect(res.status).toBe(200);
    }

    expect(hourly(rawDb)).toEqual([]);
    const daily = rawDb.prepare("SELECT SUM(event_views) AS n FROM event_daily_stats WHERE event_id = ?").get(event.id);
    expect(daily.n).toBe(3);
  });

  test("multi-day: day 2 counts, the day after end_date does not", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { slug: "blr3", date: "2026-07-10", end_date: "2026-07-12" });

    at("2026-07-11T19:00:00-04:00");
    await post(env, [view(event.id)]);
    at("2026-07-13T19:00:00-04:00");
    await post(env, [view(event.id)]);

    expect(hourly(rawDb)).toEqual([{ event_id: event.id, festival_date: "2026-07-11", hour: 19, views: 1 }]);
  });

  test("ticket clicks do not count toward the curve", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { slug: "lwbc18", date: "2026-10-11" });
    at("2026-10-11T20:00:00-04:00");

    await post(env, [{ event: "ticket_click", props: { event_id: event.id } }]);

    expect(hourly(rawDb)).toEqual([]);
  });

  test("an unknown event_id writes nothing and does not throw", async () => {
    const { env, rawDb } = createTestEnv();
    at("2026-10-11T20:00:00-04:00");

    const res = await post(env, [view(9999)]);

    expect(res.status).toBe(200);
    expect(hourly(rawDb)).toEqual([]);
  });

  test("a broken hourly table still leaves event_daily_stats written and answers 200", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { slug: "lwbc18", date: "2026-10-11" });
    rawDb.exec("DROP TABLE event_hourly_views");
    at("2026-10-11T20:00:00-04:00");
    const warn = vi.spyOn(loggerModule.logger, "error").mockImplementation(() => {});

    const res = await post(env, [view(event.id)]);

    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("event_hourly_views"), expect.anything());
    const daily = rawDb.prepare("SELECT event_views FROM event_daily_stats WHERE event_id = ?").get(event.id);
    expect(daily.event_views).toBe(1);
  });
});
