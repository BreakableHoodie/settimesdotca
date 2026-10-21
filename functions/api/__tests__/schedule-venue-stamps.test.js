import { describe, it, expect } from "vitest";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../test-utils";
import * as scheduleHandler from "../schedule.js";

// #1248: poster-led event pages stamp each set with its venue's short name in
// the venue's fixed ink. Both come through /api/schedule; the short name is
// derived server-side so the client never re-implements it.
describe("GET /api/schedule - venue stamps (#1248)", () => {
  async function scheduleFor(venueFields, ink) {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "Vol", slug: "stamps" });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id = ?").run(ev.id);
    const venue = insertVenue(rawDb, venueFields);
    rawDb.prepare("UPDATE venues SET ink_color = ? WHERE id = ?").run(ink, venue.id);
    insertBand(rawDb, { name: "Stamped", event_id: ev.id, venue_id: venue.id });
    const res = await scheduleHandler.onRequestGet({
      request: new Request("https://example.test/api/schedule?event=stamps"),
      env,
    });
    expect(res.status).toBe(200);
    return (await res.json()).bands[0];
  }

  it("returns the venue's short name and ink", async () => {
    const band = await scheduleFor({ name: "Blue Room (Inside Revive Karaoke)" }, "#2b55a3");
    expect(band.venue).toBe("Blue Room (Inside Revive Karaoke)");
    expect(band.venue_short).toBe("Blue Room");
    expect(band.venue_ink).toBe("#2b55a3");
  });

  it("returns a null ink for a venue without one", async () => {
    const band = await scheduleFor({ name: "Roost" }, null);
    expect(band.venue_short).toBe("Roost");
    expect(band.venue_ink).toBeNull();
  });
});
