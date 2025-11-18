// Band performance history and statistics endpoint tests
// Tests for GET /api/admin/bands/stats/{name}

import { describe, it, expect, beforeEach, vi } from "vitest";
import { onRequestGet } from "../stats/[name].js";
import {
  createTestDB,
  createDBEnv,
  insertBand,
  insertEvent,
  insertVenue,
} from "../../../test-utils.js";

// Mock the middleware
vi.mock("../../_middleware.js", () => ({
  checkPermission: async (request, env, level) => {
    const role = request.headers.get("x-test-role");

    if (!role) {
      return {
        error: true,
        response: new Response(
          JSON.stringify({
            error: "Unauthorized",
            message: "Authentication required",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        ),
      };
    }

    // Map test roles to user IDs
    const userId = role === "admin" ? 1 : role === "editor" ? 2 : 3;
    const validRoles = ["viewer", "editor", "admin"];

    if (!validRoles.includes(role)) {
      return {
        error: true,
        response: new Response(
          JSON.stringify({
            error: "Forbidden",
            message: "Viewer role or higher required",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        ),
      };
    }

    return {
      error: false,
      user: { userId, role },
      userId,
    };
  },
  auditLog: async () => {},
}));

// Helper to insert band with all fields
function insertBandWithProfile(db, data) {
  const {
    name,
    event_id = null,
    venue_id = null,
    start_time = null,
    end_time = null,
    url = null,
    photo_url = null,
    description = null,
    genre = null,
    origin = null,
    social_links = null,
  } = data;

  const stmt = db.prepare(`
    INSERT INTO bands (
      name, event_id, venue_id, start_time, end_time, url,
      photo_url, description, genre, origin, social_links
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    name,
    event_id,
    venue_id,
    start_time,
    end_time,
    url,
    photo_url,
    description,
    genre,
    origin,
    social_links,
  );

  return db.prepare("SELECT * FROM bands WHERE id = ?").get(info.lastInsertRowid);
}

describe("GET /api/admin/bands/stats/:name", () => {
  let db;
  let env;

  beforeEach(() => {
    db = createTestDB();
    env = { DB: createDBEnv(db) };

    // Extend schema with additional band profile fields
    db.exec(`
      ALTER TABLE bands ADD COLUMN photo_url TEXT;
      ALTER TABLE bands ADD COLUMN description TEXT;
      ALTER TABLE bands ADD COLUMN genre TEXT;
      ALTER TABLE bands ADD COLUMN origin TEXT;
      ALTER TABLE bands ADD COLUMN social_links TEXT;
      ALTER TABLE events ADD COLUMN location TEXT;
    `);
  });

  // ===================================================================
  // Authentication & Authorization Tests
  // ===================================================================

  describe("Authentication & Authorization", () => {
    it("should allow viewer role to access stats", async () => {
      // Arrange
      const event = insertEvent(db, { name: "Test Event", slug: "test-event-1" });
      const venue = insertVenue(db, { name: "Test Venue" });
      insertBandWithProfile(db, {
        name: "Test Band",
        event_id: event.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
      });

      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/Test%20Band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      expect(response.status).toBe(200);
    });

    it("should reject unauthenticated requests", async () => {
      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/Test%20Band",
      );
      const response = await onRequestGet({ request, env });

      // Assert
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("should allow editor and admin roles", async () => {
      // Arrange
      const event = insertEvent(db, { name: "Test Event", slug: "test-event-2" });
      const venue = insertVenue(db, { name: "Test Venue" });
      insertBandWithProfile(db, {
        name: "Test Band",
        event_id: event.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
      });

      // Test editor role
      const editorRequest = new Request(
        "https://example.test/api/admin/bands/stats/Test%20Band",
        { headers: { "x-test-role": "editor" } },
      );
      const editorResponse = await onRequestGet({
        request: editorRequest,
        env,
      });
      expect(editorResponse.status).toBe(200);

      // Test admin role
      const adminRequest = new Request(
        "https://example.test/api/admin/bands/stats/Test%20Band",
        { headers: { "x-test-role": "admin" } },
      );
      const adminResponse = await onRequestGet({ request: adminRequest, env });
      expect(adminResponse.status).toBe(200);
    });
  });

  // ===================================================================
  // Input Validation Tests
  // ===================================================================

  describe("Input Validation", () => {
    it("should return 400 for missing band name", async () => {
      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Bad request");
      expect(data.message).toBe("Band name is required");
    });

    it("should return 400 for empty band name", async () => {
      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/%20",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Bad request");
    });

    it("should handle URL-encoded band names", async () => {
      // Arrange
      const event = insertEvent(db, { name: "Test Event", slug: "test-event-3" });
      const venue = insertVenue(db, { name: "Test Venue" });
      insertBandWithProfile(db, {
        name: "The Rock Band",
        event_id: event.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
      });

      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/The%20Rock%20Band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.profile.name).toBe("The Rock Band");
    });
  });

  // ===================================================================
  // Data Retrieval Tests
  // ===================================================================

  describe("Data Retrieval", () => {
    it("should return stats for existing band", async () => {
      // Arrange
      const event = insertEvent(db, { name: "Test Event", slug: "test-event-4" });
      const venue = insertVenue(db, { name: "Test Venue" });
      insertBandWithProfile(db, {
        name: "Test Band",
        event_id: event.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
      });

      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/Test%20Band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.profile.name).toBe("Test Band");
    });

    it("should return 404 for non-existent band", async () => {
      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/NonExistent%20Band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("Not found");
    });

    it("should be case-insensitive when matching band names", async () => {
      // Arrange
      const event = insertEvent(db, { name: "Test Event", slug: "test-event-5" });
      const venue = insertVenue(db, { name: "Test Venue" });
      insertBandWithProfile(db, {
        name: "Test Band",
        event_id: event.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
      });

      // Act - Request with different case
      const request = new Request(
        "https://example.test/api/admin/bands/stats/test%20band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.profile.name).toBe("Test Band");
    });
  });

  // ===================================================================
  // Statistics Calculation Tests
  // ===================================================================

  describe("Statistics Calculation", () => {
    it("should count total shows correctly with multiple performances", async () => {
      // Arrange - 3 performances at different events
      const event1 = insertEvent(db, {
        name: "Event 1",
        slug: "event-1",
        date: "2025-06-01",
      });
      const event2 = insertEvent(db, {
        name: "Event 2",
        slug: "event-2",
        date: "2025-07-01",
      });
      const event3 = insertEvent(db, {
        name: "Event 3",
        slug: "event-3",
        date: "2025-08-01",
      });
      const venue = insertVenue(db, { name: "Test Venue" });

      insertBandWithProfile(db, {
        name: "Popular Band",
        event_id: event1.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
      });
      insertBandWithProfile(db, {
        name: "Popular Band",
        event_id: event2.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
      });
      insertBandWithProfile(db, {
        name: "Popular Band",
        event_id: event3.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
      });

      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/Popular%20Band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      const data = await response.json();
      expect(data.stats.totalShows).toBe(3);
    });

    it("should count unique venues correctly", async () => {
      // Arrange - Same band at 3 different venues
      const event = insertEvent(db, { name: "Event", slug: "multi-venue-event", date: "2025-06-01" });
      const venue1 = insertVenue(db, { name: "Venue 1" });
      const venue2 = insertVenue(db, { name: "Venue 2" });
      const venue3 = insertVenue(db, { name: "Venue 3" });

      insertBandWithProfile(db, {
        name: "Touring Band",
        event_id: event.id,
        venue_id: venue1.id,
        start_time: "18:00",
        end_time: "19:00",
      });
      insertBandWithProfile(db, {
        name: "Touring Band",
        event_id: event.id,
        venue_id: venue2.id,
        start_time: "20:00",
        end_time: "21:00",
      });
      insertBandWithProfile(db, {
        name: "Touring Band",
        event_id: event.id,
        venue_id: venue3.id,
        start_time: "22:00",
        end_time: "23:00",
      });

      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/Touring%20Band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      const data = await response.json();
      expect(data.stats.uniqueVenues).toBe(3);
    });

    it("should count unique events correctly", async () => {
      // Arrange - Same band at 2 different events
      const event1 = insertEvent(db, {
        name: "Summer Fest",
        slug: "summer-fest",
        date: "2025-06-01",
      });
      const event2 = insertEvent(db, {
        name: "Winter Fest",
        slug: "winter-fest",
        date: "2025-12-01",
      });
      const venue = insertVenue(db, { name: "Main Stage" });

      insertBandWithProfile(db, {
        name: "Festival Band",
        event_id: event1.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
      });
      insertBandWithProfile(db, {
        name: "Festival Band",
        event_id: event2.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
      });

      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/Festival%20Band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      const data = await response.json();
      expect(data.stats.uniqueEvents).toBe(2);
    });

    it("should handle bands with null event_id", async () => {
      // Arrange - Rolodex band (no event)
      const venue = insertVenue(db, { name: "Practice Space" });
      insertBandWithProfile(db, {
        name: "Rolodex Band",
        event_id: null,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
      });

      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/Rolodex%20Band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      const data = await response.json();
      expect(data.stats.totalShows).toBe(0); // No event = no show
      expect(data.stats.uniqueVenues).toBe(1); // Still has venue
    });

    it("should handle bands with null venue_id", async () => {
      // Arrange - Band with event but no venue
      const event = insertEvent(db, { name: "Virtual Event", slug: "virtual-event", date: "2025-06-01" });
      insertBandWithProfile(db, {
        name: "Virtual Band",
        event_id: event.id,
        venue_id: null,
        start_time: "20:00",
        end_time: "21:00",
      });

      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/Virtual%20Band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      const data = await response.json();
      expect(data.stats.totalShows).toBe(1); // Has event
      expect(data.stats.uniqueVenues).toBe(0); // No venue
    });
  });

  // ===================================================================
  // Profile Data Tests
  // ===================================================================

  describe("Profile Data", () => {
    it("should return profile from most recent entry", async () => {
      // Arrange - Same band at different events with different profile data
      const event1 = insertEvent(db, {
        name: "Old Event",
        slug: "old-event",
        date: "2025-01-01",
      });
      const event2 = insertEvent(db, {
        name: "Recent Event",
        slug: "recent-event",
        date: "2025-06-01",
      });
      const venue = insertVenue(db, { name: "Test Venue" });

      // Older entry with old profile
      insertBandWithProfile(db, {
        name: "Evolving Band",
        event_id: event1.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
        photo_url: "old-photo.jpg",
        description: "Old description",
      });

      // More recent entry with updated profile
      insertBandWithProfile(db, {
        name: "Evolving Band",
        event_id: event2.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
        photo_url: "new-photo.jpg",
        description: "New description",
      });

      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/Evolving%20Band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      const data = await response.json();
      expect(data.profile.photo_url).toBe("new-photo.jpg");
      expect(data.profile.description).toBe("New description");
    });

    it("should include all profile fields", async () => {
      // Arrange
      const event = insertEvent(db, { name: "Test Event", slug: "profile-test-event", date: "2025-06-01" });
      const venue = insertVenue(db, { name: "Test Venue" });
      insertBandWithProfile(db, {
        name: "Complete Band",
        event_id: event.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
        photo_url: "https://example.com/photo.jpg",
        description: "A great band",
        genre: "Rock",
        origin: "Seattle, WA",
        social_links: JSON.stringify({
          website: "https://example.com",
          instagram: "@band",
        }),
      });

      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/Complete%20Band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      const data = await response.json();
      expect(data.profile).toEqual({
        name: "Complete Band",
        photo_url: "https://example.com/photo.jpg",
        description: "A great band",
        genre: "Rock",
        origin: "Seattle, WA",
        social_links: JSON.stringify({
          website: "https://example.com",
          instagram: "@band",
        }),
      });
    });
  });

  // ===================================================================
  // Performance History Tests
  // ===================================================================

  describe("Performance History", () => {
    it("should order performances by event date DESC", async () => {
      // Arrange
      const event1 = insertEvent(db, {
        name: "Event 1",
        slug: "date-test-1",
        date: "2025-01-01",
      });
      const event2 = insertEvent(db, {
        name: "Event 2",
        slug: "date-test-2",
        date: "2025-06-01",
      });
      const event3 = insertEvent(db, {
        name: "Event 3",
        slug: "date-test-3",
        date: "2025-12-01",
      });
      const venue = insertVenue(db, { name: "Venue" });

      insertBandWithProfile(db, {
        name: "Time Band",
        event_id: event1.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
      });
      insertBandWithProfile(db, {
        name: "Time Band",
        event_id: event2.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
      });
      insertBandWithProfile(db, {
        name: "Time Band",
        event_id: event3.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
      });

      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/Time%20Band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      const data = await response.json();
      expect(data.performances).toHaveLength(3);
      expect(data.performances[0].event.name).toBe("Event 3"); // 2025-12-01
      expect(data.performances[1].event.name).toBe("Event 2"); // 2025-06-01
      expect(data.performances[2].event.name).toBe("Event 1"); // 2025-01-01
    });

    it("should include event details when present", async () => {
      // Arrange
      const event = insertEvent(db, {
        name: "Summer Music Festival",
        slug: "summer-music-festival",
        date: "2025-07-15",
      });
      // Update event location
      db.prepare("UPDATE events SET location = ? WHERE id = ?").run("Central Park", event.id);

      const venue = insertVenue(db, { name: "Main Stage" });
      insertBandWithProfile(db, {
        name: "Event Band",
        event_id: event.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
      });

      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/Event%20Band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      const data = await response.json();
      expect(data.performances[0].event).toEqual({
        id: event.id,
        name: "Summer Music Festival",
        date: "2025-07-15",
        location: "Central Park",
      });
    });

    it("should include venue details when present", async () => {
      // Arrange
      const event = insertEvent(db, { name: "Jazz Night", slug: "jazz-night", date: "2025-06-01" });
      const venue = insertVenue(db, {
        name: "Blue Note Jazz Club",
        address: "131 W 3rd St, New York, NY",
      });
      insertBandWithProfile(db, {
        name: "Venue Band",
        event_id: event.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
      });

      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/Venue%20Band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      const data = await response.json();
      expect(data.performances[0].venue).toEqual({
        id: venue.id,
        name: "Blue Note Jazz Club",
        address: "131 W 3rd St, New York, NY",
      });
    });

    it("should handle null event and venue gracefully", async () => {
      // Arrange - Rolodex entry with no event or venue
      insertBandWithProfile(db, {
        name: "Orphan Band",
        event_id: null,
        venue_id: null,
        start_time: "20:00",
        end_time: "21:00",
      });

      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/Orphan%20Band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      const data = await response.json();
      expect(data.performances).toHaveLength(1);
      expect(data.performances[0].event).toBeNull();
      expect(data.performances[0].venue).toBeNull();
      expect(data.performances[0].startTime).toBe("20:00");
      expect(data.performances[0].endTime).toBe("21:00");
    });
  });

  // ===================================================================
  // Edge Cases & Error Handling Tests
  // ===================================================================

  describe("Edge Cases & Error Handling", () => {
    it("should return 404 for band with no performances", async () => {
      // This is actually impossible since we query by band name
      // and the band only exists if it has at least one entry
      // But we can test it by querying a name that doesn't exist

      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/Never%20Performed",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("Not found");
      expect(data.message).toBe("No performances found for this band");
    });

    it("should return proper error format for database errors", async () => {
      // Arrange - Create invalid env with null DB to trigger error
      const invalidEnv = { DB: null };

      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/Test%20Band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env: invalidEnv });

      // Assert
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Database error");
      expect(data.message).toBe("Failed to fetch band statistics");
    });

    it("should match response format specification", async () => {
      // Arrange
      const event = insertEvent(db, { name: "Format Test", slug: "format-test", date: "2025-06-01" });
      db.prepare("UPDATE events SET location = ? WHERE id = ?").run("Test Location", event.id);

      const venue = insertVenue(db, {
        name: "Format Venue",
        address: "123 Test St",
      });
      insertBandWithProfile(db, {
        name: "Format Band",
        event_id: event.id,
        venue_id: venue.id,
        start_time: "20:00",
        end_time: "21:00",
        photo_url: "photo.jpg",
        description: "Test description",
        genre: "Rock",
        origin: "Portland",
        social_links: '{"website":"test.com"}',
      });

      // Act
      const request = new Request(
        "https://example.test/api/admin/bands/stats/Format%20Band",
        { headers: { "x-test-role": "viewer" } },
      );
      const response = await onRequestGet({ request, env });

      // Assert
      const data = await response.json();

      // Root structure
      expect(data).toHaveProperty("profile");
      expect(data).toHaveProperty("stats");
      expect(data).toHaveProperty("performances");

      // Profile structure
      expect(data.profile).toHaveProperty("name");
      expect(data.profile).toHaveProperty("photo_url");
      expect(data.profile).toHaveProperty("description");
      expect(data.profile).toHaveProperty("genre");
      expect(data.profile).toHaveProperty("origin");
      expect(data.profile).toHaveProperty("social_links");

      // Stats structure
      expect(data.stats).toHaveProperty("totalShows");
      expect(data.stats).toHaveProperty("uniqueVenues");
      expect(data.stats).toHaveProperty("uniqueEvents");

      // Performance structure
      expect(Array.isArray(data.performances)).toBe(true);
      expect(data.performances[0]).toHaveProperty("id");
      expect(data.performances[0]).toHaveProperty("event");
      expect(data.performances[0]).toHaveProperty("venue");
      expect(data.performances[0]).toHaveProperty("startTime");
      expect(data.performances[0]).toHaveProperty("endTime");

      // Event structure (when present)
      expect(data.performances[0].event).toHaveProperty("id");
      expect(data.performances[0].event).toHaveProperty("name");
      expect(data.performances[0].event).toHaveProperty("date");
      expect(data.performances[0].event).toHaveProperty("location");

      // Venue structure (when present)
      expect(data.performances[0].venue).toHaveProperty("id");
      expect(data.performances[0].venue).toHaveProperty("name");
      expect(data.performances[0].venue).toHaveProperty("address");
    });
  });
});
