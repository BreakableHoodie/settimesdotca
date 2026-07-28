import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { onRequestGet } from "../public.js";
import { MockD1Database } from "../../subscriptions/__tests__/mocks/d1.js";
import { createMockEvent, createMockVenue, createMockBand, seedMockData } from "./helpers.js";

// Generates `count` unique, published, upcoming events (distinct future dates)
// so tests can distinguish "default limit applied" from "all rows returned".
function createMockEvents(count, overrides = {}) {
  const events = [];
  for (let i = 0; i < count; i++) {
    const date = new Date();
    date.setDate(date.getDate() + 1 + i);
    events.push(
      createMockEvent({
        id: i + 1,
        slug: `event-${i + 1}`,
        name: `Event ${i + 1}`,
        date: date.toISOString().split("T")[0],
        ...overrides,
      }),
    );
  }
  return events;
}

describe("GET /api/events/public", () => {
  let mockDB;
  let mockEnv;

  beforeEach(() => {
    mockDB = new MockD1Database();
    mockEnv = { DB: mockDB, PUBLIC_DATA_PUBLISH_ENABLED: "true" };

    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return all events with venue and band details", async () => {
    const event = createMockEvent();
    const venue = createMockVenue();
    const band = createMockBand();

    seedMockData(mockDB, [event], [venue], [band]);

    const request = new Request("http://localhost/api/events/public");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.events).toBeInstanceOf(Array);
    expect(data.events).toHaveLength(1);
    expect(data.events[0]).toMatchObject({
      id: 1,
      name: "Summer Music Festival 2024",
      city: "portland",
    });
    expect(data.events[0].band_count).toBeGreaterThan(0);
    expect(data.events[0].venue_count).toBeGreaterThan(0);
  });

  it("should filter by city parameter", async () => {
    const event1 = createMockEvent({ id: 1, city: "portland" });
    const event2 = createMockEvent({
      id: 2,
      city: "seattle",
      name: "Seattle Showcase",
    });
    const venue = createMockVenue();
    const band1 = createMockBand({ id: 1 });
    const band2 = createMockBand({ id: 2, event_id: 2 });

    seedMockData(mockDB, [event1, event2], [venue], [band1, band2]);

    const request = new Request("http://localhost/api/events/public?city=portland");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.events).toHaveLength(1);
    expect(data.events[0].city).toBe("portland");
    expect(data.filters.city).toBe("portland");
  });

  it("should filter by genre parameter", async () => {
    const event = createMockEvent();
    const venue = createMockVenue();
    const punkBand = createMockBand({
      id: 1,
      genre: "punk",
      name: "Punk Band",
    });
    const indieBand = createMockBand({
      id: 2,
      genre: "indie",
      name: "Indie Band",
    });

    seedMockData(mockDB, [event], [venue], [punkBand, indieBand]);

    const request = new Request("http://localhost/api/events/public?genre=punk");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.filters.genre).toBe("punk");
    // Should still return the event but filtered by genre
    expect(data.events).toBeInstanceOf(Array);
  });

  it("should combine city and genre filters", async () => {
    const portlandEvent = createMockEvent({ id: 1, city: "portland" });
    const seattleEvent = createMockEvent({
      id: 2,
      city: "seattle",
      name: "Seattle Showcase",
    });
    const venue = createMockVenue();
    const punkBand = createMockBand({ id: 1, event_id: 1, genre: "punk" });
    const indieBand = createMockBand({ id: 2, event_id: 2, genre: "indie" });

    seedMockData(mockDB, [portlandEvent, seattleEvent], [venue], [punkBand, indieBand]);

    const request = new Request("http://localhost/api/events/public?city=portland&genre=punk");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.filters.city).toBe("portland");
    expect(data.filters.genre).toBe("punk");
  });

  it("should return empty array when no events match filters", async () => {
    seedMockData(mockDB, [], [], []);

    const request = new Request("http://localhost/api/events/public?city=nonexistent");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.events).toHaveLength(0);
    expect(data.count).toBe(0);
  });

  it("should return empty array for invalid city", async () => {
    const event = createMockEvent({ city: "portland" });
    const venue = createMockVenue();
    const band = createMockBand();

    seedMockData(mockDB, [event], [venue], [band]);

    const request = new Request("http://localhost/api/events/public?city=invalidcity");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.events).toHaveLength(0);
  });

  it("should verify response includes all required fields", async () => {
    const event = createMockEvent();
    const venue = createMockVenue();
    const band = createMockBand();

    seedMockData(mockDB, [event], [venue], [band]);

    const request = new Request("http://localhost/api/events/public");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("events");
    expect(data).toHaveProperty("filters");
    expect(data).toHaveProperty("count");
    expect(data).toHaveProperty("generated_at");

    expect(data.filters).toHaveProperty("city");
    expect(data.filters).toHaveProperty("genre");
    expect(data.filters).toHaveProperty("upcoming");
    expect(data.filters).toHaveProperty("limit");
  });

  it("should sort events chronologically by date", async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);

    const event1 = createMockEvent({
      id: 1,
      date: dayAfter.toISOString().split("T")[0],
      name: "Event 3",
    });
    const event2 = createMockEvent({
      id: 2,
      date: tomorrow.toISOString().split("T")[0],
      name: "Event 1",
    });
    const event3 = createMockEvent({
      id: 3,
      date: tomorrow.toISOString().split("T")[0],
      name: "Event 2",
    });

    const venue = createMockVenue();
    const band1 = createMockBand({ id: 1, event_id: 1 });
    const band2 = createMockBand({ id: 2, event_id: 2 });
    const band3 = createMockBand({ id: 3, event_id: 3 });

    seedMockData(mockDB, [event1, event2, event3], [venue], [band1, band2, band3]);

    const request = new Request("http://localhost/api/events/public");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.events).toHaveLength(3);

    // Should be sorted by date ASC
    const dates = data.events.map((e) => e.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  describe("limit parameter guard (#480)", () => {
    it("falls back to the default (50) when limit is non-numeric (?limit=abc)", async () => {
      // Seed more than the default so an unguarded NaN -> LIMIT NULL bypass
      // (which returns every row) is distinguishable from the correct 50-row default.
      const events = createMockEvents(60);
      seedMockData(mockDB, events, [], []);

      const request = new Request("http://localhost/api/events/public?limit=abc");
      const context = { request, env: mockEnv };

      const response = await onRequestGet(context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.filters.limit).toBe(50);
      expect(data.events).toHaveLength(50);
      expect(data.count).toBe(50);
    });

    it("falls back to the default (50) when limit is 0", async () => {
      const events = createMockEvents(60);
      seedMockData(mockDB, events, [], []);

      const request = new Request("http://localhost/api/events/public?limit=0");
      const context = { request, env: mockEnv };

      const response = await onRequestGet(context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.filters.limit).toBe(50);
      expect(data.events).toHaveLength(50);
    });

    it("falls back to the default (50) when limit is negative", async () => {
      const events = createMockEvents(60);
      seedMockData(mockDB, events, [], []);

      const request = new Request("http://localhost/api/events/public?limit=-5");
      const context = { request, env: mockEnv };

      const response = await onRequestGet(context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.filters.limit).toBe(50);
      expect(data.events).toHaveLength(50);
    });

    it("caps limit at 100 when a larger value is requested", async () => {
      const events = createMockEvents(105);
      seedMockData(mockDB, events, [], []);

      const request = new Request("http://localhost/api/events/public?limit=200");
      const context = { request, env: mockEnv };

      const response = await onRequestGet(context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.filters.limit).toBe(100);
      expect(data.events).toHaveLength(100);
    });

    it("honours a valid in-range limit (?limit=7)", async () => {
      const events = createMockEvents(10);
      seedMockData(mockDB, events, [], []);

      const request = new Request("http://localhost/api/events/public?limit=7");
      const context = { request, env: mockEnv };

      const response = await onRequestGet(context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.filters.limit).toBe(7);
      expect(data.events).toHaveLength(7);
    });
  });

  describe("ticket_url sanitization (#504)", () => {
    it("nulls out a legacy javascript: ticket_url value", async () => {
      // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #504 read-path guard
      const event = createMockEvent({ ticket_url: "javascript:alert(1)" });
      const venue = createMockVenue();
      const band = createMockBand();

      seedMockData(mockDB, [event], [venue], [band]);

      const request = new Request("http://localhost/api/events/public");
      const context = { request, env: mockEnv };

      const response = await onRequestGet(context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.events).toHaveLength(1);
      expect(data.events[0].ticket_url).toBeNull();
    });

    it("passes a normal https ticket_url value through unchanged", async () => {
      const event = createMockEvent({ ticket_url: "https://tickets.example.com/summer-fest" });
      const venue = createMockVenue();
      const band = createMockBand();

      seedMockData(mockDB, [event], [venue], [band]);

      const request = new Request("http://localhost/api/events/public");
      const context = { request, env: mockEnv };

      const response = await onRequestGet(context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.events[0].ticket_url).toBe("https://tickets.example.com/summer-fest");
    });
  });

  describe("poster_url (#658)", () => {
    it("returns poster_url when present", async () => {
      const event = createMockEvent({ poster_url: "https://cdn.example.com/posters/summer-fest.jpg" });
      const venue = createMockVenue();
      const band = createMockBand();

      seedMockData(mockDB, [event], [venue], [band]);

      const request = new Request("http://localhost/api/events/public");
      const context = { request, env: mockEnv };

      const response = await onRequestGet(context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.events[0].poster_url).toBe("https://cdn.example.com/posters/summer-fest.jpg");
    });

    it("returns null when poster_url is absent", async () => {
      const event = createMockEvent();
      const venue = createMockVenue();
      const band = createMockBand();

      seedMockData(mockDB, [event], [venue], [band]);

      const request = new Request("http://localhost/api/events/public");
      const context = { request, env: mockEnv };

      const response = await onRequestGet(context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.events[0].poster_url).toBeNull();
    });

    it("nulls out a legacy javascript: poster_url value", async () => {
      // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #658 read-path guard
      const event = createMockEvent({ poster_url: "javascript:alert(1)" });
      const venue = createMockVenue();
      const band = createMockBand();

      seedMockData(mockDB, [event], [venue], [band]);

      const request = new Request("http://localhost/api/events/public");
      const context = { request, env: mockEnv };

      const response = await onRequestGet(context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.events[0].poster_url).toBeNull();
    });
  });
});
