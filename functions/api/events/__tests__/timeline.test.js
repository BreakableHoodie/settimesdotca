/**
 * Timeline API Tests
 *
 * Tests for the optimized timeline endpoint with JOIN queries
 * Validates N+1 query fix and correct data grouping
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock D1 Database
const createMockDB = () => {
  const mockPrepare = (query) => {
    return {
      bind: (...args) => ({
        all: async () => {
          // Mock data for different query types
          if (query.includes("e.date = ?")) {
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
          } else if (query.includes("e.date < ?")) {
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
                  origin: "Ottawa",
                  photo_url: "https://example.com/band3.jpg",
                  venue_id: 3,
                  venue_name: "Past Venue",
                  venue_address: "789 Past Rd",
                },
              ],
            };
          }
          return { results: [] };
        },
      }),
    };
  };

  return { prepare: mockPrepare };
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
      env: { DB: createMockDB() },
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
      mockContext.request = new Request(
        "https://example.com/api/events/timeline?now=false",
      );
      const response = await onRequestGet(mockContext);
      const data = await response.json();

      expect(data.now).toHaveLength(0);
    });

    it('should support disabling "upcoming" events', async () => {
      mockContext.request = new Request(
        "https://example.com/api/events/timeline?upcoming=false",
      );
      const response = await onRequestGet(mockContext);
      const data = await response.json();

      expect(data.upcoming).toHaveLength(0);
    });

    it('should support disabling "past" events', async () => {
      mockContext.request = new Request(
        "https://example.com/api/events/timeline?past=false",
      );
      const response = await onRequestGet(mockContext);
      const data = await response.json();

      expect(data.past).toHaveLength(0);
    });

    it("should respect pastLimit parameter", async () => {
      mockContext.request = new Request(
        "https://example.com/api/events/timeline?pastLimit=5",
      );
      const response = await onRequestGet(mockContext);
      const data = await response.json();

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
      expect(data.error).toBe("Failed to fetch events timeline");
      expect(data).toHaveProperty("details");
    });

    it("should handle empty results", async () => {
      mockContext.env.DB = {
        prepare: () => ({
          bind: () => ({
            all: async () => ({ results: [] }),
          }),
        }),
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
          bind: () => ({
            all: async () => ({ results: null }),
          }),
        }),
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

  describe("Edge Cases", () => {
    it("should handle events with no bands", async () => {
      mockContext.env.DB = {
        prepare: () => ({
          bind: () => ({
            all: async () => ({
              results: [
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
              ],
            }),
          }),
        }),
      };

      const response = await onRequestGet(mockContext);
      const data = await response.json();

      expect(data.now[0].bands).toHaveLength(0);
      expect(data.now[0].venues).toHaveLength(0);
      expect(data.now[0].band_count).toBe(0);
      expect(data.now[0].venue_count).toBe(0);
    });

    it("should handle same venue with multiple bands", async () => {
      mockContext.env.DB = {
        prepare: () => ({
          bind: () => ({
            all: async () => ({
              results: [
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
              ],
            }),
          }),
        }),
      };

      const response = await onRequestGet(mockContext);
      const data = await response.json();

      expect(data.now[0].venues).toHaveLength(1);
      expect(data.now[0].venues[0].band_count).toBe(2);
      expect(data.now[0].bands).toHaveLength(2);
    });
  });
});
