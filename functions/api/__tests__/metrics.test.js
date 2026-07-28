// Tests for POST /api/metrics
// Covers: event_view/ticket_click no longer written to page_views_daily (#445 fix),
// page_view events still written as real path keys, and catch-logging (swallowed
// page_views_daily failure now emits logger.warn).
import { describe, expect, test, vi, afterEach } from "vitest";
import { onRequestPost } from "../metrics.js";
import * as loggerModule from "../../utils/logger.js";
import { createTestEnv, insertBand } from "../test-utils.js";

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

    const warnSpy = vi.spyOn(loggerModule.logger, "warn");

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
    const band = insertBand(rawDb, { name: "Cool Band" });

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
});
