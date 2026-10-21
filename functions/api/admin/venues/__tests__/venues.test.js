import { describe, it, expect } from "vitest";
import { createTestEnv, insertVenue, insertBand, insertEvent } from "../../../test-utils";
import * as venueIdHandler from "../[id].js";
import * as venuesHandler from "../../venues.js";
import { STAMP_INKS } from "../../../../utils/venueInk.js";

describe("Admin venues API - CRUD operations", () => {
  it("can create a venue and then list it", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });

    const body = { name: "The Roxy", address: "123 Main St" };
    const request = new Request("https://example.test/api/admin/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await venuesHandler.onRequestPost({ request, env });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.venue).toHaveProperty("id");
    expect(data.venue.name).toBe("The Roxy");

    // Now GET list
    const getReq = new Request("https://example.test/api/admin/venues", {
      headers: { ...headers },
    });
    const getRes = await venuesHandler.onRequestGet({ request: getReq, env });
    expect(getRes.status).toBe(200);
    const list = await getRes.json();
    expect(list.venues.some((v) => v.name === "The Roxy")).toBeTruthy();
  });

  it("GET /api/admin/venues returns venues with band_count", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const venue = insertVenue(rawDb, { name: "Count Venue" });
    const event = insertEvent(rawDb, { name: "Count Event", slug: "count-event" });
    insertBand(rawDb, { name: "Band 1", event_id: event.id, venue_id: venue.id });
    insertBand(rawDb, { name: "Band 2", event_id: event.id, venue_id: venue.id });

    const getReq = new Request("https://example.test/api/admin/venues", { headers });
    const getRes = await venuesHandler.onRequestGet({ request: getReq, env });
    expect(getRes.status).toBe(200);
    const list = await getRes.json();
    const countVenue = list.venues.find((v) => v.name === "Count Venue");
    expect(countVenue).toBeDefined();
    expect(countVenue.band_count).toBe(2);
  });

  it("PUT /api/admin/venues/{id} updates venue", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const v = insertVenue(rawDb, { name: "Old Name" });

    const putReq = new Request(`https://example.test/api/admin/venues/${v.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ name: "New Name", address: "55 Road" }),
    });
    const putRes = await venueIdHandler.onRequestPut({ request: putReq, env });
    expect(putRes.status).toBe(200);
    const data = await putRes.json();
    expect(data.venue.name).toBe("New Name");
    expect(data.venue.address).toBe("55 Road, Portland");
  });

  it("DELETE /api/admin/venues/{id} removes venue without bands", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const v = insertVenue(rawDb, { name: "Empty Venue" });

    const deleteReq = new Request(`https://example.test/api/admin/venues/${v.id}`, {
      method: "DELETE",
      headers: { ...headers },
    });
    const deleteRes = await venueIdHandler.onRequestDelete({ request: deleteReq, env });
    expect(deleteRes.status).toBe(200);
    const data = await deleteRes.json();
    expect(data.success).toBeTruthy();
  });
});

// Owner decision 2026-10-10: an editor builds editions, so an editor can CREATE
// a venue. Editing and deleting stay admin-only (a rename or delete rewrites
// every past edition held at that venue). Each role boundary is asserted from
// both sides, so loosening or tightening either gate fails a test.
describe("Admin venues API - role boundaries", () => {
  const post = (headers) =>
    new Request("https://example.test/api/admin/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ name: "Editor Hall", address: "1 King St N" }),
    });

  it("an editor can create a venue", async () => {
    const { env, headers } = createTestEnv({ role: "editor" });
    const res = await venuesHandler.onRequestPost({ request: post(headers), env });
    expect(res.status).toBe(201);
    expect((await res.json()).venue.name).toBe("Editor Hall");
  });

  it("a new venue is given the least-used stamp ink (#1248)", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const taken = insertVenue(rawDb, { name: "Already Inked" });
    rawDb.prepare("UPDATE venues SET ink_color = ? WHERE id = ?").run(STAMP_INKS[0], taken.id);
    const res = await venuesHandler.onRequestPost({ request: post(headers), env });
    expect(res.status).toBe(201);
    expect((await res.json()).venue.ink_color).toBe(STAMP_INKS[1]);
  });

  it("a viewer cannot create a venue", async () => {
    const { env, headers } = createTestEnv({ role: "viewer" });
    const res = await venuesHandler.onRequestPost({ request: post(headers), env });
    expect(res.status).toBe(403);
  });

  it("an editor cannot edit an existing venue", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const v = insertVenue(rawDb, { name: "Keep Me" });
    const req = new Request(`https://example.test/api/admin/venues/${v.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ name: "Renamed" }),
    });
    const res = await venueIdHandler.onRequestPut({ request: req, env });
    expect(res.status).toBe(403);
    expect(rawDb.prepare("SELECT name FROM venues WHERE id = ?").get(v.id).name).toBe("Keep Me");
  });

  it("an editor cannot delete a venue", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const v = insertVenue(rawDb, { name: "Still Here" });
    const req = new Request(`https://example.test/api/admin/venues/${v.id}`, {
      method: "DELETE",
      headers: { ...headers },
    });
    const res = await venueIdHandler.onRequestDelete({ request: req, env });
    expect(res.status).toBe(403);
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM venues WHERE id = ?").get(v.id).n).toBe(1);
  });
});

