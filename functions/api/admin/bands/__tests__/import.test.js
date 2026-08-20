// Bulk band import endpoint tests
// POST /api/admin/bands/import
import { describe, expect, test, vi } from "vitest";

vi.mock("../../_middleware.js", () => ({
  checkPermission: async (context) => {
    const role = context?.data?.user?.role || context?.request?.headers?.get("x-test-role");
    if (!role) {
      return {
        error: true,
        response: new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
    return { error: false, user: { userId: 1, email: "a@b.c", role }, userId: 1 };
  },
  auditLog: vi.fn(async () => {}),
}));

import { onRequestPost } from "../import.js";
import { createTestEnv, insertBand, insertEvent, insertVenue } from "../../../test-utils.js";

function importRequest(env, payload) {
  return onRequestPost({
    request: new Request("https://example.test/api/admin/bands/import", {
      method: "POST",
      headers: { "x-test-role": "editor", "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
    env,
    data: { user: { userId: 1, email: "a@b.c", role: "editor" } },
  });
}

describe("POST /api/admin/bands/import", () => {
  // import.js validated start_time and end_time individually but never compared
  // them, so it accepted zero-length sets that bands.js, bands/[id].js and
  // wizard.js all rejected. It was the only one of the four write paths missing
  // the rule; the import is all-or-nothing, so one bad row writes nothing.
  test("rejects a row whose end_time equals its start_time, writing nothing", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Fest", slug: "fest-zero-length" });
    insertVenue(rawDb, { name: "The Hall" });

    const res = await importRequest(env, {
      event_id: event.id,
      bands: [
        { name: "Good Band", start_time: "20:00", end_time: "21:00", venue: "The Hall" },
        { name: "Zero Length", start_time: "21:00", end_time: "21:00", venue: "The Hall" },
      ],
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body.errors ?? body)).toMatch(/cannot be the same/i);

    // All-or-nothing: the valid row must not have landed either.
    const perfCount = rawDb.prepare("SELECT COUNT(*) AS c FROM performances WHERE event_id = ?").get(event.id);
    expect(perfCount.c).toBe(0);
  });

  test("still accepts a row that crosses midnight", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Fest", slug: "fest-crosses-midnight" });
    insertVenue(rawDb, { name: "The Hall" });

    const res = await importRequest(env, {
      event_id: event.id,
      bands: [{ name: "After Midnight", start_time: "23:30", end_time: "00:30", venue: "The Hall" }],
    });

    expect(res.status).toBe(201);
  });

  test("imports new bands as performances for the event", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Fest", slug: "fest" });
    insertVenue(rawDb, { name: "The Hall" });

    const res = await importRequest(env, {
      event_id: event.id,
      bands: [
        {
          name: "Alpha",
          start_time: "20:00",
          end_time: "21:00",
          venue: "The Hall",
          genre: "rock",
        },
        {
          name: "Beta",
          start_time: "21:00",
          end_time: "22:00",
          venue: "The Hall",
          genre: "jazz",
        },
      ],
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.imported).toBe(2);

    const perfCount = rawDb.prepare("SELECT COUNT(*) AS c FROM performances WHERE event_id = ?").get(event.id);
    expect(perfCount.c).toBe(2);

    const alpha = rawDb.prepare("SELECT * FROM band_profiles WHERE name_normalized = 'alpha'").get();
    expect(alpha).toBeTruthy();
    expect(alpha.genre).toBe("rock");
  });

  test("rejects the whole import and writes nothing if any row is invalid (atomic)", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Fest", slug: "fest" });
    insertVenue(rawDb, { name: "The Hall" });

    const res = await importRequest(env, {
      event_id: event.id,
      bands: [
        { name: "Good", start_time: "20:00", end_time: "21:00", venue: "The Hall" },
        { name: "Bad", venue: "No Such Venue" },
      ],
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);

    const perfCount = rawDb.prepare("SELECT COUNT(*) AS c FROM performances WHERE event_id = ?").get(event.id);
    expect(perfCount.c).toBe(0);
    const profileCount = rawDb
      .prepare("SELECT COUNT(*) AS c FROM band_profiles WHERE name_normalized IN ('good','bad')")
      .get();
    expect(profileCount.c).toBe(0);
  });

  test("reuses an existing band profile instead of duplicating it", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Fest", slug: "fest" });
    insertVenue(rawDb, { name: "The Hall" });
    insertBand(rawDb, { name: "Alpha", event_id: event.id });

    const res = await importRequest(env, {
      event_id: event.id,
      bands: [{ name: "Alpha", start_time: "20:00", end_time: "21:00", venue: "The Hall" }],
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.createdProfiles).toBe(0);

    const profiles = rawDb.prepare("SELECT COUNT(*) AS c FROM band_profiles WHERE name_normalized = 'alpha'").get();
    expect(profiles.c).toBe(1);
  });
});
