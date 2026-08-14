import { describe, it, expect } from "vitest";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../test-utils";
import * as scheduleHandler from "../schedule.js";

// #767: buildDirectionsHrefForBand's fallback hardcoded "Waterloo ON", which is
// wrong for events outside Waterloo Region (Buddies Fest 2 was in Tillsonburg).
// schedule.js now projects each venue's own city as venue_city so the frontend
// can scope its fallback search to the venue's real city. Regression coverage
// for the read path: venue_city must flow through /api/schedule.
describe("GET /api/schedule - venue_city (#767)", () => {
  it("returns the venue's city when it has one", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "BF2", slug: "bf2-venue-city" });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(ev.id);
    const venue = insertVenue(rawDb, { name: "The Mill", city: "Tillsonburg" });
    insertBand(rawDb, { name: "City Band", event_id: ev.id, venue_id: venue.id });

    const req = new Request("https://example.test/api/schedule?event=bf2-venue-city");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bands.length).toBe(1);
    expect(data.bands[0].venue_city).toBe("Tillsonburg");
  });

  it("returns null venue_city when the venue has none", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "Vol18", slug: "vol18-no-city" });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(ev.id);
    const venue = insertVenue(rawDb, { name: "Roost", city: null });
    insertBand(rawDb, { name: "No City Band", event_id: ev.id, venue_id: venue.id });

    const req = new Request("https://example.test/api/schedule?event=vol18-no-city");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bands.length).toBe(1);
    expect(data.bands[0].venue_city).toBeNull();
  });
});
