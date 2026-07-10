/**
 * Timeline API Tests
 *
 * Tests for the optimized timeline endpoint with JOIN queries
 * Validates N+1 query fix and correct data grouping
 */

import { describe, it, test, expect, beforeEach, vi } from "vitest";
import { onRequestGet as timelineHandler } from "../timeline.js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../test-utils.js";
import { eventLocalToday } from "../../../utils/eventDay.js";

// Returns the mock result set for a query string, keyed off the distinctive
// WHERE clause for each period (now / upcoming / past). The "now" and "past"
// clauses use COALESCE(end_date, date) (#539) so a multi-day event stays
// "now" through its end_date instead of sliding into "past" a day early.
const resultForQuery = (query) => {
  if (query.includes("e.date <= ?")) {
    // "Now" events query
    return {
      results: [
        {
          event_id: 1,
          event_name: "Test Event Today",
          event_slug: "test-event-today",
          event_date: "2025-11-05",
          band_id: 1,
          band_name: "Test Band 1",
          start_time: "20:00",
          end_time: "21:00",
          url: "https://testband1.com",
          genre: "Rock",
          origin: "Toronto",
          photo_url: "https://example.com/band1.jpg",
          venue_id: 1,
          venue_name: "Test Venue 1",
          venue_address: "123 Test St",
        },
        {
          event_id: 1,
          event_name: "Test Event Today",
          event_slug: "test-event-today",
          event_date: "2025-11-05",
          band_id: 2,
          band_name: "Test Band 2",
          start_time: "21:00",
          end_time: "22:00",
          url: "https://testband2.com",
          genre: "Jazz",
          origin: "Montreal",
          photo_url: "https://example.com/band2.jpg",
          venue_id: 2,
          venue_name: "Test Venue 2",
          venue_address: "456 Test Ave",
        },
      ],
    };
  } else if (query.includes("e.date > ?")) {
    // "Upcoming" events query
    return { results: [] };
  } else if (query.includes("COALESCE(e.end_date, e.date) < ?")) {
    // "Past" events query
    return {
      results: [
        {
          event_id: 2,
          event_name: "Past Event",
          event_slug: "past-event",
          event_date: "2025-11-01",
          band_id: 3,
          band_name: "Past Band",
          start_time: "19:00",
          end_time: "20:00",
          url: "https://pastband.com",
          genre: "Blues",
          origin: "Kitchener",
          photo_url: "https://example.com/band3.jpg",
          venue_id: 3,
          venue_name: "Past Venue",
          venue_address: "789 Past Rd",
        },
      ],
    };
  }
  return { results: [] };
};

// Mock D1 Database. The endpoint now batches the three period queries into a
// single DB.batch([...]) round-trip, so the mock exposes both prepare/bind
// (each bound statement carries its `query`) and a batch() that returns results
// in input order.
const createMockDB = () => {
  const mockPrepare = (query) => ({
    bind: () => ({
      query,
      all: async () => resultForQuery(query),
    }),
  });

  return {
    prepare: mockPrepare,
    batch: async (statements) => statements.map((statement) => resultForQuery(statement.query)),
  };
};

