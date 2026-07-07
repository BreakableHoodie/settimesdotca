import { describe, it, expect } from "vitest";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../test-utils";
import * as scheduleHandler from "../schedule.js";

describe("GET /api/schedule - reveal mode", () => {
  it("returns all bands when reveal_mode is off", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-reveal-off", status: "draft" });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(ev.id);
    const venue = insertVenue(rawDb, { name: "Venue A" });
    insertBand(rawDb, { name: "Announced Band", event_id: ev.id, venue_id: venue.id });
    const unannounced = insertBand(rawDb, { name: "Hidden Band", event_id: ev.id, venue_id: venue.id });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(unannounced.id);

    const req = new Request("https://example.test/api/schedule?event=vol6-reveal-off");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    // reveal_mode=0: all bands returned regardless of is_announced
    expect(data.bands.length).toBe(2);
    expect(data.event.reveal_mode).toBe(0);
  });

  it("filters unannounced bands when reveal_mode is on", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-reveal-on" });
    rawDb.prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?").run(ev.id);
    const venue = insertVenue(rawDb, { name: "Venue B" });
    const announced = insertBand(rawDb, { name: "Visible Band", event_id: ev.id, venue_id: venue.id });
    rawDb.prepare("UPDATE performances SET is_announced=1 WHERE id=?").run(announced.id);
    const hidden = insertBand(rawDb, { name: "Hidden Band", event_id: ev.id, venue_id: venue.id });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(hidden.id);

    const req = new Request("https://example.test/api/schedule?event=vol6-reveal-on");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bands.length).toBe(1);
    expect(data.bands[0].name).toBe("Visible Band");
    expect(data.event.reveal_mode).toBe(1);
  });

  it("includes reveal_mode in event metadata", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-meta" });
    rawDb.prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?").run(ev.id);

    const req = new Request("https://example.test/api/schedule?event=vol6-meta");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    const data = await res.json();
    expect(data.event.reveal_mode).toBe(1);
  });
});

describe("GET /api/schedule - ticket_url sanitization (#504)", () => {
  it("nulls out a legacy javascript: ticket_url value seeded directly via SQL", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-unsafe-ticket" });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(ev.id);
    rawDb
      .prepare("UPDATE events SET ticket_url = ? WHERE id = ?")
      // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #504 read-path guard
      .run("javascript:alert(1)", ev.id);

    const req = new Request("https://example.test/api/schedule?event=vol6-unsafe-ticket");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event.ticket_url).toBeNull();
  });

  it("passes a normal https:// ticket_url value through unchanged", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-safe-ticket" });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(ev.id);
    rawDb.prepare("UPDATE events SET ticket_url = ? WHERE id = ?").run("https://tickets.example.com/vol6", ev.id);

    const req = new Request("https://example.test/api/schedule?event=vol6-safe-ticket");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event.ticket_url).toBe("https://tickets.example.com/vol6");
  });
});

describe("GET /api/schedule - multi-day per-set date (#539)", () => {
  it("returns each performance's own performance_date, not the event's start date", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "Multi-Day Fest", slug: "multi-day-fest", date: "2026-08-01" });
    rawDb.prepare("UPDATE events SET is_published=1, end_date=? WHERE id=?").run("2026-08-02", ev.id);
    const venue = insertVenue(rawDb, { name: "Main Stage" });

    const day1Band = insertBand(rawDb, {
      name: "Day One Band",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run("2026-08-01", day1Band.id);

    const day2Band = insertBand(rawDb, {
      name: "Day Two Band",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run("2026-08-02", day2Band.id);

    const req = new Request("https://example.test/api/schedule?event=multi-day-fest");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();

    const day1 = data.bands.find((b) => b.name === "Day One Band");
    const day2 = data.bands.find((b) => b.name === "Day Two Band");
    expect(day1.date).toBe("2026-08-01");
    expect(day2.date).toBe("2026-08-02");
    // Event metadata still carries the start date — proving day 2's set date
    // comes from its own performance_date, not from the event-wide date.
    expect(data.event.date).toBe("2026-08-01");
  });

  it("a performance with NULL performance_date inherits event.date (single-day unchanged)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "Single Day Show", slug: "single-day-show", date: "2026-08-01" });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(ev.id);
    const venue = insertVenue(rawDb, { name: "Solo Venue" });
    insertBand(rawDb, { name: "Only Band", event_id: ev.id, venue_id: venue.id });
    // performance_date is left NULL (the column's default) here.

    const req = new Request("https://example.test/api/schedule?event=single-day-show");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bands[0].date).toBe("2026-08-01");
    expect(data.bands[0].date).toBe(data.event.date);
  });
});

describe("GET /api/schedule - current-event window (#539)", () => {
  it("keeps a multi-day event current when date is yesterday but end_date is today", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const todayStr = today.toISOString().split("T")[0];
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const ev = insertEvent(rawDb, { name: "Two Day Crawl", slug: "two-day-crawl", date: yesterdayStr });
    rawDb.prepare("UPDATE events SET is_published=1, end_date=? WHERE id=?").run(todayStr, ev.id);
    const venue = insertVenue(rawDb, { name: "Some Venue" });
    insertBand(rawDb, { name: "Some Band", event_id: ev.id, venue_id: venue.id });

    const req = new Request("https://example.test/api/schedule?event=current");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    // Before the COALESCE(end_date, date) fix this event would have already
    // vanished from "current" on day 2 (its `date` alone is yesterday).
    expect(data.event.slug).toBe("two-day-crawl");
  });

  it("still excludes a single-day event that ended in the past", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    // Use 2 days ago (not 1) so this stays unambiguously outside the existing
    // -6 hour grace window regardless of what time of day the suite runs.
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const twoDaysAgoStr = twoDaysAgo.toISOString().split("T")[0];

    const ev = insertEvent(rawDb, { name: "Old Single Day Show", slug: "old-single-day-show", date: twoDaysAgoStr });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(ev.id);

    const req = new Request("https://example.test/api/schedule?event=current");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    // No published event qualifies as current/upcoming — 404, same as before
    // the fix (single-day past-event exclusion is unchanged).
    expect(res.status).toBe(404);
  });
});
