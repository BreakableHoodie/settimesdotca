import { describe, expect, test } from "vitest";
import { onRequestGet } from "../[id]/details.js";
import {
  createTestEnv,
  insertEvent,
  insertVenue,
  insertBand,
} from "../../test-utils.js";

describe("GET /api/events/:id/details", () => {
  test("returns event details for a published event", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Test Event",
      slug: "test-event",
      date: "2026-01-01",
    });
    rawDb
      .prepare("UPDATE events SET is_published = 1 WHERE id = ?")
      .run(event.id);

    const venue = insertVenue(rawDb, { name: "Test Venue", city: "Portland" });
    insertBand(rawDb, {
      name: "Test Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "19:00",
      end_time: "20:00",
    });

    const request = new Request(
      `https://example.test/api/events/${event.id}/details`,
    );
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

    const request = new Request(
      `https://example.test/api/events/${event.id}/details`,
    );
    const response = await onRequestGet({
      request,
      env,
      params: { id: String(event.id) },
    });

    expect(response.status).toBe(404);
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
    rawDb
      .prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?")
      .run(event.id);
    const venue = insertVenue(rawDb, { name: "Blue Room" });
    const announced = insertBand(rawDb, {
      name: "Visible Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb
      .prepare("UPDATE performances SET is_announced=1 WHERE id=?")
      .run(announced.id);
    const hidden = insertBand(rawDb, {
      name: "Hidden Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb
      .prepare("UPDATE performances SET is_announced=0 WHERE id=?")
      .run(hidden.id);

    const request = new Request(
      `https://example.test/api/events/${event.id}/details`,
    );
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
    rawDb
      .prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?")
      .run(event.id);
    const venue = insertVenue(rawDb, { name: "Princess Cafe" });
    const announced = insertBand(rawDb, {
      name: "Announced Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb
      .prepare("UPDATE performances SET is_announced=1 WHERE id=?")
      .run(announced.id);

    const request = new Request(
      `https://example.test/api/events/${event.id}/details`,
    );
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
    rawDb
      .prepare("UPDATE events SET is_published=1, reveal_mode=0 WHERE id=?")
      .run(event.id);
    const venue = insertVenue(rawDb, { name: "Room 47" });
    const unannounced = insertBand(rawDb, {
      name: "Unannounced But Visible",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb
      .prepare("UPDATE performances SET is_announced=0 WHERE id=?")
      .run(unannounced.id);

    const request = new Request(
      `https://example.test/api/events/${event.id}/details`,
    );
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
