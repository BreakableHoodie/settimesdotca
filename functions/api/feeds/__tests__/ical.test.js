import { describe, it, test, expect, beforeEach, afterEach, vi } from "vitest";
import { onRequestGet } from "../ical.js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../test-utils.js";
import { MockD1Database } from "../../subscriptions/__tests__/mocks/d1.js";

// Reuse helpers from events tests
import { createMockEvent, createMockVenue, createMockBand, seedMockData } from "../../events/__tests__/helpers.js";

describe("GET /api/feeds/ical", () => {
  let mockDB;
  let mockEnv;

  beforeEach(() => {
    mockDB = new MockD1Database();
    mockEnv = {
      DB: mockDB,
      PUBLIC_URL: "https://settimes.example.com",
      PUBLIC_DATA_PUBLISH_ENABLED: "true",
    };

    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should generate valid iCal format with events", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const event = createMockEvent({
      date: tomorrow.toISOString().split("T")[0],
    });
    const venue = createMockVenue();
    const band = createMockBand({ start_time: "20:00", end_time: "21:00" });

    seedMockData(mockDB, [event], [venue], [band]);

    const request = new Request("http://localhost/api/feeds/ical");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);
    const icalData = await response.text();

    expect(response.status).toBe(200);
    expect(icalData).toContain("BEGIN:VCALENDAR");
    expect(icalData).toContain("END:VCALENDAR");
    expect(icalData).toContain("BEGIN:VEVENT");
    expect(icalData).toContain("END:VEVENT");
  });

  it("should return text/calendar Content-Type header", async () => {
    const event = createMockEvent();
    const venue = createMockVenue();
    const band = createMockBand();

    seedMockData(mockDB, [event], [venue], [band]);

    const request = new Request("http://localhost/api/feeds/ical");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
  });

  it("should include iCal headers VERSION, PRODID, CALSCALE", async () => {
    const event = createMockEvent();
    const venue = createMockVenue();
    const band = createMockBand();

    seedMockData(mockDB, [event], [venue], [band]);

    const request = new Request("http://localhost/api/feeds/ical");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);
    const icalData = await response.text();

    expect(response.status).toBe(200);
    expect(icalData).toContain("VERSION:2.0");
    expect(icalData).toContain("PRODID:-//SetTimes//settimes.ca//EN");
    expect(icalData).toContain("CALSCALE:GREGORIAN");
  });

  it("should declare America/Toronto as the calendar timezone (Waterloo Region, not America/Los_Angeles)", async () => {
    const event = createMockEvent();
    const venue = createMockVenue();
    const band = createMockBand();

    seedMockData(mockDB, [event], [venue], [band]);

    const request = new Request("http://localhost/api/feeds/ical");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);
    const icalData = await response.text();

    expect(response.status).toBe(200);
    expect(icalData).toContain("X-WR-TIMEZONE:America/Toronto");
    expect(icalData).not.toContain("America/Los_Angeles");
  });

  it("should format each event with VEVENT block including DTSTART, DTEND, SUMMARY", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];

    const event = createMockEvent({ date: dateStr });
    const venue = createMockVenue({
      name: "Test Venue",
      address: "123 Main St",
    });
    const band = createMockBand({
      name: "Test Band",
      start_time: "20:00",
      end_time: "21:00",
    });

    seedMockData(mockDB, [event], [venue], [band]);

    const request = new Request("http://localhost/api/feeds/ical");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);
    const icalData = await response.text();

    expect(response.status).toBe(200);
    expect(icalData).toContain("BEGIN:VEVENT");
    expect(icalData).toContain("END:VEVENT");
    expect(icalData).toContain("SUMMARY:Test Band");
    // iCal format escapes commas in LOCATION
    expect(icalData).toContain("LOCATION:Test Venue\\");
    expect(icalData).toMatch(/DTSTART:\d{8}T\d{6}/);
    expect(icalData).toMatch(/DTEND:\d{8}T\d{6}/);
  });

  it("should generate valid empty calendar when no events", async () => {
    seedMockData(mockDB, [], [], []);

    const request = new Request("http://localhost/api/feeds/ical");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);
    const icalData = await response.text();

    expect(response.status).toBe(200);
    expect(icalData).toContain("BEGIN:VCALENDAR");
    expect(icalData).toContain("END:VCALENDAR");
    // Should not contain any VEVENT blocks
    expect(icalData.split("BEGIN:VEVENT").length).toBe(1);
  });

  it("should escape special characters in event data", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];

    const event = createMockEvent({ date: dateStr });
    const venue = createMockVenue({
      name: "Venue, Inc; Address",
      address: "123 Main St, Suite 100",
    });
    const band = createMockBand({
      name: "Band Name, Special; Characters\nDescription",
      start_time: "20:00",
      end_time: "21:00",
    });

    seedMockData(mockDB, [event], [venue], [band]);

    const request = new Request("http://localhost/api/feeds/ical");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);
    const icalData = await response.text();

    expect(response.status).toBe(200);
    // Should contain escaped characters
    expect(icalData).toContain("\\,"); // Escaped comma
    expect(icalData).toContain("\\;"); // Escaped semicolon
    expect(icalData).toContain("\\n"); // Escaped newline
  });

  it("should generate unique UIDs for multiple bands at the same event", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];

    // Create one event
    const event = createMockEvent({ id: 1, date: dateStr });
    const venue = createMockVenue({ id: 1 });

    // Create two bands performing at the same event
    const band1 = createMockBand({
      id: 101,
      performance_id: 1,
      event_id: 1,
      venue_id: 1,
      name: "Band One",
      start_time: "20:00",
      end_time: "21:00",
    });
    const band2 = createMockBand({
      id: 102,
      performance_id: 2,
      event_id: 1,
      venue_id: 1,
      name: "Band Two",
      start_time: "21:30",
      end_time: "22:30",
    });

    seedMockData(mockDB, [event], [venue], [band1, band2]);

    const request = new Request("http://localhost/api/feeds/ical");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);
    const icalData = await response.text();

    expect(response.status).toBe(200);

    // Both bands should appear in the calendar
    expect(icalData).toContain("SUMMARY:Band One");
    expect(icalData).toContain("SUMMARY:Band Two");

    // UIDs should be unique (using performance IDs) and use the settimes.ca domain
    expect(icalData).toContain(`UID:performance-1-${dateStr}@settimes.ca`);
    expect(icalData).toContain(`UID:performance-2-${dateStr}@settimes.ca`);

    // Count VEVENT blocks - should be 2
    const vevents = icalData.split("BEGIN:VEVENT").length - 1;
    expect(vevents).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Real-DB integration tests for the reveal_mode gate in the iCal feed.
