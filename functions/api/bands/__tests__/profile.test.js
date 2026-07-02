import { describe, test, expect } from "vitest";
import { onRequestGet } from "../[name].js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../test-utils.js";

describe("GET /api/bands/:name - reveal_mode gate", () => {
  test("hides unannounced performance when reveal_mode=1", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Band Crawl Vol 17",
      slug: "vol17-band-profile-1",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Prohibition Warehouse" });
    const perf = insertBand(rawDb, {
      name: "Embargoed Artist",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(perf.id);

    const request = new Request("https://example.test/api/bands/Embargoed%20Artist");
    const response = await onRequestGet({ request, env, params: {} });

    // The only performance is embargoed — band appears to have no performances
    // so the handler returns 404 (same as "band not found")
    expect(response.status).toBe(404);
  });

  test("shows announced performance when reveal_mode=1", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Band Crawl Vol 17",
      slug: "vol17-band-profile-2",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Roost" });
    const perf = insertBand(rawDb, {
      name: "Revealed Artist",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=1 WHERE id=?").run(perf.id);

    const request = new Request("https://example.test/api/bands/Revealed%20Artist");
    const response = await onRequestGet({ request, env, params: {} });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.performances).toHaveLength(1);
    expect(payload.performances[0].event_slug).toBe("vol17-band-profile-2");
  });

  test("shows unannounced performance when reveal_mode=0", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Normal Event",
      slug: "vol17-band-profile-3",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1, reveal_mode=0 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Revive Karaoke" });
    const perf = insertBand(rawDb, {
      name: "Normal Artist",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(perf.id);

    const request = new Request("https://example.test/api/bands/Normal%20Artist");
    const response = await onRequestGet({ request, env, params: {} });

    // reveal_mode=0: unannounced performances still visible
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.performances).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// #483 — social link URLs reflected from DB without read-path scheme
// validation. `social_links` is seeded via a direct SQL insert (through
// insertBand's `social_links` param) to simulate a legacy/bypassed row that
// predates the write-path guard, since the write path itself now rejects
// unsafe schemes.
// ---------------------------------------------------------------------------
describe("GET /api/bands/:name - social_links scheme sanitization (#483)", () => {
  test("nulls a javascript: scheme website but preserves a plain instagram handle", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Band Crawl Vol 17",
      slug: "vol17-band-profile-483-unsafe",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Roost" });
    insertBand(rawDb, {
      name: "Scheme Test Band",
      event_id: event.id,
      venue_id: venue.id,
      // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #483 read-path guard
      social_links: JSON.stringify({ website: "javascript:alert(1)", instagram: "the_band" }),
    });

    const request = new Request("https://example.test/api/bands/Scheme%20Test%20Band");
    const response = await onRequestGet({ request, env, params: {} });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.social.website).toBeNull();
    expect(payload.social.instagram).toBe("the_band");
  });

  test("passes a valid https website through unchanged", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Band Crawl Vol 17",
      slug: "vol17-band-profile-483-safe",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Roost" });
    insertBand(rawDb, {
      name: "Valid Site Band",
      event_id: event.id,
      venue_id: venue.id,
      social_links: JSON.stringify({ website: "https://example.com/band" }),
    });

    const request = new Request("https://example.test/api/bands/Valid%20Site%20Band");
    const response = await onRequestGet({ request, env, params: {} });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.social.website).toBe("https://example.com/band");
  });
});
