import { describe, it, expect } from "vitest";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../test-utils";
import * as scheduleHandler from "../schedule.js";

describe("GET /api/schedule - reveal mode", () => {
  it("returns all bands when reveal_mode is off", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-reveal-off", status: "draft" });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(ev.id);
    const venue = insertVenue(rawDb, { name: "Venue A" });
    insertBand(rawDb, { name: "Announced Band", event_id: ev.id, venue_id: venue.id });
    const unannounced = insertBand(rawDb, { name: "Hidden Band", event_id: ev.id, venue_id: venue.id });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(unannounced.id);

    const req = new Request("https://example.test/api/schedule?event=vol6-reveal-off");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    // reveal_mode=0: all bands returned regardless of is_announced
    expect(data.bands.length).toBe(2);
    expect(data.event.reveal_mode).toBe(0);
  });

  it("filters unannounced bands when reveal_mode is on", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-reveal-on" });
    rawDb.prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?").run(ev.id);
    const venue = insertVenue(rawDb, { name: "Venue B" });
    const announced = insertBand(rawDb, { name: "Visible Band", event_id: ev.id, venue_id: venue.id });
    rawDb.prepare("UPDATE performances SET is_announced=1 WHERE id=?").run(announced.id);
    const hidden = insertBand(rawDb, { name: "Hidden Band", event_id: ev.id, venue_id: venue.id });
    rawDb.prepare("UPDATE performances SET is_announced=0 WHERE id=?").run(hidden.id);

    const req = new Request("https://example.test/api/schedule?event=vol6-reveal-on");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bands.length).toBe(1);
    expect(data.bands[0].name).toBe("Visible Band");
    expect(data.event.reveal_mode).toBe(1);
  });

  it("includes reveal_mode in event metadata", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "Vol6", slug: "vol6-meta" });
    rawDb.prepare("UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?").run(ev.id);

    const req = new Request("https://example.test/api/schedule?event=vol6-meta");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    const data = await res.json();
    expect(data.event.reveal_mode).toBe(1);
  });
});
