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

// The "now" query is the riskiest gate in this feature and had no test.
// Two distinct properties, and the second is the one a careless refactor
// breaks: moving `AND p.is_cancelled = 0` from the JOIN condition to a WHERE
// clause demotes the LEFT JOIN to an effective INNER JOIN, which drops the
// EVENT ROW ENTIRELY when every one of its sets is cancelled. The event would
// vanish from "Happening Now" on the night it is running.
describe("Timeline real-DB — the 'now' query excludes cancelled sets (#732)", () => {
  const todayLocal = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const yesterdayLocal = () =>
    new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

  // A multi-day event running yesterday -> today is unambiguously "now": the
  // #569 doors/start edge gates only an event's FIRST day, so day 2+ is never
  // re-gated. A single-day event dated today would instead flip between
  // "upcoming" and "now" depending on the wall clock at test time -- passing
  // after 20:00 and failing before it.
  const seedRunningEvent = (rawDb, { name, slug }) => {
    const event = insertEvent(rawDb, {
      name,
      slug,
      date: yesterdayLocal(),
      end_date: todayLocal(),
      status: "published",
    });
    return event;
  };

  it("drops a cancelled set from now[].bands while keeping its scheduled sibling", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const venue = insertVenue(rawDb, { name: "Room 47" });
    const event = seedRunningEvent(rawDb, { name: "Tonight Fest", slug: "tonight-fest" });

    const cancelled = insertBand(rawDb, {
      name: "Deer Fang",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });
    insertBand(rawDb, {
      name: "Sam Nabi",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "21:00",
      end_time: "22:00",
    });
    rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(cancelled.id);

    const response = await timelineHandler({ request: new Request("https://example.test/api/events/timeline"), env });
    expect(response.status).toBe(200);
    const data = await response.json();

    const found = data.now.find((e) => e.id === event.id);
    expect(found).toBeDefined();
    // Assert on WHO is there, not just how many -- a count alone would pass
    // if the wrong one were dropped.
    expect(found.bands.map((b) => b.name)).toEqual(["Sam Nabi"]);
  });

  it("still returns the event when EVERY set is cancelled (LEFT JOIN must not become INNER)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const venue = insertVenue(rawDb, { name: "Blue Room" });
    const event = seedRunningEvent(rawDb, { name: "All Off Fest", slug: "all-off-fest" });

    const only = insertBand(rawDb, {
      name: "Deer Fang",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });
    rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(only.id);

    const response = await timelineHandler({ request: new Request("https://example.test/api/events/timeline"), env });
    const data = await response.json();

    // The event survives with an empty lineup. Under a WHERE-clause refactor
    // it disappears from the timeline altogether.
    const found = data.now.find((e) => e.id === event.id);
    expect(found).toBeDefined();
    expect(found.bands).toEqual([]);
  });
});

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
