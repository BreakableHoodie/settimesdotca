import { describe, it, expect } from "vitest";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../test-utils";
import * as scheduleHandler from "../schedule.js";

// #725 added a genre chip to BandCard, but the fan-facing schedule endpoint
// never selected or returned `genre`, so the chip never rendered in
// production even though every band profile had one populated. Regression
// coverage for the read path: genre must flow through /api/schedule.
describe("GET /api/schedule - genre (#725)", () => {
  it("returns genre for a band that has one", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "Vol17", slug: "vol17-genre" });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(ev.id);
    const venue = insertVenue(rawDb, { name: "Blue Room" });
    insertBand(rawDb, { name: "Genre Band", event_id: ev.id, venue_id: venue.id, genre: "Indie Rock" });

    const req = new Request("https://example.test/api/schedule?event=vol17-genre");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bands.length).toBe(1);
    expect(data.bands[0].genre).toBe("Indie Rock");
  });

  it("returns null genre when the band profile has none", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "Vol17", slug: "vol17-no-genre" });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(ev.id);
    const venue = insertVenue(rawDb, { name: "Roost" });
    insertBand(rawDb, { name: "No Genre Band", event_id: ev.id, venue_id: venue.id });

    const req = new Request("https://example.test/api/schedule?event=vol17-no-genre");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bands.length).toBe(1);
    expect(data.bands[0].genre).toBeNull();
  });
});
