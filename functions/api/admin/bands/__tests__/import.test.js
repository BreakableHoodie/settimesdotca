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
