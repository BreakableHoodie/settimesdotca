import { describe, expect, it } from "vitest";
import { createTestEnv, insertEvent, insertVenue } from "../../../test-utils";
import * as bandsHandler from "../../bands.js";

describe("Admin bands API - smoke", () => {
  it("can create a band for an event", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });

    const ev = insertEvent(rawDb, { name: "BandEvent", slug: "band-event" });

    const venue = insertVenue(rawDb, { name: "Main Venue" });
    const body = {
      eventId: ev.id,
      venueId: venue.id,
      name: "New Band",
      startTime: "18:00",
      endTime: "19:00",
    };
    const request = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bandsHandler.onRequestPost({ request, env });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.band).toHaveProperty("id");
    expect(data.band.name).toBe("New Band");
  });

  it("duplicate band name returns 409", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "DupEvent", slug: "dup-event" });
    const venue = insertVenue(rawDb, { name: "Dup Venue" });

    const body = {
      eventId: ev.id,
      venueId: venue.id,
      name: "SameBand",
      startTime: "18:00",
      endTime: "19:00",
    };
    const req1 = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const r1 = await bandsHandler.onRequestPost({ request: req1, env });
    expect(r1.status).toBe(201);

    const req2 = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const r2 = await bandsHandler.onRequestPost({ request: req2, env });
    expect(r2.status).toBe(409);
  });

  it("conflict detection finds overlapping times at the same venue", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "ConflictEvent",
      slug: "conflict-event",
    });
    const venue = insertVenue(rawDb, { name: "Conflict Venue" });

    // Existing band
    const body1 = {
      eventId: ev.id,
      venueId: venue.id,
      name: "Band One",
      startTime: "18:00",
      endTime: "19:00",
    };
    const req1 = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body1),
    });
    const r1 = await bandsHandler.onRequestPost({ request: req1, env });
    expect(r1.status).toBe(201);

    // Overlapping band
    const body2 = {
      eventId: ev.id,
      venueId: venue.id,
      name: "Band Two",
      startTime: "18:30",
      endTime: "19:30",
    };
    const req2 = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body2),
    });
    const r2 = await bandsHandler.onRequestPost({ request: req2, env });
    expect(r2.status).toBe(201);
    const data2 = await r2.json();
    expect(data2.conflicts).toBeDefined();
    expect(data2.conflicts.length).toBeGreaterThan(0);
  });

  it("GET /api/admin/bands?event_id returns bands with venue and event names", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "ListEvent", slug: "list-event" });
    const venue = insertVenue(rawDb, { name: "List Venue" });
    const body = {
      eventId: ev.id,
      venueId: venue.id,
      name: "List Band",
      startTime: "18:00",
      endTime: "19:00",
    };
    const req = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const r = await bandsHandler.onRequestPost({ request: req, env });
    expect(r.status).toBe(201);

    const getReq = new Request(
      `https://example.test/api/admin/bands?event_id=${ev.id}`,
      {
        headers: { ...headers },
      }
    );
    const getRes = await bandsHandler.onRequestGet({ request: getReq, env });
    expect(getRes.status).toBe(200);
    const list = await getRes.json();
    expect(list.bands[0]).toHaveProperty("venue_name");
    expect(list.bands[0]).toHaveProperty("event_name");
  });
});