describe("Admin venues API - Validation", () => {
  it("create validation fails when name is missing", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });

    const body = { address: "123 Main St" };
    const request = new Request("https://example.test/api/admin/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await venuesHandler.onRequestPost({ request, env });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation error");
  });

  it("creating duplicate venue returns 409", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });

    const body = { name: "Duplicate Venue" };
    const req1 = new Request("https://example.test/api/admin/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const r1 = await venuesHandler.onRequestPost({ request: req1, env });
    expect(r1.status).toBe(201);

    const req2 = new Request("https://example.test/api/admin/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const r2 = await venuesHandler.onRequestPost({ request: req2, env });
    expect(r2.status).toBe(409);
  });

  it("update validation fails when name is missing", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const v = insertVenue(rawDb, { name: "Test Venue" });

    const putReq = new Request(`https://example.test/api/admin/venues/${v.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ address: "123 Main St" }),
    });
    const putRes = await venueIdHandler.onRequestPut({ request: putReq, env });
    expect(putRes.status).toBe(400);
    const data = await putRes.json();
    expect(data.error).toBe("Validation error");
  });

  it("update conflicts when renaming to existing venue name", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const v1 = insertVenue(rawDb, { name: "Venue 1" });
    insertVenue(rawDb, { name: "Taken" });

    const putReq = new Request(`https://example.test/api/admin/venues/${v1.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ name: "Taken" }),
    });
    const putRes = await venueIdHandler.onRequestPut({ request: putReq, env });
    expect(putRes.status).toBe(409);
  });

  it("update returns 404 for non-existent venue", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });

    const putReq = new Request("https://example.test/api/admin/venues/99999", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ name: "New Name" }),
    });
    const putRes = await venueIdHandler.onRequestPut({ request: putReq, env });
    expect(putRes.status).toBe(404);
  });

  it("delete returns 404 for non-existent venue", async () => {
    const { env, headers } = createTestEnv({ role: "admin" });

    const deleteReq = new Request("https://example.test/api/admin/venues/99999", {
      method: "DELETE",
      headers: { ...headers },
    });
    const deleteRes = await venueIdHandler.onRequestDelete({ request: deleteReq, env });
    expect(deleteRes.status).toBe(404);
  });
});

describe("Admin venues API - Conflicts", () => {
  it("cannot delete venue with bands attached", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "admin" });
    const venue = insertVenue(rawDb, { name: "Used Venue" });
    const event = insertEvent(rawDb, { name: "Test Event", slug: "test-event" });
    insertBand(rawDb, { name: "Attached Band", event_id: event.id, venue_id: venue.id });

    const deleteReq = new Request(`https://example.test/api/admin/venues/${venue.id}`, {
      method: "DELETE",
      headers: { ...headers },
    });
    const deleteRes = await venueIdHandler.onRequestDelete({ request: deleteReq, env });
    expect(deleteRes.status).toBe(409);
    const data = await deleteRes.json();
    expect(data.message).toContain("Cannot delete venue");
  });
});
