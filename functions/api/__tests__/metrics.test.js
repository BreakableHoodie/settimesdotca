// Tests for POST /api/metrics
// Covers: break-removal (all event_view counts written even above MAX_BATCH_STATEMENTS)
// and catch-logging (swallowed page_views_daily failure now emits logger.warn).
import { describe, expect, test, vi, afterEach } from "vitest";
import { onRequestPost } from "../metrics.js";
import * as loggerModule from "../../utils/logger.js";
import { createTestEnv } from "../test-utils.js";

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

  test("writes ALL event_view counts when count exceeds MAX_BATCH_STATEMENTS (break removed)", async () => {
    const { env, rawDb } = createTestEnv();

    // Generate 25 unique event_view events — MAX_BATCH_STATEMENTS is 20, so without
    // the fix the last 5 would have been silently dropped.
    const events = Array.from({ length: 25 }, (_, i) => ({
      event: "event_view",
      props: { event_id: i + 1 },
    }));

    const res = await onRequestPost({ request: makeRequest(events), env });
    expect(res.status).toBe(200);

    const rows = rawDb.prepare("SELECT * FROM page_views_daily").all();
    expect(rows).toHaveLength(25);
    // Verify all 25 event IDs appear as keys
    const pages = new Set(rows.map((r) => r.page));
    for (let i = 1; i <= 25; i++) {
      expect(pages.has(`event:${i}`)).toBe(true);
    }
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
