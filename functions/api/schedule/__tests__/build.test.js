import { describe, expect, test } from "vitest";
import { onRequestPost } from "../build.js";
import { createTestEnv, insertBand, insertEvent, insertVenue } from "../../test-utils.js";

describe("POST /api/schedule/build", () => {
  test("records schedule build for performance ids", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Build Event", slug: "build-event" });
    rawDb.prepare("UPDATE events SET is_published = 1 WHERE id = ?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Build Venue" });
    const performance = insertBand(rawDb, {
      name: "Build Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });

    const request = new Request("https://example.test/api/schedule/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: event.id,
        performance_ids: [performance.id],
        user_session: "session-123",
      }),
    });

    const response = await onRequestPost({ request, env });
    expect(response.status).toBe(200);

    const row = rawDb
      .prepare("SELECT * FROM schedule_builds WHERE event_id = ?")
      .get(event.id);
    expect(row).toMatchObject({
      event_id: event.id,
      performance_id: performance.id,
      user_session: "session-123",
    });
  });

  test("validates event_id", async () => {
    const { env } = createTestEnv();
    const request = new Request("https://example.test/api/schedule/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ performance_ids: [1], user_session: "session-123" }),
    });

    const response = await onRequestPost({ request, env });
    expect(response.status).toBe(400);
  });

  test("requires user_session", async () => {
    const { env } = createTestEnv();
    const request = new Request("https://example.test/api/schedule/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: 1, performance_ids: [1] }),
    });

    const response = await onRequestPost({ request, env });
    expect(response.status).toBe(400);
  });

  test("requires performance ids", async () => {
    const { env } = createTestEnv();
    const request = new Request("https://example.test/api/schedule/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: 1, user_session: "session-123" }),
    });

    const response = await onRequestPost({ request, env });
    expect(response.status).toBe(400);
  });
});