// These exercise the actual SQL LEFT JOIN condition added to ical.js.
// ---------------------------------------------------------------------------
describe("GET /api/feeds/ical — reveal_mode gate (real-DB)", () => {
  // Use a far-future date so e.date >= date('now') always passes.
  const futureDate = "2099-01-01";

  test("unannounced performance in reveal_mode=1 event emits NO VEVENT", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const event = insertEvent(rawDb, {
      name: "Embargo Ical Event",
      slug: "ical-reveal-hidden",
      date: futureDate,
    });
    rawDb.prepare("UPDATE events SET status = 'published', reveal_mode=1 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Blue Room" });
    const perf = insertBand(rawDb, {
      name: "Hidden iCal Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(perf.id);

    const request = new Request("https://example.test/api/feeds/ical");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const icalData = await response.text();
    expect(icalData).not.toContain("Hidden iCal Band");
    expect(icalData.split("BEGIN:VEVENT").length - 1).toBe(0);
  });

  test("announced performance in reveal_mode=1 event emits a VEVENT", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const event = insertEvent(rawDb, {
      name: "Announced Ical Event",
      slug: "ical-reveal-shown",
      date: futureDate,
    });
    rawDb.prepare("UPDATE events SET status = 'published', reveal_mode=1 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Princess Cafe" });
    const perf = insertBand(rawDb, {
      name: "Revealed iCal Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=1 WHERE id=?").run(perf.id);

    const request = new Request("https://example.test/api/feeds/ical");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const icalData = await response.text();
    expect(icalData).toContain("Revealed iCal Band");
    expect(icalData.split("BEGIN:VEVENT").length - 1).toBe(1);
  });

  test("unannounced performance in reveal_mode=0 event emits a VEVENT (gate is no-op)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const event = insertEvent(rawDb, {
      name: "Normal Ical Event",
      slug: "ical-reveal-mode0",
      date: futureDate,
    });
    rawDb.prepare("UPDATE events SET status = 'published', reveal_mode=0 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Room 47" });
    const perf = insertBand(rawDb, {
      name: "Normal iCal Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(perf.id);

    const request = new Request("https://example.test/api/feeds/ical");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const icalData = await response.text();
    expect(icalData).toContain("Normal iCal Band");
    expect(icalData.split("BEGIN:VEVENT").length - 1).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Day-aware iCal export (#542 PR-2, real-DB).
// Before this fix, every VEVENT was stamped with e.date (the event's overall
// start date) regardless of which festival day a set fell on — a fan
// importing a multi-day festival got every set on day 1. These tests exercise
// the actual SQL (SELECT + ORDER BY) added to ical.js, not a hand-rolled mock.
// ---------------------------------------------------------------------------
describe("GET /api/feeds/ical — day-aware performance_date (real-DB)", () => {
  const day1 = "2099-03-01";
  const day2 = "2099-03-02";

  test("day-2 VEVENT's DTSTART, DTEND, and UID all carry day-2's date, not the event's start date", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const event = insertEvent(rawDb, {
      name: "Two Day Ical Event",
      slug: "ical-two-day",
      date: day1,
      end_date: day2,
    });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Roost" });

    const day2Perf = insertBand(rawDb, {
      name: "Day Two Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "14:00",
      end_time: "15:00",
    });
    // Explicit performance_date on the day-2 row (the multi-day convention
    // from migration 0051 — NULL rows inherit the event's single date).
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run(day2, day2Perf.id);

    const request = new Request("https://example.test/api/feeds/ical");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const icalData = await response.text();

    const day2Compact = day2.replace(/-/g, "");
    const day1Compact = day1.replace(/-/g, "");

    expect(icalData).toContain(`DTSTART:${day2Compact}T140000`);
    expect(icalData).toContain(`DTEND:${day2Compact}T150000`);
    expect(icalData).toContain(`UID:performance-${day2Perf.id}-${day2}@settimes.ca`);
    // Must not be stamped with the event's start date — that's the bug this fixes.
    expect(icalData).not.toContain(`DTSTART:${day1Compact}T140000`);
  });

  test("after-midnight set (01:00) keeps day-1's calendar date in DTSTART — no +1-day sort offset applied", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const event = insertEvent(rawDb, {
      name: "After Midnight Ical Event",
      slug: "ical-after-midnight",
      date: day1,
      end_date: day2,
    });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Prohibition Warehouse" });

    const lateNightPerf = insertBand(rawDb, {
      name: "After Midnight Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "01:00",
      end_time: "02:00",
    });
    // Migration 0051's stored-day convention: a 1 AM set on the night of day 1
    // stores day 1's calendar date (not day 2's) — the after-midnight set is
    // "understood" via the 01:00 clock time, not a shifted date.
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run(day1, lateNightPerf.id);

    const request = new Request("https://example.test/api/feeds/ical");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const icalData = await response.text();

    // Wall-clock date+time pair: day-1's calendar date with the 01:00 clock
    // time. iCal must NOT apply prepareBands' frontend-only +1-day sort
    // offset (that offset is for display ordering only, not wall-clock time).
    expect(icalData).toContain(`DTSTART:${day1.replace(/-/g, "")}T010000`);
    expect(icalData).not.toContain(`DTSTART:${day2.replace(/-/g, "")}T010000`);
  });

  test("VEVENTs are ordered by festival day then by time-of-day, not interleaved by raw clock time", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const event = insertEvent(rawDb, {
      name: "Ordering Ical Event",
      slug: "ical-ordering",
      date: day1,
      end_date: day2,
    });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Room 47" });

    // Day-1 early set (NULL performance_date — inherits the event's date).
    insertBand(rawDb, {
      name: "Day1 Early Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });

    // Day-1 late set (NULL performance_date — inherits the event's date).
    insertBand(rawDb, {
      name: "Day1 Late Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "22:00",
      end_time: "23:00",
    });

    // Day-2 morning set: an earlier clock time than either day-1 set, which
    // would sort FIRST under the old "ORDER BY e.date ASC, p.start_time ASC"
    // query (interleaving day 2 ahead of day 1's evening lineup — the bug).
    const morningDay2 = insertBand(rawDb, {
      name: "Day2 Morning Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "10:00",
      end_time: "11:00",
    });
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run(day2, morningDay2.id);

    const request = new Request("https://example.test/api/feeds/ical");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const icalData = await response.text();

    const idxEarly = icalData.indexOf("SUMMARY:Day1 Early Band");
    const idxLate = icalData.indexOf("SUMMARY:Day1 Late Band");
    const idxMorning = icalData.indexOf("SUMMARY:Day2 Morning Band");

    expect(idxEarly).toBeGreaterThan(-1);
    expect(idxLate).toBeGreaterThan(-1);
    expect(idxMorning).toBeGreaterThan(-1);

    // Exact VEVENT order: day 1's full lineup (by time-of-day), then day 2's —
    // never day 2 slotted ahead of day 1 by raw clock time.
    expect(idxEarly).toBeLessThan(idxLate);
    expect(idxLate).toBeLessThan(idxMorning);
  });
});

// ---------------------------------------------------------------------------
// #601 — a set that STRADDLES midnight (23:30–00:30) must stamp DTEND with the
// next calendar day; same-date stamps would put DTEND before DTSTART, an
// invalid VEVENT. Distinct from pure after-midnight sets (start 00:00–05:59),
// which correctly keep both stamps on the stored date (covered above).
// ---------------------------------------------------------------------------
describe("GET /api/feeds/ical — midnight-straddling DTEND rolls to the next day (#601)", () => {
  test("23:30–00:30 set: DTSTART on the stored date, DTEND on the following day", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const event = insertEvent(rawDb, {
      name: "Straddle Ical Event",
      slug: "ical-straddle",
      date: "2099-03-01",
    });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Room 47" });

    insertBand(rawDb, {
      name: "Straddle Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "23:30",
      end_time: "00:30",
    });

    const request = new Request("https://example.test/api/feeds/ical");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const icalData = await response.text();

    expect(icalData).toContain("DTSTART:20990301T233000");
    expect(icalData).toContain("DTEND:20990302T003000");
    expect(icalData).not.toContain("DTEND:20990301T003000");
  });

  test("month boundary: 23:00–00:15 on March 31 stamps DTEND April 1", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const event = insertEvent(rawDb, {
      name: "Month Boundary Ical Event",
      slug: "ical-month-boundary",
      date: "2099-03-31",
    });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Princess Cafe" });

    insertBand(rawDb, {
      name: "Boundary Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "23:00",
      end_time: "00:15",
    });

    const request = new Request("https://example.test/api/feeds/ical");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const icalData = await response.text();

    expect(icalData).toContain("DTSTART:20990331T230000");
    expect(icalData).toContain("DTEND:20990401T001500");
  });
});

