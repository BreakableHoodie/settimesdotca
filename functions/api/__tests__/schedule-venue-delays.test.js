import { describe, it, expect } from "vitest";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../test-utils";
import * as scheduleHandler from "../schedule.js";

// #1249: the fan event page reads each venue's "running late" banner from
// /api/schedule. Only a delay above zero is a banner, and an archived event
// has nothing running late.
describe("GET /api/schedule - venue_delays (#1249)", () => {
  function seed(rawDb, slug, status = "published") {
    const ev = insertEvent(rawDb, { name: "Vol19", slug });
    rawDb.prepare("UPDATE events SET status = ? WHERE id = ?").run(status, ev.id);
    const blue = insertVenue(rawDb, { name: "Blue Room" });
    const roost = insertVenue(rawDb, { name: "Roost" });
    insertBand(rawDb, { name: "Band A", event_id: ev.id, venue_id: blue.id });
    const delay = rawDb.prepare(
      "INSERT INTO event_venue_delays (event_id, venue_id, delay_minutes, last_shift_id) VALUES (?, ?, ?, 'seed')",
    );
    delay.run(ev.id, blue.id, 15);
    delay.run(ev.id, roost.id, 0); // back on time: no banner
    return { ev, blue };
  }

  const get = async (env, slug) =>
    (
      await scheduleHandler.onRequestGet({
        request: new Request(`https://example.test/api/schedule?event=${slug}`),
        env,
      })
    ).json();

  it("lists only venues whose delay is above zero", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const { blue } = seed(rawDb, "vol19-late");
    const data = await get(env, "vol19-late");
    expect(data.event.venue_delays).toEqual([
      { venueId: blue.id, venue: "Blue Room", minutes: 15, updatedAt: expect.any(String) },
    ]);
  });

  it("an archived event shows no banner, whatever its rows say", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    seed(rawDb, "vol19-done", "archived");
    expect((await get(env, "vol19-done")).event.venue_delays).toEqual([]);
  });
});
