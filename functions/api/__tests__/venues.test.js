import { describe, it, expect } from "vitest";
import {
  createTestEnv,
  insertEvent,
  insertBand,
  insertVenue,
} from "../test-utils";
import * as venues from "../venues.js";
import * as venueDetail from "../venues/[id].js";

function seedEnv() {
  const { env, rawDb } = createTestEnv({ role: "editor" });
  env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
  return { env, rawDb };
}

function publish(rawDb, eventId) {
  rawDb.prepare("UPDATE events SET is_published = 1 WHERE id = ?").run(eventId);
}

async function getVenues(env, query = "") {
  return venues.onRequestGet({
    request: new Request(`https://example.test/api/venues${query}`),
    env,
  });
}

describe("Public venue directory - GET /api/venues", () => {
  it("lists only venues that hosted a performance at a published or archived event", async () => {
    const { env, rawDb } = seedEnv();

    const pub = insertEvent(rawDb, { name: "Pub", slug: "pub-evt" });
    publish(rawDb, pub.id);
    const roost = insertVenue(rawDb, { name: "Roost", city: "Waterloo" });
    insertBand(rawDb, { name: "B1", event_id: pub.id, venue_id: roost.id });

    const arch = insertEvent(rawDb, {
      name: "Arch",
      slug: "arch-evt",
      status: "archived",
    });
    const blue = insertVenue(rawDb, { name: "Blue Room", city: "Waterloo" });
    insertBand(rawDb, { name: "B2", event_id: arch.id, venue_id: blue.id });

    // Draft event venue -> excluded
    const draft = insertEvent(rawDb, {
      name: "Draft",
      slug: "draft-evt",
      status: "draft",
    });
    const secret = insertVenue(rawDb, {
      name: "Secret Venue",
      city: "Waterloo",
    });
    insertBand(rawDb, { name: "B3", event_id: draft.id, venue_id: secret.id });

    const res = await getVenues(env);
    expect(res.status).toBe(200);
    const { venues: list } = await res.json();
    const names = list.map((v) => v.name);
    expect(names).toContain("Roost");
    expect(names).toContain("Blue Room");
    expect(names).not.toContain("Secret Venue");

    const roostRow = list.find((v) => v.name === "Roost");
    expect(roostRow.performance_count).toBeGreaterThanOrEqual(1);
    expect(roostRow.location).toBe("Waterloo");
  });

  it("filters by search (name or city)", async () => {
    const { env, rawDb } = seedEnv();
    const ev = insertEvent(rawDb, { name: "E", slug: "e-evt" });
    publish(rawDb, ev.id);
    const a = insertVenue(rawDb, { name: "The Roost", city: "Waterloo" });
    const b = insertVenue(rawDb, { name: "Jazz Hall", city: "Kitchener" });
    insertBand(rawDb, { name: "X", event_id: ev.id, venue_id: a.id });
    insertBand(rawDb, { name: "Y", event_id: ev.id, venue_id: b.id });

    const res = await getVenues(env, "?q=kitchener");
    const { venues: list } = await res.json();
    const names = list.map((v) => v.name);
    expect(names).toContain("Jazz Hall");
    expect(names).not.toContain("The Roost");
  });

  it("returns 503 when public data is gated off", async () => {
    const { env } = seedEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "false";
    const res = await getVenues(env);
    expect(res.status).toBe(503);
  });
});

describe("Public venue detail - GET /api/venues/:id", () => {
  it("returns the venue with its lineup", async () => {
    const { env, rawDb } = seedEnv();
    const ev = insertEvent(rawDb, { name: "Crawl", slug: "crawl-evt" });
    publish(rawDb, ev.id);
    const roost = insertVenue(rawDb, { name: "Roost", city: "Waterloo" });
    insertBand(rawDb, {
      name: "Alpha",
      event_id: ev.id,
      venue_id: roost.id,
      start_time: "21:00",
      end_time: "22:00",
    });

    const res = await venueDetail.onRequestGet({
      params: { id: String(roost.id) },
      env,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.venue.name).toBe("Roost");
    expect(data.venue.location).toBe("Waterloo");
    expect(data.venue.performance_count).toBeGreaterThanOrEqual(1);
    const lineup = [...data.upcoming, ...data.past].map((p) => p.band_name);
    expect(lineup).toContain("Alpha");
  });

  it("returns 404 for an unknown venue", async () => {
    const { env } = seedEnv();
    const res = await venueDetail.onRequestGet({
      params: { id: "99999" },
      env,
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for an invalid id", async () => {
    const { env } = seedEnv();
    const res = await venueDetail.onRequestGet({ params: { id: "abc" }, env });
    expect(res.status).toBe(400);
  });

  it("returns 503 when gated off", async () => {
    const { env } = seedEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "false";
    const res = await venueDetail.onRequestGet({ params: { id: "1" }, env });
    expect(res.status).toBe(503);
  });
});
