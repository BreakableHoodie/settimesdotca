import { describe, test, expect } from "vitest";
import { onRequestGet } from "../[id].js";
import {
  createTestEnv,
  insertEvent,
  insertVenue,
  insertBand,
} from "../../test-utils.js";

describe("GET /api/venues/:id — reveal_mode gate", () => {
  // Use a far-future date so performances land in the "upcoming" bucket.
  const futureDate = "2099-01-01";

  test("unannounced performance in reveal_mode=1 event is hidden from venue lineup", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Prohibition Warehouse" });
    const event = insertEvent(rawDb, {
      name: "Vol 17 Venue Hidden",
      slug: "venue-reveal-hidden",
      date: futureDate,
    });
    rawDb
      .prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?")
      .run(event.id);
    const perf = insertBand(rawDb, {
      name: "Hidden Venue Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb
      .prepare("UPDATE performances SET is_announced=0 WHERE id=?")
      .run(perf.id);

    const response = await onRequestGet({
      env,
      params: { id: String(venue.id) },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.upcoming).toHaveLength(0);
    expect(payload.past).toHaveLength(0);
  });

  test("announced performance in reveal_mode=1 event is shown in venue lineup", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Blue Room" });
    const event = insertEvent(rawDb, {
      name: "Vol 17 Venue Shown",
      slug: "venue-reveal-shown",
      date: futureDate,
    });
    rawDb
      .prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?")
      .run(event.id);
    const perf = insertBand(rawDb, {
      name: "Revealed Venue Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb
      .prepare("UPDATE performances SET is_announced=1 WHERE id=?")
      .run(perf.id);

    const response = await onRequestGet({
      env,
      params: { id: String(venue.id) },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.upcoming).toHaveLength(1);
    expect(payload.upcoming[0].band_name).toBe("Revealed Venue Band");
  });

  test("unannounced performance in reveal_mode=0 event is shown (gate is no-op)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const venue = insertVenue(rawDb, { name: "Roost" });
    const event = insertEvent(rawDb, {
      name: "Normal Venue Event",
      slug: "venue-reveal-mode0",
      date: futureDate,
    });
    rawDb
      .prepare("UPDATE events SET is_published=1, reveal_mode=0 WHERE id=?")
      .run(event.id);
    const perf = insertBand(rawDb, {
      name: "Normal Venue Band",
      event_id: event.id,
      venue_id: venue.id,
    });
    rawDb
      .prepare("UPDATE performances SET is_announced=0 WHERE id=?")
      .run(perf.id);

    const response = await onRequestGet({
      env,
      params: { id: String(venue.id) },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.upcoming).toHaveLength(1);
    expect(payload.upcoming[0].band_name).toBe("Normal Venue Band");
  });
});
