import { describe, expect, it } from "vitest";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../test-utils";
import * as scheduleHandler from "../schedule.js";

describe("GET /api/schedule — is_cancelled", () => {
  it("returns is_cancelled=1 for a cancelled set and still includes the row", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "Vol17", slug: "vol17-cancel" });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(ev.id);
    const venue = insertVenue(rawDb, { name: "Blue Room" });
    const band = insertBand(rawDb, { name: "Deer Fang", event_id: ev.id, venue_id: venue.id });
    const performanceId = band.id;

    // Baseline: scheduled.
    const beforeReq = new Request("https://example.test/api/schedule?event=vol17-cancel");
    const beforeRes = await scheduleHandler.onRequestGet({ request: beforeReq, env });
    const beforeData = await beforeRes.json();
    const beforeBand = beforeData.bands.find((b) => b.performance_id === performanceId);
    // toHaveProperty proves the column is actually PROJECTED, not merely
    // defaulted: JSON.stringify drops an `undefined` value entirely, so if
    // `p.is_cancelled` were dropped from the SELECT this would fail on a
    // missing property instead of silently passing via a `?? 0` fallback.
    expect(beforeBand).toHaveProperty("is_cancelled", 0);

    rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(performanceId);

    const afterReq = new Request("https://example.test/api/schedule?event=vol17-cancel");
    const afterRes = await scheduleHandler.onRequestGet({ request: afterReq, env });
    const afterData = await afterRes.json();
    const afterBand = afterData.bands.find((b) => b.performance_id === performanceId);
    // The row is still present -- this endpoint never gates.
    expect(afterBand).toBeDefined();
    expect(afterBand).toHaveProperty("is_cancelled", 1);
  });
});
