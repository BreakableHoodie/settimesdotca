import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDBEnv, createTestDB, insertEvent } from "../../../test-utils";
import * as wizardHandler from "../wizard.js";

vi.mock("../../_middleware.js", () => ({
  checkPermission: async (context) => {
    const { request } = context;
    const role = request.headers.get("x-test-role") || "editor";
    if (role !== "admin") {
      return {
        error: true,
        response: new Response(
          JSON.stringify({ error: "Forbidden", message: "Admin required" }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      };
    }
    return { error: false, user: { userId: 1, role: "admin" } };
  },
  auditLog: async () => {},
}));

function makeRequest(body, role = "admin") {
  return new Request("https://example.test/api/admin/events/wizard", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-role": role,
    },
    body: JSON.stringify(body),
  });
}

function futureDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

const basePayload = () => ({
  event: { name: "Test Fest", date: futureDate(), slug: "test-fest" },
  venues: [{ name: "The Venue", address: "123 Main St" }],
  bands: [
    { name: "Band One", venueIndex: 0, startTime: "20:00", endTime: "21:00" },
  ],
});

let rawDb;
let env;

beforeEach(() => {
  rawDb = createTestDB();
  env = { DB: createDBEnv(rawDb) };
});

describe("POST /api/admin/events/wizard - RBAC", () => {
  it("returns 403 for non-admin users", async () => {
    const res = await wizardHandler.onRequestPost({
      request: makeRequest(basePayload(), "editor"),
      env,
    });
    expect(res.status).toBe(403);
  });

  it("returns 201 for admin users", async () => {
    const res = await wizardHandler.onRequestPost({
      request: makeRequest(basePayload()),
      env,
    });
    expect(res.status).toBe(201);
  });
});

describe("POST /api/admin/events/wizard - event validation", () => {
  it("rejects past event date with 400", async () => {
    const payload = basePayload();
    payload.event.date = "2020-01-01";
    const res = await wizardHandler.onRequestPost({
      request: makeRequest(payload),
      env,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toMatch(/past date/i);
  });

  it("rejects duplicate slug with 409", async () => {
    insertEvent(rawDb, { slug: "test-fest" });
    const res = await wizardHandler.onRequestPost({
      request: makeRequest(basePayload()),
      env,
    });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/slug already exists/i);
  });
});

describe("POST /api/admin/events/wizard - venue validation", () => {
  it("rejects non-array venues with 400", async () => {
    const payload = { ...basePayload(), venues: "bad" };
    const res = await wizardHandler.onRequestPost({
      request: makeRequest(payload),
      env,
    });
    expect(res.status).toBe(400);
  });

  it("reuses existing venue by name (find-or-create)", async () => {
    const existingId = rawDb
      .prepare("INSERT INTO venues (name, address) VALUES (?, ?)")
      .run("The Venue", "123 Main St").lastInsertRowid;

    const res = await wizardHandler.onRequestPost({
      request: makeRequest(basePayload()),
      env,
    });
    expect(res.status).toBe(201);
    const data = await res.json();

    // The performance should reference the pre-existing venue, not a new one
    const perf = rawDb
      .prepare("SELECT * FROM performances WHERE event_id = ?")
      .get(data.event.id);
    expect(perf.venue_id).toBe(existingId);
  });
});

describe("POST /api/admin/events/wizard - band validation", () => {
  it("rejects missing startTime with 400", async () => {
    const payload = basePayload();
    delete payload.bands[0].startTime;
    const res = await wizardHandler.onRequestPost({
      request: makeRequest(payload),
      env,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/start and end time are required/i);
  });

  it("rejects out-of-range venueIndex with 400", async () => {
    const payload = basePayload();
    payload.bands[0].venueIndex = 5;
    const res = await wizardHandler.onRequestPost({
      request: makeRequest(payload),
      env,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/out of range/i);
  });

  it("rejects equal start and end time with 400", async () => {
    const payload = basePayload();
    payload.bands[0].startTime = "21:00";
    payload.bands[0].endTime = "21:00";
    const res = await wizardHandler.onRequestPost({
      request: makeRequest(payload),
      env,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/cannot be the same/i);
  });

  it("rejects midnight crossover exceeding 8 hours with 400", async () => {
    const payload = basePayload();
    payload.bands[0].startTime = "22:00";
    payload.bands[0].endTime = "07:00";
    const res = await wizardHandler.onRequestPost({
      request: makeRequest(payload),
      env,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/after start time/i);
  });

  it("accepts a valid midnight crossover within 8 hours", async () => {
    const payload = basePayload();
    payload.bands[0].startTime = "23:00";
    payload.bands[0].endTime = "01:00";
    const res = await wizardHandler.onRequestPost({
      request: makeRequest(payload),
      env,
    });
    expect(res.status).toBe(201);
  });

  it("rejects schedule conflicts between bands at the same venue with 409", async () => {
    const payload = basePayload();
    payload.bands.push({
      name: "Band Two",
      venueIndex: 0,
      startTime: "20:30",
      endTime: "21:30",
    });
    const res = await wizardHandler.onRequestPost({
      request: makeRequest(payload),
      env,
    });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/conflict/i);
  });
});

describe("POST /api/admin/events/wizard - successful creation", () => {
  it("creates event, venue, band profile, and performance in DB", async () => {
    const res = await wizardHandler.onRequestPost({
      request: makeRequest(basePayload()),
      env,
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.event.slug).toBe("test-fest");

    const perf = rawDb
      .prepare("SELECT * FROM performances WHERE event_id = ?")
      .get(data.event.id);
    expect(perf).toBeTruthy();
    expect(perf.start_time).toBe("20:00");

    const profile = rawDb
      .prepare("SELECT * FROM band_profiles WHERE id = ?")
      .get(perf.band_profile_id);
    expect(profile.name).toBe("Band One");
  });

  it("creates event without bands when bands array is empty", async () => {
    const payload = { ...basePayload(), bands: [] };
    const res = await wizardHandler.onRequestPost({
      request: makeRequest(payload),
      env,
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    const perfs = rawDb
      .prepare("SELECT * FROM performances WHERE event_id = ?")
      .all(data.event.id);
    expect(perfs.length).toBe(0);
  });
});