describe("GET /api/feeds/ical — an unscheduled set is not a calendar entry (#1079)", () => {
  // The feed used to substitute "20:00" for a NULL start_time. Live on
  // 2026-09-02 that made every one of Vol 18's 15 announced sets a concrete
  // 8:00 PM VEVENT -- the entire content of the feed, fabricated, while the
  // event page correctly showed "Time To Be Announced".
  //
  // These seed the NULL case specifically. A fallback is invisible to every
  // happy-path test by construction, which is why the constant survived this
  // long in a file with four existing describe blocks.
  const seedEvent = (rawDb) => {
    const event = insertEvent(rawDb, {
      name: "Unscheduled Ical Event",
      slug: "ical-unscheduled",
      date: "2099-05-05",
    });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(event.id);
    return event;
  };

  test("a performance with no start_time produces no VEVENT at all", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = seedEvent(rawDb);
    const venue = insertVenue(rawDb, { name: "Blue Room" });

    insertBand(rawDb, {
      name: "Unscheduled Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: null,
      end_time: null,
    });

    const response = await onRequestGet({ request: new Request("https://example.test/api/feeds/ical"), env });
    expect(response.status).toBe(200);
    const icalData = await response.text();

    // The artist's name must not appear either: a VEVENT is the only thing
    // that carries it, so its presence would mean an entry was emitted.
    expect(icalData).not.toContain("Unscheduled Band");
    expect(icalData).not.toContain("BEGIN:VEVENT");
    expect(icalData).not.toContain("T200000");
    // Still a valid, parseable calendar -- empty, not broken.
    expect(icalData).toContain("BEGIN:VCALENDAR");
    expect(icalData).toContain("END:VCALENDAR");
  });

  test("a scheduled set on the same bill still appears when a sibling is unscheduled", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = seedEvent(rawDb);
    const venue = insertVenue(rawDb, { name: "Room 47" });

    insertBand(rawDb, {
      name: "Timed Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "21:00",
      end_time: "22:00",
    });
    insertBand(rawDb, {
      name: "Untimed Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: null,
      end_time: null,
    });

    const response = await onRequestGet({ request: new Request("https://example.test/api/feeds/ical"), env });
    const icalData = await response.text();

    expect(icalData).toContain("Timed Band");
    expect(icalData).toContain("DTSTART:20990505T210000");
    expect(icalData).not.toContain("Untimed Band");
    // Skipping one row must not skip the rest of the loop.
    expect((icalData.match(/BEGIN:VEVENT/g) || []).length).toBe(1);
  });

  test("a missing end_time is one hour after the start, not a constant 21:00", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = seedEvent(rawDb);
    const venue = insertVenue(rawDb, { name: "Princess Cafe" });

    // 23:00 is the shape that breaks a constant: "21:00" is BEFORE it, which
    // the midnight-straddle roll reads as spanning into the next day, turning
    // an absent end time into a 22-hour event.
    insertBand(rawDb, {
      name: "Open Ended Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "23:00",
      end_time: null,
    });

    const response = await onRequestGet({ request: new Request("https://example.test/api/feeds/ical"), env });
    const icalData = await response.text();

    expect(icalData).toContain("DTSTART:20990505T230000");
    expect(icalData).toContain("DTEND:20990506T000000");
    expect(icalData).not.toContain("DTEND:20990506T210000");
  });
});
