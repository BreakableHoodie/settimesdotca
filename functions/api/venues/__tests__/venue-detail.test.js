import { afterEach, describe, test, expect, vi } from "vitest";
import { onRequestGet } from "../[id].js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../test-utils.js";

describe("GET /api/venues/:id — reveal_mode gate", () => {
  // Use a far-future date so performances land in the "upcoming" bucket.
  const futureDate = "2099-01-01";

  test("unannounced performance in reveal_mode=1 event is hidden from venue lineup", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Prohibition Warehouse" });
    const event = insertEvent(rawDb, {
      name: "Vol 17 Venue Hidden",
      slug: "venue-reveal-hidden",
      date: futureDate,
    });
    rawDb.prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?").run(event.id);
    const perf = insertBand(rawDb, {
      name: "Hidden Venue Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(perf.id);

    const response = await onRequestGet({
      env,
      params: { id: String(venue.id) },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.upcoming).toHaveLength(0);
    expect(payload.past).toHaveLength(0);
  });

  test("announced performance in reveal_mode=1 event is shown in venue lineup", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Blue Room" });
    const event = insertEvent(rawDb, {
      name: "Vol 17 Venue Shown",
      slug: "venue-reveal-shown",
      date: futureDate,
    });
    rawDb.prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?").run(event.id);
    const perf = insertBand(rawDb, {
      name: "Revealed Venue Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=1 WHERE id=?").run(perf.id);

    const response = await onRequestGet({
      env,
      params: { id: String(venue.id) },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.upcoming).toHaveLength(1);
    expect(payload.upcoming[0].band_name).toBe("Revealed Venue Band");
  });

  test("unannounced performance in reveal_mode=0 event is shown (gate is no-op)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Roost" });
    const event = insertEvent(rawDb, {
      name: "Normal Venue Event",
      slug: "venue-reveal-mode0",
      date: futureDate,
    });
    rawDb.prepare("UPDATE events SET is_published=1, reveal_mode=0 WHERE id=?").run(event.id);
    const perf = insertBand(rawDb, {
      name: "Normal Venue Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(perf.id);

    const response = await onRequestGet({
      env,
      params: { id: String(venue.id) },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.upcoming).toHaveLength(1);
    expect(payload.upcoming[0].band_name).toBe("Normal Venue Band");
  });
});

// #750 — the upcoming/past split bound to eventLocalToday() (the CALENDAR
// day), the same bug class fixed in #732 for bands/[name].js and
// bands/stats/[name].js. A single-day event with an after-midnight set is
// still "tonight" until AFTER_MIDNIGHT_THRESHOLD_HOUR (06:00) the next
// calendar day. Pinning the clock inside the 00:00-06:00 window is required —
// outside it eventLocalFestivalToday() and eventLocalToday() return identical
// values, and an unpinned test would pass against both the broken and fixed
// implementation.
describe("GET /api/venues/:id — end-edge gate (#750)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("a performance at a single-day event dated the PREVIOUS calendar day stays in 'upcoming' at 00:15 local (festival day, not calendar day)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    // 00:15 EDT on 2026-08-08 -> 2026-08-08T04:15Z (same instant used by the
    // eventDay.js unit suite and the #732 bands/[name].js regression test).
    // Calendar day is already 2026-08-08; festival day is still 2026-08-07
    // until the 06:00 threshold.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T04:15:00Z"));

    const venue = insertVenue(rawDb, { name: "The Mill" });
    const event = insertEvent(rawDb, {
      name: "Venue End-Edge Event",
      slug: "venue-endedge-single",
      date: "2026-08-07",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    const perf = insertBand(rawDb, {
      name: "Night Owl Set",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "01:00",
      end_time: "02:00",
    });
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run("2026-08-07", perf.id);

    const response = await onRequestGet({ env, params: { id: String(venue.id) } });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.upcoming).toHaveLength(1);
    expect(payload.upcoming[0].band_name).toBe("Night Owl Set");
    expect(payload.past).toHaveLength(0);
  });

  test("that same performance flips to 'past' once the 06:00 threshold passes", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    // 06:15 EDT on 2026-08-08 -> just past the after-midnight threshold.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T10:15:00Z"));

    const venue = insertVenue(rawDb, { name: "The Mill" });
    const event = insertEvent(rawDb, {
      name: "Venue End-Edge Cutover Event",
      slug: "venue-endedge-single-cutover",
      date: "2026-08-07",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    const perf = insertBand(rawDb, {
      name: "Cutover Band",
      event_id: event.id,
      venue_id: venue.id,
    });

    const response = await onRequestGet({ env, params: { id: String(venue.id) } });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.upcoming).toHaveLength(0);
    expect(payload.past).toHaveLength(1);
    expect(payload.past[0].performance_id).toBe(perf.id);
  });
});

// #741 — a venue hosting sets across every day of a multi-day event returned
// only `event_date`, so all of them reported day 1, and ordering on
// `start_time` alone put a late-afternoon day-3 set ahead of an evening day-1
// set. Verified against production: The Mill had 12 sets across 3 days, all
// reporting 2026-08-07.
describe("GET /api/venues/:id — multi-day ordering and per-set dates (#741)", () => {
  test("returns each set's own performance_date, ordered day 1 before day 3", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "The Mill" });
    const event = insertEvent(rawDb, {
      name: "Three Day Fest",
      slug: "three-day-fest",
      date: "2099-08-07",
      end_date: "2099-08-09",
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    // Deliberately inserted out of order, with the LATEST day carrying the
    // EARLIEST clock time -- the exact shape that made start_time-only
    // ordering wrong.
    const day3 = insertBand(rawDb, {
      name: "Day Three Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "16:10",
      end_time: "16:45",
    });
    // Day 1 is deliberately left with a NULL performance_date, matching
    // production (#543): only day 2+ carries an explicit date. Writing
    // "2099-08-07" here would bypass the COALESCE(p.performance_date, e.date)
    // fallback the ordering depends on, so the test would still pass with the
    // coalesce removed.
    insertBand(rawDb, {
      name: "Day One Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "20:45",
    });
    rawDb.prepare("UPDATE performances SET performance_date = ? WHERE id = ?").run("2099-08-09", day3.id);

    const response = await onRequestGet({
      request: new Request("https://x.test/api/venues/1"),
      env,
      params: { id: String(venue.id) },
    });
    expect(response.status).toBe(200);
    const payload = await response.json();

    // Assert on the DATES and the ORDER, not the count: a length check passes
    // against the broken version, which returned two rows too.
    expect(payload.upcoming.map((p) => p.performance_date)).toEqual([null, "2099-08-09"]);
    expect(payload.upcoming.map((p) => p.band_name)).toEqual(["Day One Band", "Day Three Band"]);
    // The client needs the span to decide whether a "(Day N)" suffix belongs.
    expect(payload.upcoming[0].event_end_date).toBe("2099-08-09");
  });
});
