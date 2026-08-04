import { describe, expect, test } from "vitest";
import { onRequestGet } from "../[id]/details.js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../test-utils.js";

describe("GET /api/events/:id/details", () => {
  test("returns event details for a published event", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Test Event",
      slug: "test-event",
      date: "2026-01-01",
    });
    rawDb.prepare("UPDATE events SET is_published = 1 WHERE id = ?").run(event.id);

    const venue = insertVenue(rawDb, { name: "Test Venue", city: "Portland" });
    insertBand(rawDb, {
      name: "Test Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "19:00",
      end_time: "20:00",
    });

    const request = new Request(`https://example.test/api/events/${event.id}/details`);
    const response = await onRequestGet({
      request,
      env,
      params: { id: String(event.id) },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.event).toMatchObject({
      id: event.id,
      name: event.name,
      slug: event.slug,
    });
    expect(payload.bands).toHaveLength(1);
    expect(payload.venues).toHaveLength(1);
    expect(payload.band_count).toBe(1);
    expect(payload.venue_count).toBe(1);
    expect(payload.bands[0]).toMatchObject({
      name: "Test Band",
      venue_id: venue.id,
      venue_name: venue.name,
    });
  });

  test("returns 400 for invalid event id", async () => {
    const { env } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const request = new Request("https://example.test/api/events/abc/details");
    const response = await onRequestGet({
      request,
      env,
      params: { id: "abc" },
    });

    expect(response.status).toBe(400);
  });

  test("returns 404 when event is not published", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Draft Event",
      slug: "draft-event",
    });

    const request = new Request(`https://example.test/api/events/${event.id}/details`);
    const response = await onRequestGet({
      request,
      env,
      params: { id: String(event.id) },
    });

    expect(response.status).toBe(404);
  });
});

// #743 — performance_date missing from the details projection. A multi-day
// event's sets all reported the SAME event-level `date` and were sorted by
// `p.start_time` alone, so a Day 3 late-afternoon set sorted ahead of a Day 1
// evening set and the frontend (EventTimeline.jsx's "All Performers" grid)
// had no way to render which day a set belonged to.
describe("GET /api/events/:id/details - performance_date across a multi-day event (#743)", () => {
  test("emits performance_date on every band and orders by performance day before start_time", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Buddies Fest 2",
      slug: "details-multiday-743",
      date: "2026-08-07",
      end_date: "2026-08-09",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "The Mill" });

    // Day 3, EARLY time -- if sorted on start_time alone this sorts FIRST.
    const day3 = insertBand(rawDb, {
      name: "Day 3 Early Act",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "16:10",
      end_time: "16:45",
    });
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run("2026-08-09", day3.id);

    // Day 1, LATE time -- NULL performance_date (the #543 convention: day-1
    // sets store NULL, inheriting the event's own date).
    const day1 = insertBand(rawDb, {
      name: "Day 1 Late Act",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "20:45",
    });

    // Day 2, mid time.
    const day2 = insertBand(rawDb, {
      name: "Day 2 Mid Act",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "18:00",
      end_time: "18:45",
    });
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run("2026-08-08", day2.id);

    const request = new Request(`https://example.test/api/events/${event.id}/details`);
    const response = await onRequestGet({
      request,
      env,
      params: { id: String(event.id) },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.bands).toHaveLength(3);

    // Every band exposes its own performance_date (day 1 NULL -- the raw
    // stored value, not synthesized -- days 2/3 their explicit dates).
    const byName = Object.fromEntries(payload.bands.map((b) => [b.name, b]));
    expect(byName["Day 1 Late Act"].performance_date).toBeNull();
    expect(byName["Day 2 Mid Act"].performance_date).toBe("2026-08-08");
    expect(byName["Day 3 Early Act"].performance_date).toBe("2026-08-09");

    // Order: Day 1 (20:00) -> Day 2 (18:00) -> Day 3 (16:10). A start_time-only
    // sort would put Day 3's 16:10 FIRST -- assert on the actual order, not a
    // length, to catch that regression.
    expect(payload.bands.map((b) => b.name)).toEqual(["Day 1 Late Act", "Day 2 Mid Act", "Day 3 Early Act"]);
  });
});

