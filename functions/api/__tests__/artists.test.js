import { describe, it, expect } from "vitest";
import { createTestEnv, insertEvent, insertBand, insertVenue } from "../test-utils";
import * as artists from "../artists.js";

function seedEnv() {
  const { env, rawDb } = createTestEnv({ role: "editor" });
  env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
  return { env, rawDb };
}

function publish(rawDb, eventId) {
  rawDb.prepare("UPDATE events SET is_published = 1 WHERE id = ?").run(eventId);
}

async function getArtists(env, query = "") {
  return artists.onRequestGet({
    request: new Request(`https://example.test/api/artists${query}`),
    env,
  });
}

describe("Public artists directory - GET /api/artists", () => {
  it("lists only artists who performed at a published or archived event", async () => {
    const { env, rawDb } = seedEnv();
    const venue = insertVenue(rawDb, { name: "Main" });

    const pub = insertEvent(rawDb, { name: "Pub", slug: "pub-evt" });
    publish(rawDb, pub.id);
    insertBand(rawDb, {
      name: "Published Band",
      event_id: pub.id,
      venue_id: venue.id,
      genre: "punk",
    });

    const arch = insertEvent(rawDb, {
      name: "Arch",
      slug: "arch-evt",
      status: "archived",
    });
    insertBand(rawDb, {
      name: "Archived Band",
      event_id: arch.id,
      venue_id: venue.id,
    });

    // Draft event -> not published, not archived -> excluded
    const draft = insertEvent(rawDb, {
      name: "Draft",
      slug: "draft-evt",
      status: "draft",
    });
    insertBand(rawDb, {
      name: "Draft Band",
      event_id: draft.id,
      venue_id: venue.id,
    });

    const res = await getArtists(env);
    expect(res.status).toBe(200);
    const { artists: list } = await res.json();
    const names = list.map((a) => a.name);
    expect(names).toContain("Published Band");
    expect(names).toContain("Archived Band");
    expect(names).not.toContain("Draft Band");

    const pubBand = list.find((a) => a.name === "Published Band");
    expect(pubBand.performance_count).toBeGreaterThanOrEqual(1);
    expect(pubBand).toHaveProperty("photo_url");
  });

  it("filters by search query (name or genre), case-insensitive", async () => {
    const { env, rawDb } = seedEnv();
    const venue = insertVenue(rawDb, { name: "Main" });
    const ev = insertEvent(rawDb, { name: "E", slug: "e-evt" });
    publish(rawDb, ev.id);
    insertBand(rawDb, {
      name: "The Punks",
      event_id: ev.id,
      venue_id: venue.id,
      genre: "punk",
    });
    insertBand(rawDb, {
      name: "Jazz Cats",
      event_id: ev.id,
      venue_id: venue.id,
      genre: "jazz",
    });

    const res = await getArtists(env, "?q=JAZZ");
    const { artists: list } = await res.json();
    const names = list.map((a) => a.name);
    expect(names).toContain("Jazz Cats");
    expect(names).not.toContain("The Punks");
  });

  it("returns 503 when public data is gated off", async () => {
    const { env } = seedEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "false";
    const res = await getArtists(env);
    expect(res.status).toBe(503);
  });

  it("orders results alphabetically ignoring a leading article (#587)", async () => {
    const { env, rawDb } = seedEnv();
    const venue = insertVenue(rawDb, { name: "Main" });
    const ev = insertEvent(rawDb, { name: "Sort Fest", slug: "sort-fest" });
    publish(rawDb, ev.id);

    // Inserted out of both raw-name and article-stripped order.
    for (const name of ["Zebras", "The Anti-Queens", "Beatles", "An Horse"]) {
      insertBand(rawDb, { name, event_id: ev.id, venue_id: venue.id });
    }

    const res = await getArtists(env);
    expect(res.status).toBe(200);
    const { artists: list } = await res.json();
    const names = list.map((a) => a.name);

    // Article-stripped order: Anti-Queens, Beatles, Horse, Zebras — NOT the
    // raw-byte order (which would put "The Anti-Queens" under T, after "Beatles").
    expect(names).toEqual(["The Anti-Queens", "Beatles", "An Horse", "Zebras"]);
  });
});
