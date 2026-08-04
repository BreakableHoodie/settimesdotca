import { describe, expect, it, vi, afterEach } from "vitest";
import { onRequestGet } from "../[name].js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../../test-utils.js";

// #732 — a cancelled set must stay VISIBLE on the artist page while its event
// is current (a fan checking "are they still playing?" on show night must
// never find the set silently gone), but must never inflate this endpoint's
// stats block, and must drop out of history once the event has passed —
// mirroring the identical rule already implemented at bands/[name].js:148-149.
//
// The load-bearing assertion throughout is the actual `is_cancelled` VALUE on
// the returned row, never array length alone: a broken implementation that
// still applies `AND p.is_cancelled = 0` in SQL passes every length-only
// assertion by omitting the row entirely (upcoming.length === 0 either way).
describe("GET /api/bands/stats/:name — cancelled set lifecycle (#732)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a cancelled CURRENT set visible in upcoming, flagged is_cancelled, and excluded from stats", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Room 47" });
    const event = insertEvent(rawDb, {
      name: "Cancelled Set Event",
      slug: "stats-732-current-cancelled",
      date: "2099-01-01",
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    const perf = insertBand(rawDb, {
      name: "Stats 732 Cancelled Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(perf.id);

    const request = new Request("https://example.test/api/bands/stats/Stats%20732%20Cancelled%20Band");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();

    // The load-bearing check: present AND flagged, not merely present.
    expect(payload.upcoming).toHaveLength(1);
    expect(payload.upcoming[0].is_cancelled).toBe(1);

    // Must not inflate the aggregate stats — this endpoint's one cancellation
    // job (design doc: "a cancelled set must not inflate play counts").
    expect(payload.stats.total_performances).toBe(0);
    expect(payload.stats.unique_venues).toBe(0);
    expect(payload.stats.unique_events).toBe(0);
    expect(payload.stats.debut_date).toBeNull();
    expect(payload.stats.average_set_minutes).toBeNull();
  });

  it("drops a cancelled set from BOTH upcoming and past once its event has passed", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Blue Room" });
    const event = insertEvent(rawDb, {
      name: "Past Cancelled Set Event",
      slug: "stats-732-past-cancelled",
      date: "2001-01-01",
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    const perf = insertBand(rawDb, {
      name: "Stats 732 Past Cancelled Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(perf.id);

    const request = new Request("https://example.test/api/bands/stats/Stats%20732%20Past%20Cancelled%20Band");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.upcoming).toHaveLength(0);
    expect(payload.past).toHaveLength(0);
  });

  it("keeps a NON-cancelled past set in history (proves the drop above gates on cancellation, not merely the date)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Blue Room" });
    const event = insertEvent(rawDb, {
      name: "Past Normal Set Event",
      slug: "stats-732-past-normal",
      date: "2001-01-01",
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    insertBand(rawDb, {
      name: "Stats 732 Past Normal Band",
      event_id: event.id,
      venue_id: venue.id,
    });

    const request = new Request("https://example.test/api/bands/stats/Stats%20732%20Past%20Normal%20Band");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.past).toHaveLength(1);
    expect(payload.past[0].is_cancelled).toBe(0);
  });

  it("a cancelled day-1 set of an ONGOING multi-day event stays visible in past, flagged, while the event itself is still current", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    vi.useFakeTimers();
    // 2026-07-11T12:00:00Z = 08:00 EDT -> Toronto "today" is 2026-07-11 (day 2
    // of a 2026-07-10..2026-07-12 event) — same idiom as the #603 suite in
    // stats.test.js.
    vi.setSystemTime(new Date("2026-07-11T12:00:00Z"));

    const venue = insertVenue(rawDb, { name: "Prohibition Warehouse" });
    const event = insertEvent(rawDb, {
      name: "Multiday 732 Event",
      slug: "stats-732-multiday",
      date: "2026-07-10",
      end_date: "2026-07-12",
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    const day1 = insertBand(rawDb, {
      name: "Stats 732 Multiday Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb
      .prepare("UPDATE performances SET performance_date = ?, is_cancelled = 1 WHERE id = ?")
      .run("2026-07-10", day1.id);

    const request = new Request("https://example.test/api/bands/stats/Stats%20732%20Multiday%20Band");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();
    // The EVENT (through 07-12) hasn't ended yet even though this SET's own
    // day already has -- it must stay visible in past, not vanish.
    expect(payload.past).toHaveLength(1);
    expect(payload.past[0].is_cancelled).toBe(1);
    expect(payload.upcoming).toHaveLength(0);
    expect(payload.stats.total_performances).toBe(0);
  });
});