// Regression: a band playing two sets at one event was counted twice in
// band_count (the details endpoint's expanded lineup flips the stat row from
// "32 Bands" collapsed to 34 after expanding). `bands` stays per-performance
// (the expanded grid legitimately shows each set with its own venue/time),
// but band_count/venue band_count must count DISTINCT bands, and each
// per-performance entry must carry `performance_id` so the frontend can key
// on it instead of the duplicated band id.
describe("GET /api/events/:id/details - duplicate performer counting (#605)", () => {
  test("a band with two performances: bands has 3 per-performance entries, band_count is distinct (2), venue band_count is distinct", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Two-Set Details Event",
      slug: "details-two-set-band",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    const venue = insertVenue(rawDb, { name: "Blue Room" });
    const firstSet = insertBand(rawDb, {
      name: "Two Set Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "19:00",
      end_time: "20:00",
    });
    const secondSet = insertBand(rawDb, {
      name: "Two Set Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "22:00",
      end_time: "23:00",
    });
    const soloSet = insertBand(rawDb, {
      name: "Solo Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:30",
      end_time: "21:30",
    });

    const request = new Request(`https://example.test/api/events/${event.id}/details`);
    const response = await onRequestGet({
      request,
      env,
      params: { id: String(event.id) },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();

    // Per-performance: 3 sets total, one entry each.
    expect(payload.bands).toHaveLength(3);
    const performanceIds = payload.bands.map((b) => b.performance_id).sort((a, b) => a - b);
    expect(performanceIds).toEqual([firstSet.id, secondSet.id, soloSet.id].sort((a, b) => a - b));

    // Distinct bands: "Two Set Band" + "Solo Band" = 2.
    expect(payload.band_count).toBe(2);

    // The single venue hosts 2 distinct bands (not 3 performances).
    expect(payload.venues).toHaveLength(1);
    expect(payload.venues[0].band_count).toBe(2);
    expect(payload.venues[0].bandIds).toBeUndefined();
  });
});

describe("GET /api/events/:id/details - reveal_mode gate", () => {
  test("hides unannounced band when reveal_mode=1", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Reveal Event",
      slug: "reveal-details-1",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Blue Room" });
    const announced = insertBand(rawDb, {
      name: "Visible Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=1 WHERE id=?").run(announced.id);
    const hidden = insertBand(rawDb, {
      name: "Hidden Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(hidden.id);

    const request = new Request(`https://example.test/api/events/${event.id}/details`);
    const response = await onRequestGet({
      request,
      env,
      params: { id: String(event.id) },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.bands).toHaveLength(1);
    expect(payload.bands[0].name).toBe("Visible Band");
  });

  test("shows announced band when reveal_mode=1", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Reveal Event",
      slug: "reveal-details-2",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Princess Cafe" });
    const announced = insertBand(rawDb, {
      name: "Announced Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=1 WHERE id=?").run(announced.id);

    const request = new Request(`https://example.test/api/events/${event.id}/details`);
    const response = await onRequestGet({
      request,
      env,
      params: { id: String(event.id) },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.bands).toHaveLength(1);
    expect(payload.bands[0].name).toBe("Announced Band");
  });

  test("shows unannounced band when reveal_mode=0", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Normal Event",
      slug: "reveal-details-0",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1, reveal_mode=0 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Room 47" });
    const unannounced = insertBand(rawDb, {
      name: "Unannounced But Visible",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(unannounced.id);

    const request = new Request(`https://example.test/api/events/${event.id}/details`);
    const response = await onRequestGet({
      request,
      env,
      params: { id: String(event.id) },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.bands).toHaveLength(1);
    expect(payload.bands[0].name).toBe("Unannounced But Visible");
  });
});

describe("GET /api/events/:id/details - is_cancelled (#732)", () => {
  test("flips is_cancelled to 1 and keeps the row -- this endpoint never gates", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Cancel Details Event",
      slug: "details-cancel-732",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Blue Room" });
    const band = insertBand(rawDb, {
      name: "Deer Fang",
      event_id: event.id,
      venue_id: venue.id,
    });

    const fetchDetails = () =>
      onRequestGet({
        request: new Request(`https://example.test/api/events/${event.id}/details`),
        env,
        params: { id: String(event.id) },
      });

    const before = await (await fetchDetails()).json();
    const beforeBand = before.bands.find((b) => b.performance_id === band.id);
    // toHaveProperty proves the column is actually PROJECTED -- a dropped
    // `p.is_cancelled` in the SELECT yields `undefined`, which JSON.stringify
    // strips entirely, so a missing-property check catches it where a `?? 0`
    // fallback would silently pass.
    expect(beforeBand).toHaveProperty("is_cancelled", 0);

    rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(band.id);

    const after = await (await fetchDetails()).json();
    const afterBand = after.bands.find((b) => b.performance_id === band.id);
    // This endpoint never gates -- the row must still be present.
    expect(afterBand).toBeDefined();
    expect(afterBand).toHaveProperty("is_cancelled", 1);
  });
});

describe("GET /api/events/:id/details - ticket_url sanitization (#504)", () => {
  test("nulls out a legacy javascript: ticket_url value seeded directly via SQL", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Unsafe Ticket Event",
      slug: "details-504-unsafe-ticket",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    rawDb
      .prepare("UPDATE events SET ticket_url = ? WHERE id = ?")
      // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #504 read-path guard
      .run("javascript:alert(1)", event.id);

    const request = new Request(`https://example.test/api/events/${event.id}/details`);
    const response = await onRequestGet({
      request,
      env,
      params: { id: String(event.id) },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.event.ticket_url).toBeNull();
  });

  test("passes a normal https ticket_url value through unchanged", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Safe Ticket Event",
      slug: "details-504-safe-ticket",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    rawDb.prepare("UPDATE events SET ticket_url = ? WHERE id = ?").run("https://tickets.example.com/crawl", event.id);

    const request = new Request(`https://example.test/api/events/${event.id}/details`);
    const response = await onRequestGet({
      request,
      env,
      params: { id: String(event.id) },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.event.ticket_url).toBe("https://tickets.example.com/crawl");
  });
});
