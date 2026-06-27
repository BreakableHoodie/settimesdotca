import { describe, test, expect } from "vitest";
import { onRequestGet } from "../[name].js";
import {
  createTestEnv,
  insertEvent,
  insertVenue,
  insertBand,
} from "../../../test-utils.js";

describe("GET /api/bands/stats/:name — reveal_mode gate", () => {
  // Use a far-future date so performances land in the "upcoming" bucket
  // and event_status = 'published' satisfies the IN ('published', 'archived') guard.
  const futureDate = "2099-01-01";

  test("unannounced performance in reveal_mode=1 event is hidden from band stats", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Room 47" });
    const event = insertEvent(rawDb, {
      name: "Vol 17 Stats Hidden",
      slug: "stats-reveal-hidden",
      date: futureDate,
      status: "published",
    });
    rawDb
      .prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?")
      .run(event.id);
    const perf = insertBand(rawDb, {
      name: "Stats Hidden Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb
      .prepare("UPDATE performances SET is_announced=0 WHERE id=?")
      .run(perf.id);

    const request = new Request(
      "https://example.test/api/bands/stats/Stats%20Hidden%20Band",
    );
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();
    // The embargoed performance must be absent from both upcoming and stats
    expect(payload.upcoming).toHaveLength(0);
    expect(payload.stats.total_performances).toBe(0);
  });

  test("announced performance in reveal_mode=1 event is shown in band stats", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Revive Karaoke" });
    const event = insertEvent(rawDb, {
      name: "Vol 17 Stats Shown",
      slug: "stats-reveal-shown",
      date: futureDate,
      status: "published",
    });
    rawDb
      .prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?")
      .run(event.id);
    const perf = insertBand(rawDb, {
      name: "Stats Revealed Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb
      .prepare("UPDATE performances SET is_announced=1 WHERE id=?")
      .run(perf.id);

    const request = new Request(
      "https://example.test/api/bands/stats/Stats%20Revealed%20Band",
    );
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.upcoming).toHaveLength(1);
    expect(payload.upcoming[0].event_slug).toBe("stats-reveal-shown");
    expect(payload.stats.total_performances).toBe(1);
  });

  test("unannounced performance in reveal_mode=0 event is shown (gate is no-op)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Princess Cafe" });
    const event = insertEvent(rawDb, {
      name: "Normal Stats Event",
      slug: "stats-reveal-mode0",
      date: futureDate,
      status: "published",
    });
    rawDb
      .prepare("UPDATE events SET is_published=1, reveal_mode=0 WHERE id=?")
      .run(event.id);
    const perf = insertBand(rawDb, {
      name: "Stats Normal Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb
      .prepare("UPDATE performances SET is_announced=0 WHERE id=?")
      .run(perf.id);

    const request = new Request(
      "https://example.test/api/bands/stats/Stats%20Normal%20Band",
    );
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const payload = await response.json();
    // reveal_mode=0: gate is a no-op, unannounced performances still visible
    expect(payload.upcoming).toHaveLength(1);
    expect(payload.stats.total_performances).toBe(1);
  });
});
