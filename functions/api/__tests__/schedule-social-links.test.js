import { describe, it, expect, vi } from "vitest";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../test-utils";
import * as scheduleHandler from "../schedule.js";
import { logger } from "../../utils/logger.js";

// #678 item 4: a corrupted social_links row previously failed JSON.parse
// silently (empty catch, no log), dropping the band's link with zero trace.
// The band must still render (no crash, url: null) but the bad row must now
// be observable via the logger.
describe("GET /api/schedule - malformed social_links (#678 item 4)", () => {
  it("nulls url and logs when a band's social_links is malformed JSON", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    try {
      const ev = insertEvent(rawDb, { name: "Corrupt Fest", slug: "corrupt-social-links" });
      rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(ev.id);
      const venue = insertVenue(rawDb, { name: "Venue C" });
      // Bypass insertBand's JSON.stringify to seed a genuinely malformed value.
      insertBand(rawDb, {
        name: "Broken Links Band",
        event_id: ev.id,
        venue_id: venue.id,
        social_links: "{not valid json",
      });

      const req = new Request("https://example.test/api/schedule?event=corrupt-social-links");
      const res = await scheduleHandler.onRequestGet({ request: req, env });

      // Behaviour unchanged: request still succeeds, band still present, url nulled.
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.bands).toHaveLength(1);
      expect(data.bands[0].url).toBeNull();

      // Newly observable: the bad row is logged instead of silently ignored.
      expect(errorSpy).toHaveBeenCalledWith(
        "schedule: malformed social_links JSON for band",
        expect.objectContaining({ bandId: expect.anything(), error: expect.anything() }),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
