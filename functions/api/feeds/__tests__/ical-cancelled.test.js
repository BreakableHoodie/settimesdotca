import { describe, expect, it } from "vitest";
import { onRequestGet } from "../ical.js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../test-utils.js";

describe("GET /api/feeds/ical — cancelled sets", () => {
  it("emits STATUS:CANCELLED on a cancelled VEVENT and not on a scheduled one", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const futureDate = "2099-12-15";
    const event = insertEvent(rawDb, {
      name: "Cancelled Ical Event",
      slug: "ical-cancelled",
      date: futureDate,
    });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Blue Room" });

    // Insert one cancelled set and one scheduled set
    const cancelledPerf = insertBand(rawDb, {
      name: "Deer Fang",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });
    rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(cancelledPerf.id);

    // Inserted for its side effect only — the assertions below find it by name.
    insertBand(rawDb, {
      name: "Sam Nabi",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "21:30",
      end_time: "22:30",
    });

    const request = new Request("https://example.test/api/feeds/ical");
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(200);
    const body = await response.text();

    const events = body.split("BEGIN:VEVENT").slice(1);
    const cancelled = events.find((e) => e.includes("Deer Fang"));
    const scheduled = events.find((e) => e.includes("Sam Nabi"));

    expect(cancelled).toContain("STATUS:CANCELLED");
    // The negative half is what proves the line is conditional, not constant.
    expect(scheduled).not.toContain("STATUS:CANCELLED");
  });
});
