import { describe, it, expect } from "vitest";
import { onRequestGet as timelineHandler } from "../timeline.js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../test-utils.js";
import { eventLocalToday } from "../../../utils/eventDay.js";

// `age_restriction` and `presented_by` landed in #1065 and were wired into
// /api/schedule and the event page -- but NOT into /api/events/timeline, which
// backs the cards on the homepage. So the surface most people browse showed
// neither, while the event page showed both. Reported from production.
//
// This is the projection-gap class (`performance_date`, #739 -> #741 -> #743):
// a column exists, one endpoint selects it, another silently does not, and the
// UI difference reads as a rendering bug rather than a missing SELECT.
//
// Real DB rather than the mocked matcher in timeline.test.js, deliberately:
// the whole question is which COLUMNS the SQL returns, and a mock keyed on
// WHERE-clause substrings cannot answer that -- it would pass against a
// projection that never mentions either column.
function isoDaysFromNow(days) {
  const [year, month, day] = eventLocalToday().split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

async function getTimeline(env) {
  const res = await timelineHandler({
    request: new Request("https://example.test/api/events/timeline"),
    env,
  });
  expect(res.status).toBe(200);
  return res.json();
}

function seedEvent(rawDb, overrides = {}) {
  const event = insertEvent(rawDb, {
    name: "Door Policy Fest",
    slug: "door-policy-fest",
    date: isoDaysFromNow(14),
    status: "published",
    ...overrides,
  });
  const venue = insertVenue(rawDb, { name: "Blue Room" });
  insertBand(rawDb, {
    name: "Gate Crashers",
    event_id: event.id,
    venue_id: venue.id,
    start_time: "20:00",
    end_time: "21:00",
  });
  return event;
}

describe("GET /api/events/timeline — card carries age restriction and presenter (#1065)", () => {
  it("returns both fields on an upcoming event", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = seedEvent(rawDb);
    rawDb
      .prepare("UPDATE events SET age_restriction = ?, presented_by = ? WHERE id = ?")
      .run("19+", "Fat Scheid & Pink Lemonade Records", event.id);

    const body = await getTimeline(env);
    const card = (body.upcoming || []).find((e) => e.slug === "door-policy-fest");

    expect(card).toBeDefined();
    expect(card.age_restriction).toBe("19+");
    expect(card.presented_by).toBe("Fat Scheid & Pink Lemonade Records");
  });

  it("returns null rather than undefined when neither is set", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    seedEvent(rawDb);

    const body = await getTimeline(env);
    const card = (body.upcoming || []).find((e) => e.slug === "door-policy-fest");

    expect(card).toBeDefined();
    // Present as an explicit null: the client renders conditionally, and a
    // missing KEY is indistinguishable from a projection that dropped it --
    // which is exactly the bug this file guards.
    expect(card.age_restriction).toBeNull();
    expect(card.presented_by).toBeNull();
  });

  it("carries them on a LIVE event, the third SELECT block", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const today = eventLocalToday();
    const event = seedEvent(rawDb, { slug: "live-door-policy", date: today });
    // Doors at 00:00 puts the day-one "started" edge behind us whatever the
    // wall clock says, so this lands in `now` deterministically rather than
    // depending on what time the suite runs. Day one's edge is
    // doors -> first set -> local midnight, earliest wins (CLAUDE.md,
    // "events.doors_json + the 'started' start edge").
    rawDb
      .prepare("UPDATE events SET age_restriction = ?, presented_by = ?, doors_json = ? WHERE id = ?")
      .run("19+", "Live Promoter", JSON.stringify({ [today]: "00:00" }), event.id);

    const body = await getTimeline(env);
    const card = (body.now || []).find((e) => e.slug === "live-door-policy");

    expect(card).toBeDefined();
    expect(card.age_restriction).toBe("19+");
    expect(card.presented_by).toBe("Live Promoter");
  });

  it("carries them on a PAST event too, not just upcoming", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = seedEvent(rawDb, {
      slug: "past-door-policy",
      date: isoDaysFromNow(-30),
      status: "archived",
    });
    rawDb
      .prepare("UPDATE events SET age_restriction = ?, presented_by = ? WHERE id = ?")
      .run("All Ages", "Some Promoter", event.id);

    const body = await getTimeline(env);
    const card = (body.past || []).find((e) => e.slug === "past-door-policy");

    // There are THREE SELECT blocks in this handler (now / upcoming / past).
    // Patching one and not the others is the same defect one bucket over, so
    // the past bucket is asserted rather than assumed.
    expect(card).toBeDefined();
    expect(card.age_restriction).toBe("All Ages");
    expect(card.presented_by).toBe("Some Promoter");
  });
});
