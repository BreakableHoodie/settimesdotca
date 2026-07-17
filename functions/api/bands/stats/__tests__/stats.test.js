import { describe, test, expect, afterEach, vi } from "vitest";
import { onRequestGet } from "../[name].js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../../test-utils.js";

describe("GET /api/bands/stats/:name — reveal_mode gate", () => {
  // Use a far-future date so performances land in the "upcoming" bucket
  // and event_status = 'published' satisfies the IN ('published', 'archived') guard.
  const futureDate = "2099-01-01";

  test("unannounced performance in reveal_mode=1 event is hidden from band stats", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Room 47" });
    const event = insertEvent(rawDb, {
      name: "Vol 17 Stats Hidden",
      slug: "stats-reveal-hidden",
      date: futureDate,
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?").run(event.id);
    const perf = insertBand(rawDb, {
      name: "Stats Hidden Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(perf.id);

    const request = new Request("https://example.test/api/bands/stats/Stats%20Hidden%20Band");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();
    // The embargoed performance must be absent from both upcoming and stats
    expect(payload.upcoming).toHaveLength(0);
    expect(payload.stats.total_performances).toBe(0);
  });

  test("announced performance in reveal_mode=1 event is shown in band stats", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Revive Karaoke" });
    const event = insertEvent(rawDb, {
      name: "Vol 17 Stats Shown",
      slug: "stats-reveal-shown",
      date: futureDate,
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?").run(event.id);
    const perf = insertBand(rawDb, {
      name: "Stats Revealed Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=1 WHERE id=?").run(perf.id);

    const request = new Request("https://example.test/api/bands/stats/Stats%20Revealed%20Band");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.upcoming).toHaveLength(1);
    expect(payload.upcoming[0].event_slug).toBe("stats-reveal-shown");
    expect(payload.stats.total_performances).toBe(1);
  });

  test("unannounced performance in reveal_mode=0 event is shown (gate is no-op)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Princess Cafe" });
    const event = insertEvent(rawDb, {
      name: "Normal Stats Event",
      slug: "stats-reveal-mode0",
      date: futureDate,
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1, reveal_mode=0 WHERE id=?").run(event.id);
    const perf = insertBand(rawDb, {
      name: "Stats Normal Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(perf.id);

    const request = new Request("https://example.test/api/bands/stats/Stats%20Normal%20Band");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();
    // reveal_mode=0: gate is a no-op, unannounced performances still visible
    expect(payload.upcoming).toHaveLength(1);
    expect(payload.stats.total_performances).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// #483 — social link URLs reflected from DB without read-path scheme
// validation. `social_links` is seeded via a direct SQL insert (through
// insertBand's `social_links` param) to simulate a legacy/bypassed row that
// predates the write-path guard, since the write path itself now rejects
// unsafe schemes.
// ---------------------------------------------------------------------------
describe("GET /api/bands/stats/:name - social_links scheme sanitization (#483)", () => {
  const futureDate = "2099-01-01";

  test("nulls a javascript: scheme website but preserves a plain instagram handle", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Room 47" });
    const event = insertEvent(rawDb, {
      name: "Vol 17 Stats Unsafe",
      slug: "stats-483-unsafe",
      date: futureDate,
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    insertBand(rawDb, {
      name: "Stats Scheme Band",
      event_id: event.id,
      venue_id: venue.id,
      // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #483 read-path guard
      social_links: JSON.stringify({ website: "javascript:alert(1)", instagram: "the_band" }),
    });

    const request = new Request("https://example.test/api/bands/stats/Stats%20Scheme%20Band");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.social.website).toBeNull();
    expect(payload.social.instagram).toBe("the_band");
  });

  test("passes a valid https website through unchanged", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Room 47" });
    const event = insertEvent(rawDb, {
      name: "Vol 17 Stats Safe",
      slug: "stats-483-safe",
      date: futureDate,
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    insertBand(rawDb, {
      name: "Stats Valid Site Band",
      event_id: event.id,
      venue_id: venue.id,
      social_links: JSON.stringify({ website: "https://example.com/band" }),
    });

    const request = new Request("https://example.test/api/bands/stats/Stats%20Valid%20Site%20Band");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.social.website).toBe("https://example.com/band");
  });
});

// ---------------------------------------------------------------------------
// #542 PR-1 — event_end_date exposed on performance rows. BandProfilePage
// keys schedule stale-detection on event_end_date || event_date; keying it
// on the start date alone wipes a fan's saved schedule on day 2 of a
// multi-day event. Single-day events (NULL end_date) must stay null-safe.
// ---------------------------------------------------------------------------
describe("GET /api/bands/stats/:name — event_end_date exposure (#542 PR-1)", () => {
  test("multi-day event performance carries event_end_date in upcoming", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Prohibition Warehouse" });
    const event = insertEvent(rawDb, {
      name: "Multi-Day Stats Event",
      slug: "stats-542-multiday",
      date: "2099-01-01",
      end_date: "2099-01-03",
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    insertBand(rawDb, {
      name: "Stats Multiday Band",
      event_id: event.id,
      venue_id: venue.id,
    });

    const request = new Request("https://example.test/api/bands/stats/Stats%20Multiday%20Band");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.upcoming).toHaveLength(1);
    expect(payload.upcoming[0].event_date).toBe("2099-01-01");
    expect(payload.upcoming[0].event_end_date).toBe("2099-01-03");
  });

  test("single-day event performance has event_end_date null (upcoming and past)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Blue Room" });
    const futureEvent = insertEvent(rawDb, {
      name: "Single-Day Future",
      slug: "stats-542-single-future",
      date: "2099-06-01",
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(futureEvent.id);
    insertBand(rawDb, {
      name: "Stats Singleday Band",
      event_id: futureEvent.id,
      venue_id: venue.id,
    });

    const pastEvent = insertEvent(rawDb, {
      name: "Single-Day Past",
      slug: "stats-542-single-past",
      date: "2001-01-01",
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(pastEvent.id);
    insertBand(rawDb, {
      name: "Stats Singleday Band",
      event_id: pastEvent.id,
      venue_id: venue.id,
    });

    const request = new Request("https://example.test/api/bands/stats/Stats%20Singleday%20Band");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.upcoming).toHaveLength(1);
    expect(payload.upcoming[0].event_end_date).toBeNull();
    expect(payload.past).toHaveLength(1);
    expect(payload.past[0].event_end_date).toBeNull();
  });

  test("past multi-day event performance carries event_end_date", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Princess Cafe" });
    const event = insertEvent(rawDb, {
      name: "Past Multi-Day Stats Event",
      slug: "stats-542-past-multiday",
      date: "2001-03-01",
      end_date: "2001-03-03",
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    insertBand(rawDb, {
      name: "Stats Past Multiday Band",
      event_id: event.id,
      venue_id: venue.id,
    });

    const request = new Request("https://example.test/api/bands/stats/Stats%20Past%20Multiday%20Band");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.past).toHaveLength(1);
    expect(payload.past[0].event_end_date).toBe("2001-03-03");
  });
});

// ---------------------------------------------------------------------------
// #603 — upcoming/past classification is per-performance, not per-event.
// On a multi-day event, a set's OWN day (performance_date, falling back to
// the event's start date for the #543 NULL convention) decides its bucket —
// so a band's day-1 set can already be "past" while its day-3 set is still
// "upcoming" mid-festival, instead of the whole band flipping to "past" the
// moment the event's start date has elapsed. Archived events still force
// every set to "past" regardless of date.
// ---------------------------------------------------------------------------
describe("GET /api/bands/stats/:name — per-performance classification (#603)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // 2026-07-11T12:00:00Z = 08:00 EDT → Toronto "today" is 2026-07-11,
  // day 2 of a 2026-07-10..2026-07-12 event (same idiom as timeline.test.js
  // "#542 PR-1" real-DB describe block).
  const pinDayTwoClock = () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T12:00:00Z"));
  };

  test("day-1 set is past and day-3 set is upcoming on day 2 of a multi-day event", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    pinDayTwoClock();

    const venue = insertVenue(rawDb, { name: "Prohibition Warehouse" });
    const event = insertEvent(rawDb, {
      name: "Multi-Day 603 Event",
      slug: "stats-603-multiday",
      date: "2026-07-10",
      end_date: "2026-07-12",
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    const day1Perf = insertBand(rawDb, {
      name: "Stats 603 Multiday Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run("2026-07-10", day1Perf.id);

    const day3Perf = insertBand(rawDb, {
      name: "Stats 603 Multiday Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run("2026-07-12", day3Perf.id);

    const request = new Request("https://example.test/api/bands/stats/Stats%20603%20Multiday%20Band");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.past).toHaveLength(1);
    expect(payload.past[0].id).toBe(day1Perf.id);
    expect(payload.upcoming).toHaveLength(1);
    expect(payload.upcoming[0].id).toBe(day3Perf.id);
  });

  test("NULL performance_date inherits the event start date and is past on day 2", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    pinDayTwoClock();

    const venue = insertVenue(rawDb, { name: "Room 47" });
    const event = insertEvent(rawDb, {
      name: "Multi-Day 603 Null Event",
      slug: "stats-603-null-perf-date",
      date: "2026-07-10",
      end_date: "2026-07-12",
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    // performance_date left NULL — the #543 convention for day-1 sets and
    // single-day events — so it must inherit event_date (2026-07-10), which
    // has already elapsed by the day-2 pinned clock.
    const perf = insertBand(rawDb, {
      name: "Stats 603 Null Perf Date Band",
      event_id: event.id,
      venue_id: venue.id,
    });

    const request = new Request("https://example.test/api/bands/stats/Stats%20603%20Null%20Perf%20Date%20Band");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.past).toHaveLength(1);
    expect(payload.past[0].id).toBe(perf.id);
    expect(payload.upcoming).toHaveLength(0);
  });

  test("archived event with a future-dated performance is still past", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    pinDayTwoClock();

    const venue = insertVenue(rawDb, { name: "Roost" });
    const event = insertEvent(rawDb, {
      name: "Archived 603 Event",
      slug: "stats-603-archived",
      date: "2099-01-01",
      status: "archived",
    });

    const perf = insertBand(rawDb, {
      name: "Stats 603 Archived Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run("2099-01-01", perf.id);

    const request = new Request("https://example.test/api/bands/stats/Stats%20603%20Archived%20Band");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.past).toHaveLength(1);
    expect(payload.past[0].id).toBe(perf.id);
    expect(payload.upcoming).toHaveLength(0);
  });
});
