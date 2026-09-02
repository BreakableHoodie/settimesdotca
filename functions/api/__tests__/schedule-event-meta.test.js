import { describe, it, expect } from "vitest";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../test-utils";
import * as scheduleHandler from "../schedule.js";

// #1063: /api/schedule now projects the event's age_restriction and
// presented_by onto its eventMetadata so the fan-facing schedule bar can show
// them. Regression coverage for the read path: both must flow through, and be
// null when unset.
describe("GET /api/schedule - event age_restriction/presented_by (#1063)", () => {
  function seedEvent(rawDb, slug) {
    const ev = insertEvent(rawDb, { name: "Vol18", slug });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(ev.id);
    const venue = insertVenue(rawDb, { name: "Roost", city: "Waterloo" });
    insertBand(rawDb, { name: "Test Band", event_id: ev.id, venue_id: venue.id });
    return ev;
  }

  it("projects age_restriction and presented_by when set", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = seedEvent(rawDb, "vol18-meta-set");
    rawDb
      .prepare("UPDATE events SET age_restriction = ?, presented_by = ? WHERE id = ?")
      .run("19+", "Downtown Waterloo BIA", ev.id);

    const req = new Request("https://example.test/api/schedule?event=vol18-meta-set");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event.age_restriction).toBe("19+");
    expect(data.event.presented_by).toBe("Downtown Waterloo BIA");
  });

  it("returns null for both when unset", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    seedEvent(rawDb, "vol18-meta-unset");

    const req = new Request("https://example.test/api/schedule?event=vol18-meta-unset");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event.age_restriction).toBeNull();
    expect(data.event.presented_by).toBeNull();
  });
});
