import { describe, expect, it } from "vitest";
import { onRequestGet } from "../stats/[name].js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../test-utils.js";

// #1246 -- per-set planned_count on GET /api/bands/stats/:name, floored at 3.

function seed() {
  const { env, rawDb } = createTestEnv();
  env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
  const event = insertEvent(rawDb, { name: "Planned Event", slug: "planned-evt", date: "2099-08-02" });
  rawDb.prepare("UPDATE events SET status = 'published' WHERE id = ?").run(event.id);
  const venue = insertVenue(rawDb, { name: "Roost" });
  const band = insertBand(rawDb, { name: "Planned Band", event_id: event.id, venue_id: venue.id });
  return { env, rawDb, event, venue, band };
}

function plan(rawDb, eventId, performanceId, hashes) {
  const stmt = rawDb.prepare("INSERT INTO schedule_builds (event_id, performance_id, visitor_hash) VALUES (?, ?, ?)");
  for (const h of hashes) stmt.run(eventId, performanceId, h);
}

async function fetchStats(env) {
  const request = new Request("https://example.test/api/bands/stats/Planned%20Band");
  const response = await onRequestGet({ request, env, params: {} });
  return response.json();
}

describe("GET /api/bands/stats/:name - planned_count (#1246)", () => {
  it("counts the distinct planners of this set only", async () => {
    const { env, rawDb, event, venue, band } = seed();
    plan(rawDb, event.id, band.id, ["a", "b", "c"]);
    // A different set at the same event, and the same performance id recorded
    // under another event: neither belongs to this count.
    const other = insertBand(rawDb, { name: "Other Band", event_id: event.id, venue_id: venue.id });
    plan(rawDb, event.id, other.id, ["a", "b", "c", "d", "e"]);
    const event2 = insertEvent(rawDb, { name: "Second", slug: "planned-evt-2", date: "2099-09-02" });
    plan(rawDb, event2.id, band.id, ["x", "y", "z", "w"]);

    const body = await fetchStats(env);
    expect(body.upcoming).toHaveLength(1);
    expect(body.upcoming[0].planned_count).toBe(3);
  });

  it("returns null under the floor, never the small number", async () => {
    const { env, rawDb, event, band } = seed();
    plan(rawDb, event.id, band.id, ["a", "b"]);

    const body = await fetchStats(env);
    expect(body.upcoming[0].planned_count).toBeNull();
    expect(JSON.stringify(body.upcoming[0])).not.toMatch(/"planned_count":2/);
  });

  it("returns null for a cancelled set however many planned it", async () => {
    const { env, rawDb, event, band } = seed();
    plan(rawDb, event.id, band.id, ["a", "b", "c", "d", "e"]);
    rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(band.id);

    const body = await fetchStats(env);
    expect(body.upcoming[0].is_cancelled).toBe(1);
    expect(body.upcoming[0].planned_count).toBeNull();
  });

  it("counts anonymised rows like any other", async () => {
    const { env, rawDb, event, band } = seed();
    plan(rawDb, event.id, band.id, ["anon:1", "anon:2", "anon:3", "a"]);

    const body = await fetchStats(env);
    expect(body.upcoming[0].planned_count).toBe(4);
  });

  it("emits planned_count in the past list too", async () => {
    const { env, rawDb, event, band } = seed();
    rawDb.prepare("UPDATE events SET status = 'archived' WHERE id = ?").run(event.id);
    plan(rawDb, event.id, band.id, ["a", "b", "c"]);

    const body = await fetchStats(env);
    expect(body.past).toHaveLength(1);
    expect(body.past[0].planned_count).toBe(3);
  });
});