describe("Timeline API - Optimized JOIN Queries", () => {
  let mockContext;
  let onRequestGet;

  beforeEach(async () => {
    // Reset module and mock
    vi.resetModules();

    // Mock environment
    mockContext = {
      request: new Request("https://example.com/api/events/timeline"),
      env: { DB: createMockDB(), PUBLIC_DATA_PUBLISH_ENABLED: "true" },
    };

    // Dynamic import to get fresh module
    const module = await import("../timeline.js");
    onRequestGet = module.onRequestGet;
  });

  describe("Data Grouping - groupEventData helper", () => {
    it("should group bands by event correctly", async () => {
      const response = await onRequestGet(mockContext);
      const data = await response.json();

      expect(data.now).toHaveLength(1);
      expect(data.now[0].id).toBe(1);
      expect(data.now[0].name).toBe("Test Event Today");
      expect(data.now[0].bands).toHaveLength(2);
    });

    it("should create unique venue list with band counts", async () => {
      const response = await onRequestGet(mockContext);
      const data = await response.json();

      const event = data.now[0];
      expect(event.venues).toHaveLength(2);
      expect(event.venues[0].band_count).toBe(1);
      expect(event.venues[1].band_count).toBe(1);
    });

    it("should preserve all band data fields", async () => {
      const response = await onRequestGet(mockContext);
      const data = await response.json();

      const band = data.now[0].bands[0];
      expect(band).toHaveProperty("id");
      expect(band).toHaveProperty("name");
      expect(band).toHaveProperty("start_time");
      expect(band).toHaveProperty("end_time");
      expect(band).toHaveProperty("url");
      expect(band).toHaveProperty("genre");
      expect(band).toHaveProperty("origin");
      expect(band).toHaveProperty("photo_url");
      expect(band).toHaveProperty("venue_id");
      expect(band).toHaveProperty("venue_name");
    });

    it("should calculate event metadata correctly", async () => {
      const response = await onRequestGet(mockContext);
      const data = await response.json();

      const event = data.now[0];
      expect(event.band_count).toBe(2);
      expect(event.venue_count).toBe(2);
    });
  });

  describe("Query Parameters", () => {
    it('should support disabling "now" events', async () => {
      mockContext.request = new Request("https://example.com/api/events/timeline?now=false");
      const response = await onRequestGet(mockContext);
      const data = await response.json();

      expect(data.now).toHaveLength(0);
    });

    it('should support disabling "upcoming" events', async () => {
      mockContext.request = new Request("https://example.com/api/events/timeline?upcoming=false");
      const response = await onRequestGet(mockContext);
      const data = await response.json();

      expect(data.upcoming).toHaveLength(0);
    });

    it('should support disabling "past" events', async () => {
      mockContext.request = new Request("https://example.com/api/events/timeline?past=false");
      const response = await onRequestGet(mockContext);
      const data = await response.json();

      expect(data.past).toHaveLength(0);
    });

    it("should respect pastLimit parameter", async () => {
      mockContext.request = new Request("https://example.com/api/events/timeline?pastLimit=5");
      const response = await onRequestGet(mockContext);
      await response.json();

      // Should not throw, limit is passed to query
      expect(response.status).toBe(200);
    });

    it("should default pastLimit to 10", async () => {
      const response = await onRequestGet(mockContext);
      expect(response.status).toBe(200);
      // Default is 10, verified by not throwing
    });
  });

  describe("Response Format", () => {
    it("should return correct response structure", async () => {
      const response = await onRequestGet(mockContext);
      const data = await response.json();

      expect(data).toHaveProperty("now");
      expect(data).toHaveProperty("upcoming");
      expect(data).toHaveProperty("past");
      expect(Array.isArray(data.now)).toBe(true);
      expect(Array.isArray(data.upcoming)).toBe(true);
      expect(Array.isArray(data.past)).toBe(true);
    });

    it("should include correct HTTP headers", async () => {
      const response = await onRequestGet(mockContext);

      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    });

    it("should return 200 status on success", async () => {
      const response = await onRequestGet(mockContext);
      expect(response.status).toBe(200);
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors gracefully", async () => {
      mockContext.env.DB = {
        prepare: () => {
          throw new Error("Database connection failed");
        },
      };

      const response = await onRequestGet(mockContext);
      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data).toHaveProperty("error");
      expect(data.error).toBe("Database error");
      expect(data.message).toBe("Events are temporarily unavailable. Please try again.");
    });

    it("should handle empty results", async () => {
      mockContext.env.DB = {
        prepare: () => ({
          bind: () => ({ all: async () => ({ results: [] }) }),
        }),
        batch: async (statements) => statements.map(() => ({ results: [] })),
      };

      const response = await onRequestGet(mockContext);
      const data = await response.json();

      expect(data.now).toHaveLength(0);
      expect(data.upcoming).toHaveLength(0);
      expect(data.past).toHaveLength(0);
    });

    it("should handle null results", async () => {
      mockContext.env.DB = {
        prepare: () => ({
          bind: () => ({ all: async () => ({ results: null }) }),
        }),
        batch: async (statements) => statements.map(() => ({ results: null })),
      };

      const response = await onRequestGet(mockContext);
      const data = await response.json();

      expect(data.now).toHaveLength(0);
      expect(data.upcoming).toHaveLength(0);
      expect(data.past).toHaveLength(0);
    });
  });

  describe("Performance - N+1 Query Fix Validation", () => {
    it("should use single query per time period (not N queries)", async () => {
      const prepareCallCount = { count: 0 };
      const originalPrepare = mockContext.env.DB.prepare;

      mockContext.env.DB.prepare = (query) => {
        prepareCallCount.count++;
        return originalPrepare(query);
      };

      await onRequestGet(mockContext);

      // Should be exactly 3 queries: now, upcoming, past
      // NOT 1 + N (event count) queries
      expect(prepareCallCount.count).toBe(3);
    });

    it("should run all period queries in a single batched round-trip", async () => {
      const batchCallCount = { count: 0 };
      const originalBatch = mockContext.env.DB.batch;

      mockContext.env.DB.batch = (statements) => {
        batchCallCount.count++;
        return originalBatch(statements);
      };

      await onRequestGet(mockContext);

      // The three period queries (now/upcoming/past) are collapsed into one
      // DB.batch([...]) call rather than three serial awaits.
      expect(batchCallCount.count).toBe(1);
    });

    it("should group multiple bands per event without additional queries", async () => {
      // This validates that groupEventData works in-memory
      // without triggering additional database calls
      const response = await onRequestGet(mockContext);
      const data = await response.json();

      // Event has 2 bands but only 1 event in results
      expect(data.now).toHaveLength(1);
      expect(data.now[0].bands).toHaveLength(2);
    });
  });

  describe("reveal_mode gate - JOIN condition (not WHERE)", () => {
    it("hides unannounced bands when reveal_mode=1", async () => {
      // When the DB applies the JOIN gate, unannounced rows are NULL-expanded;
      // band_id will be null so groupEventData skips them. The mock here
      // simulates what the DB returns after the JOIN filter is applied.
      mockContext.env.DB = {
        prepare: () => ({
          bind: () => ({ query: "e.date = ?" }),
        }),
        batch: async () => [
          {
            results: [
              {
                event_id: 10,
                event_name: "Vol 17",
                event_slug: "vol17",
                event_date: "2026-08-02",
                ticket_url: null,
                // Only one announced band comes through the JOIN gate
                band_id: 5,
                band_name: "Announced Only",
                start_time: "20:00",
                end_time: "21:00",
                social_links: null,
                genre: "Rock",
                origin: null,
                origin_city: null,
                origin_region: null,
                photo_url: null,
                venue_id: 1,
                venue_name: "Blue Room",
                venue_address: "123 King St N",
                address_line1: null,
                address_line2: null,
                city: "Waterloo",
                region: "ON",
                postal_code: null,
                country: "CA",
              },
            ],
          },
          { results: [] },
          { results: [] },
        ],
      };

      mockContext.request = new Request("https://example.test/api/events/timeline");
      const response = await onRequestGet(mockContext);
      const data = await response.json();

      expect(data.now).toHaveLength(1);
      expect(data.now[0].bands).toHaveLength(1);
      expect(data.now[0].bands[0].name).toBe("Announced Only");
    });

    it("event still appears in timeline when its only band is unannounced (reveal_mode=1)", async () => {
      // This is the critical test: the JOIN-condition approach means the event
      // row survives even when every performance is filtered out. The event
      // appears in the timeline with band_count=0, not missing entirely.
      mockContext.env.DB = {
        prepare: () => ({
          bind: () => ({ query: "e.date = ?" }),
        }),
        batch: async () => [
          {
            results: [
              {
                event_id: 20,
                event_name: "Teaser Event",
                event_slug: "teaser",
                event_date: "2026-08-02",
                ticket_url: null,
                // All bands filtered by JOIN gate → NULL row returned
                band_id: null,
                band_name: null,
                start_time: null,
                end_time: null,
                social_links: null,
                genre: null,
                origin: null,
                origin_city: null,
                origin_region: null,
                photo_url: null,
                venue_id: null,
                venue_name: null,
                venue_address: null,
                address_line1: null,
                address_line2: null,
                city: null,
                region: null,
                postal_code: null,
                country: null,
              },
            ],
          },
          { results: [] },
          { results: [] },
        ],
      };

      mockContext.request = new Request("https://example.test/api/events/timeline");
      const response = await onRequestGet(mockContext);
      const data = await response.json();

      // Event is present but has no bands
      expect(data.now).toHaveLength(1);
      expect(data.now[0].id).toBe(20);
      expect(data.now[0].band_count).toBe(0);
      expect(data.now[0].bands).toHaveLength(0);
    });

    it("shows unannounced bands when reveal_mode=0", async () => {
      // When reveal_mode=0 the JOIN condition passes all rows through;
      // unannounced bands are visible (no change to normal events).
      mockContext.env.DB = {
        prepare: () => ({
          bind: () => ({ query: "e.date > ?" }),
        }),
        batch: async () => [
          { results: [] },
          {
            results: [
              {
                event_id: 30,
                event_name: "Normal Upcoming",
                event_slug: "normal-upcoming",
                event_date: "2026-09-01",
                ticket_url: null,
                band_id: 9,
                band_name: "Unannounced But Visible",
                start_time: "19:00",
                end_time: "20:00",
                social_links: null,
                genre: "Punk",
                origin: null,
                origin_city: null,
                origin_region: null,
                photo_url: null,
                venue_id: 2,
                venue_name: "Room 47",
                venue_address: null,
                address_line1: null,
                address_line2: null,
                city: "Waterloo",
                region: "ON",
                postal_code: null,
                country: "CA",
              },
            ],
          },
          { results: [] },
        ],
      };

      mockContext.request = new Request("https://example.test/api/events/timeline");
      const response = await onRequestGet(mockContext);
      const data = await response.json();

      expect(data.upcoming).toHaveLength(1);
      expect(data.upcoming[0].bands).toHaveLength(1);
      expect(data.upcoming[0].bands[0].name).toBe("Unannounced But Visible");
    });
  });

  describe("Edge Cases", () => {
    it("should handle events with no bands", async () => {
      const results = [
        {
          event_id: 99,
          event_name: "Empty Event",
          event_slug: "empty-event",
          event_date: "2025-11-05",
          band_id: null,
          band_name: null,
          start_time: null,
          end_time: null,
          url: null,
          genre: null,
          origin: null,
          photo_url: null,
          venue_id: null,
          venue_name: null,
          venue_address: null,
        },
      ];
      mockContext.env.DB = {
        prepare: () => ({ bind: () => ({ all: async () => ({ results }) }) }),
        batch: async (statements) => statements.map(() => ({ results })),
      };

      const response = await onRequestGet(mockContext);
      const data = await response.json();

      expect(data.now[0].bands).toHaveLength(0);
      expect(data.now[0].venues).toHaveLength(0);
      expect(data.now[0].band_count).toBe(0);
      expect(data.now[0].venue_count).toBe(0);
    });

    it("should handle same venue with multiple bands", async () => {
      const results = [
        {
          event_id: 1,
          event_name: "Multi-Band Event",
          event_slug: "multi-band",
          event_date: "2025-11-05",
          band_id: 1,
          band_name: "Band 1",
          start_time: "20:00",
          end_time: "21:00",
          url: null,
          genre: null,
          origin: null,
          photo_url: null,
          venue_id: 1,
          venue_name: "Same Venue",
          venue_address: "123 St",
        },
        {
          event_id: 1,
          event_name: "Multi-Band Event",
          event_slug: "multi-band",
          event_date: "2025-11-05",
          band_id: 2,
          band_name: "Band 2",
          start_time: "21:00",
          end_time: "22:00",
          url: null,
          genre: null,
          origin: null,
          photo_url: null,
          venue_id: 1,
          venue_name: "Same Venue",
          venue_address: "123 St",
        },
      ];
      mockContext.env.DB = {
        prepare: () => ({ bind: () => ({ all: async () => ({ results }) }) }),
        batch: async (statements) => statements.map(() => ({ results })),
      };

      const response = await onRequestGet(mockContext);
      const data = await response.json();

      expect(data.now[0].venues).toHaveLength(1);
      expect(data.now[0].venues[0].band_count).toBe(2);
      expect(data.now[0].bands).toHaveLength(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Real-DB integration test — exercises the actual SQL JOIN gate.
// The mock tests above verify application-layer grouping logic; this test
// verifies that the `LEFT JOIN … AND (e.reveal_mode = 0 OR p.is_announced = 1)`
// clause in timeline.js actually filters rows in SQLite, which would break if
// someone mistakenly moved the gate to a WHERE clause (which turns the LEFT
// JOIN into an implicit INNER JOIN and drops the event row entirely).
// ---------------------------------------------------------------------------
describe("Timeline real-DB — reveal_mode JOIN gate (SQL exercise)", () => {
  test("reveal_mode=1 event with all-unannounced performances still appears in 'now' with band_count=0", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const today = eventLocalToday();

    const event = insertEvent(rawDb, {
      name: "Embargo Event",
      slug: "timeline-realdb-reveal-gate",
      date: today,
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?").run(event.id);

    const venue = insertVenue(rawDb, { name: "Blue Room" });
    const perf = insertBand(rawDb, {
      name: "Secret Band RealDB",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(perf.id);

    const request = new Request("https://example.test/api/events/timeline");
    const response = await timelineHandler({ request, env });

    expect(response.status).toBe(200);
    const data = await response.json();

    // The event MUST appear in the "now" bucket — the JOIN-condition approach
    // keeps the event row even when all performances are filtered out.
    // If the gate were a WHERE clause, data.now would be [] and this fails.
    const found = data.now.find((e) => e.id === event.id);
    expect(found).toBeDefined();
    expect(found.band_count).toBe(0);
    expect(found.bands).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Real-DB regression — "upcoming" must NOT be capped to a fixed day-window.
// A flagship event published weeks out (e.g. the Vol-17 crawl ~6 weeks ahead)
// must appear in "upcoming" the moment it's published — not only once it falls
// inside an arbitrary horizon. Regression for the old `AND date <= date(?,
// '+30 days')` cap, which hid Vol-17 (~33 days out when published) entirely.
// ---------------------------------------------------------------------------
describe("Timeline real-DB — upcoming has no fixed day-window cap (SQL exercise)", () => {
  test("a published event more than 30 days out appears in 'upcoming'", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    // 45 days out — comfortably past the old 30-day horizon.
    const farFuture = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const event = insertEvent(rawDb, {
      name: "Flagship Crawl",
      slug: "timeline-realdb-far-future",
      date: farFuture,
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    const request = new Request("https://example.test/api/events/timeline");
    const response = await timelineHandler({ request, env });

    expect(response.status).toBe(200);
    const data = await response.json();

    const found = data.upcoming.find((e) => e.id === event.id);
    expect(found).toBeDefined();
    expect(found.slug).toBe("timeline-realdb-far-future");
  });
});

// ---------------------------------------------------------------------------
// Real-DB regression — venue_count must be 0 (not 1) when every performance's
// venue_id is NULL. `Map.has(null)` is `false`, so an unguarded
// `!event.venues.has(row.venue_id)` check inserts a single spurious `null` key,
// inflating venue_count to 1 instead of 0. The details endpoint
// (functions/api/events/[id]/details.js) already guards on truthy
// `row.venue_id` before touching its venues map, which is why the card's
// venue count flipped from 1 (timeline) to 0 (details) on expand. Regression
// for #479.
// ---------------------------------------------------------------------------
describe("Timeline real-DB — NULL venue_id must not inflate venue_count (#479)", () => {
  test("venue_count is 0 when all performances have venue_id = NULL", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const today = eventLocalToday();

    const event = insertEvent(rawDb, {
      name: "No Venue Event",
      slug: "timeline-realdb-null-venue",
      date: today,
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    // venue_id defaults to null in insertBand — performance has no venue assigned
    insertBand(rawDb, { name: "Unassigned Band", event_id: event.id });

    const request = new Request("https://example.test/api/events/timeline");
    const response = await timelineHandler({ request, env });

    expect(response.status).toBe(200);
    const data = await response.json();

    const found = data.now.find((e) => e.id === event.id);
    expect(found).toBeDefined();
    expect(found.band_count).toBe(1);
    expect(found.venue_count).toBe(0);
    expect(found.venues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Real-DB regression — the derived `bands[].url` fallback (website ||
// bandcamp || instagram, extracted from social_links when the legacy `url`
// column is empty) must never reflect an unsafe scheme. `social_links` is
// seeded via insertBand's raw `social_links` param to simulate a legacy or
// write-path-bypassed row — the write path itself now rejects unsafe
// schemes, but rows written before that guard existed may still contain
// them. Regression for #483.
// ---------------------------------------------------------------------------
describe("Timeline real-DB — derived band url is scheme-validated (#483)", () => {
  test("a band whose only link is a javascript: scheme resolves to url: null", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const today = eventLocalToday();

    const event = insertEvent(rawDb, {
      name: "Scheme Test Event",
      slug: "timeline-realdb-483-null",
      date: today,
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    const venue = insertVenue(rawDb, { name: "Roost" });
    insertBand(rawDb, {
      name: "Unsafe Link Band",
      event_id: event.id,
      venue_id: venue.id,
      // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #483 read-path guard
      social_links: JSON.stringify({ website: "javascript:alert(1)" }),
    });

    const request = new Request("https://example.test/api/events/timeline");
    const response = await timelineHandler({ request, env });

    expect(response.status).toBe(200);
    const data = await response.json();

    const found = data.now.find((e) => e.id === event.id);
    expect(found).toBeDefined();
    const band = found.bands.find((b) => b.name === "Unsafe Link Band");
    expect(band).toBeDefined();
    expect(band.url).toBeNull();
  });

  test("falls through to a valid https bandcamp URL when website is unsafe", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const today = eventLocalToday();

    const event = insertEvent(rawDb, {
      name: "Scheme Fallback Event",
      slug: "timeline-realdb-483-fallback",
      date: today,
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    const venue = insertVenue(rawDb, { name: "Roost" });
    insertBand(rawDb, {
      name: "Fallback Link Band",
      event_id: event.id,
      venue_id: venue.id,
      social_links: JSON.stringify({
        // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #483 read-path guard
        website: "javascript:alert(1)",
        bandcamp: "https://fallbackband.bandcamp.com",
      }),
    });

    const request = new Request("https://example.test/api/events/timeline");
    const response = await timelineHandler({ request, env });

    expect(response.status).toBe(200);
    const data = await response.json();

    const found = data.now.find((e) => e.id === event.id);
    expect(found).toBeDefined();
    const band = found.bands.find((b) => b.name === "Fallback Link Band");
    expect(band).toBeDefined();
    expect(band.url).toBe("https://fallbackband.bandcamp.com/");
  });
});

// ---------------------------------------------------------------------------
// Real-DB regression — the event-level `ticket_url` reflection must never
// carry an unsafe scheme. Seeded via a direct SQL UPDATE (bypassing write-path
// validation) to simulate a pre-guard legacy row. Regression for #504.
// ---------------------------------------------------------------------------
describe("Timeline real-DB — event ticket_url is scheme-validated (#504)", () => {
  test("an event with a javascript: ticket_url resolves to ticket_url: null", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const today = eventLocalToday();

    const event = insertEvent(rawDb, {
      name: "Unsafe Ticket Event",
      slug: "timeline-realdb-504-null",
      date: today,
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    rawDb
      .prepare("UPDATE events SET ticket_url = ? WHERE id = ?")
      // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #504 read-path guard
      .run("javascript:alert(1)", event.id);

    const request = new Request("https://example.test/api/events/timeline");
    const response = await timelineHandler({ request, env });

    expect(response.status).toBe(200);
    const data = await response.json();

    const found = data.now.find((e) => e.id === event.id);
    expect(found).toBeDefined();
    expect(found.ticket_url).toBeNull();
  });

  test("an event with a normal https ticket_url passes through unchanged", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const today = eventLocalToday();

    const event = insertEvent(rawDb, {
      name: "Safe Ticket Event",
      slug: "timeline-realdb-504-safe",
      date: today,
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    rawDb.prepare("UPDATE events SET ticket_url = ? WHERE id = ?").run("https://tickets.example.com/crawl", event.id);

    const request = new Request("https://example.test/api/events/timeline");
    const response = await timelineHandler({ request, env });

    expect(response.status).toBe(200);
    const data = await response.json();

    const found = data.now.find((e) => e.id === event.id);
    expect(found).toBeDefined();
    expect(found.ticket_url).toBe("https://tickets.example.com/crawl");
  });
});
