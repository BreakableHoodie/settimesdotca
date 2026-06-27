import { describe, it, test, expect, beforeEach, afterEach, vi } from "vitest";
import { onRequestGet } from "../ical.js";
import {
  createTestEnv,
  insertEvent,
  insertVenue,
  insertBand,
} from "../../test-utils.js";
import { MockD1Database } from "../../subscriptions/__tests__/mocks/d1.js";

// Reuse helpers from events tests
import {
  createMockEvent,
  createMockVenue,
  createMockBand,
  seedMockData,
} from "../../events/__tests__/helpers.js";

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
    expect(response.headers.get("Content-Type")).toBe(
      "text/calendar; charset=utf-8",
    );
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
    expect(icalData).toContain("PRODID:-//Concert Schedule//EN");
    expect(icalData).toContain("CALSCALE:GREGORIAN");
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

    // UIDs should be unique (using performance IDs)
    expect(icalData).toContain(
      `UID:performance-1-${dateStr}@concertschedule.app`,
    );
    expect(icalData).toContain(
      `UID:performance-2-${dateStr}@concertschedule.app`,
    );

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
    rawDb
      .prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?")
      .run(event.id);
    const venue = insertVenue(rawDb, { name: "Blue Room" });
    const perf = insertBand(rawDb, {
      name: "Hidden iCal Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb
      .prepare("UPDATE performances SET is_announced=0 WHERE id=?")
      .run(perf.id);

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
    rawDb
      .prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?")
      .run(event.id);
    const venue = insertVenue(rawDb, { name: "Princess Cafe" });
    const perf = insertBand(rawDb, {
      name: "Revealed iCal Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb
      .prepare("UPDATE performances SET is_announced=1 WHERE id=?")
      .run(perf.id);

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
    rawDb
      .prepare("UPDATE events SET is_published=1, reveal_mode=0 WHERE id=?")
      .run(event.id);
    const venue = insertVenue(rawDb, { name: "Room 47" });
    const perf = insertBand(rawDb, {
      name: "Normal iCal Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb
      .prepare("UPDATE performances SET is_announced=0 WHERE id=?")
      .run(perf.id);

    const request = new Request("https://example.test/api/feeds/ical");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const icalData = await response.text();
    expect(icalData).toContain("Normal iCal Band");
    expect(icalData.split("BEGIN:VEVENT").length - 1).toBe(1);
  });
});
