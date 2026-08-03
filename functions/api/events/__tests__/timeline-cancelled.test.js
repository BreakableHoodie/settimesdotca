/**
 * Timeline API — is_cancelled on the "upcoming" and "past" bands lists (#732).
 *
 * The "now" query already excludes cancelled sets entirely (JOIN condition,
 * commit 3a69596) — that is correct and unconditional, since directing a fan
 * to a band that is not playing right now is the worst failure mode of this
 * feature. But "upcoming" and "past" are explicitly NOT supposed to exclude
 * cancelled rows (a fan browsing an upcoming lineup needs to see a cancelled
 * set struck through, not have it silently vanish) — so those two queries
 * must instead PROJECT `is_cancelled` on every band so the frontend
 * (EventTimeline.jsx's collapsed "Featured Bands Preview") can mark it.
 * Before this fix, the SELECT simply never selected the column, so every
 * band in `upcoming[].bands` / `past[].bands` rendered identically whether
 * cancelled or not.
 */
import { describe, expect, it } from "vitest";
import { onRequestGet as timelineHandler } from "../timeline.js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../test-utils.js";

describe("Timeline real-DB — is_cancelled surfaces on upcoming[].bands (#732)", () => {
  it("a cancelled set stays in upcoming[].bands with is_cancelled: 1, alongside a scheduled set with is_cancelled: 0", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    // Far enough out to land unambiguously in "upcoming".
    const farFuture = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const event = insertEvent(rawDb, {
      name: "Upcoming Cancelled Set Event",
      slug: "timeline-upcoming-cancelled",
      date: farFuture,
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    const venue = insertVenue(rawDb, { name: "Room 47" });
    const cancelledPerf = insertBand(rawDb, {
      name: "Deer Fang",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });
    rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(cancelledPerf.id);
    insertBand(rawDb, {
      name: "Sam Nabi",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "21:30",
      end_time: "22:30",
    });

    const request = new Request("https://example.test/api/events/timeline");
    const response = await timelineHandler({ request, env });
    expect(response.status).toBe(200);
    const data = await response.json();

    const found = data.upcoming.find((e) => e.id === event.id);
    expect(found).toBeDefined();

    // The row is NOT excluded -- unlike "now", "upcoming" must keep it visible.
    expect(found.bands).toHaveLength(2);

    const cancelledBand = found.bands.find((b) => b.name === "Deer Fang");
    const scheduledBand = found.bands.find((b) => b.name === "Sam Nabi");
    expect(cancelledBand).toBeDefined();
    expect(scheduledBand).toBeDefined();

    // The property must exist and be exactly 1/0 -- toBe(1) fails with
    // "Received: undefined" if the SELECT stops projecting the column, which
    // is a different failure than a wrong-but-present falsy default would
    // produce, so this also proves the assertion isn't vacuous against a
    // missing-field regression.
    expect(cancelledBand.is_cancelled).toBe(1);
    expect(scheduledBand.is_cancelled).toBe(0);
  });

  it("a cancelled set also surfaces is_cancelled: 1 in past[].bands", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const event = insertEvent(rawDb, {
      name: "Past Cancelled Set Event",
      slug: "timeline-past-cancelled",
      date: "2020-01-01",
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    const venue = insertVenue(rawDb, { name: "Blue Room" });
    const cancelledPerf = insertBand(rawDb, {
      name: "Deer Fang",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });
    rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(cancelledPerf.id);

    const request = new Request("https://example.test/api/events/timeline");
    const response = await timelineHandler({ request, env });
    expect(response.status).toBe(200);
    const data = await response.json();

    const found = data.past.find((e) => e.id === event.id);
    expect(found).toBeDefined();
    expect(found.bands).toHaveLength(1);
    expect(found.bands[0].is_cancelled).toBe(1);
  });
});
