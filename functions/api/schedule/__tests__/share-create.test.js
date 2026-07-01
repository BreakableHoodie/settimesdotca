import { describe, expect, test } from "vitest";
import { onRequestPost } from "../share.js";
import { createTestEnv, insertEvent, insertBand, insertVenue } from "../../test-utils.js";

describe("POST /api/schedule/share", () => {
  function makeRequest(body) {
    return new Request("https://example.test/api/schedule/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  test("creates a share link and returns a slug", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { slug: "my-event" });
    rawDb.prepare("UPDATE events SET is_published = 1 WHERE id = ?").run(event.id);
    const venue = insertVenue(rawDb);
    const perf = insertBand(rawDb, { event_id: event.id, venue_id: venue.id });

    const res = await onRequestPost({
      request: makeRequest({
        event_id: event.id,
        event_slug: "my-event",
        performance_ids: [perf.id],
        band_names: [perf.name],
      }),
      env,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slug).toMatch(/^[a-zA-Z0-9]{8}$/);

    const row = rawDb.prepare("SELECT * FROM share_links WHERE slug = ?").get(body.slug);
    expect(row).not.toBeNull();
    expect(JSON.parse(row.performance_ids)).toEqual([perf.id]);
    expect(JSON.parse(row.band_names)).toEqual([perf.name]);
    expect(row.event_slug).toBe("my-event");
  });

  test("rejects missing event_id", async () => {
    const { env } = createTestEnv();
    const res = await onRequestPost({
      request: makeRequest({ event_slug: "e", performance_ids: [1], band_names: ["B"] }),
      env,
    });
    expect(res.status).toBe(400);
  });

  test("rejects invalid event_slug characters", async () => {
    const { env } = createTestEnv();
    const res = await onRequestPost({
      request: makeRequest({
        event_id: 1,
        event_slug: "<script>",
        performance_ids: [1],
        band_names: ["B"],
      }),
      env,
    });
    expect(res.status).toBe(400);
  });

  test("rejects empty performance_ids", async () => {
    const { env } = createTestEnv();
    const res = await onRequestPost({
      request: makeRequest({
        event_id: 1,
        event_slug: "e",
        performance_ids: [],
        band_names: [],
      }),
      env,
    });
    expect(res.status).toBe(400);
  });

  test("rejects performance_ids exceeding 50", async () => {
    const { env } = createTestEnv();
    const res = await onRequestPost({
      request: makeRequest({
        event_id: 1,
        event_slug: "e",
        performance_ids: Array.from({ length: 51 }, (_, i) => i + 1),
        band_names: Array.from({ length: 51 }, (_, i) => `Band ${i}`),
      }),
      env,
    });
    expect(res.status).toBe(400);
  });

  test("rejects mismatched band_names length", async () => {
    const { env } = createTestEnv();
    const res = await onRequestPost({
      request: makeRequest({
        event_id: 1,
        event_slug: "e",
        performance_ids: [1, 2],
        band_names: ["Only One"],
      }),
      env,
    });
    expect(res.status).toBe(400);
  });

  test("rejects band name exceeding 100 chars", async () => {
    const { env } = createTestEnv();
    const res = await onRequestPost({
      request: makeRequest({
        event_id: 1,
        event_slug: "e",
        performance_ids: [1],
        band_names: ["x".repeat(101)],
      }),
      env,
    });
    expect(res.status).toBe(400);
  });

  test("returns 404 for unknown event_id", async () => {
    const { env } = createTestEnv();
    const res = await onRequestPost({
      request: makeRequest({
        event_id: 9999,
        event_slug: "ghost",
        performance_ids: [1],
        band_names: ["B"],
      }),
      env,
    });
    expect(res.status).toBe(404);
  });

  test("rejects null event_id", async () => {
    const { env } = createTestEnv();
    const res = await onRequestPost({
      request: makeRequest({ event_id: null, event_slug: "e", performance_ids: [1], band_names: ["B"] }),
      env,
    });
    expect(res.status).toBe(400);
  });
});
