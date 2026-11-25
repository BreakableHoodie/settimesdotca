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

  // The rollback is the only thing standing between a mid-import failure and a
  // half-imported lineup, and nothing ran it: replacing the compensating DELETE
  // with a no-op left every test green. The failure must happen at EXECUTION
  // time, so a trigger aborts the third performance INSERT (a bad table name
  // would throw while the statement is built and prove nothing).
  function seedMidImportFailure() {
    const ctx = createTestEnv();
    const { rawDb } = ctx;
    const event = insertEvent(rawDb, { name: "Fest", slug: "fest-rollback" });
    insertVenue(rawDb, { name: "The Hall" });
    insertBand(rawDb, { name: "Alpha", event_id: event.id });
    rawDb.exec(`
      CREATE TRIGGER fail_boom_performance BEFORE INSERT ON performances
      WHEN (SELECT name_normalized FROM band_profiles WHERE id = NEW.band_profile_id) = 'boom'
      BEGIN SELECT RAISE(ABORT, 'forced mid-import failure'); END;
    `);
    const before = {
      perfs: rawDb.prepare("SELECT COUNT(*) AS c FROM performances").get().c,
      profiles: rawDb.prepare("SELECT COUNT(*) AS c FROM band_profiles").get().c,
    };
    const payload = {
      event_id: event.id,
      bands: [
        { name: "Alpha", start_time: "18:00", end_time: "19:00", venue: "The Hall" },
        { name: "Bravo New", start_time: "19:30", end_time: "20:30", venue: "The Hall" },
        { name: "Boom", start_time: "21:00", end_time: "22:00", venue: "The Hall" },
      ],
    };
    return { ...ctx, before, payload };
  }

  test("a write that fails mid-import rolls back everything the import created", async () => {
    const { env, rawDb, before, payload } = seedMidImportFailure();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await importRequest(env, payload);
      expect(res.status).toBe(500);

      // Earlier rows (a reused profile and a NEW profile, each with a
      // performance) and the failing row's own new profile must all be gone;
      // the pre-existing Alpha profile must survive.
      expect(rawDb.prepare("SELECT COUNT(*) AS c FROM performances").get().c).toBe(before.perfs);
      expect(rawDb.prepare("SELECT COUNT(*) AS c FROM band_profiles").get().c).toBe(before.profiles);
      expect(rawDb.prepare("SELECT COUNT(*) AS c FROM band_profiles WHERE name_normalized = 'alpha'").get().c).toBe(1);
      expect(
        rawDb.prepare("SELECT COUNT(*) AS c FROM band_profiles WHERE name_normalized IN ('bravo new', 'boom')").get().c,
      ).toBe(0);
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("a rollback that itself fails still logs the original error and answers 500", async () => {
    const { env, payload } = seedMidImportFailure();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const realPrepare = env.DB.prepare.bind(env.DB);
    env.DB = {
      ...env.DB,
      prepare(sql) {
        if (sql.startsWith("DELETE FROM performances")) throw new Error("rollback DELETE exploded");
        return realPrepare(sql);
      },
    };
    try {
      const res = await importRequest(env, payload);
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe("Import failed");

      const detail = errorSpy.mock.calls.flat().find((a) => a && typeof a === "object" && "rollbackError" in a);
      expect(detail, "the rollback failure is logged").toBeTruthy();
      expect(String(detail.error.message)).toMatch(/forced mid-import failure/);
      expect(String(detail.rollbackError.message)).toMatch(/rollback DELETE exploded/);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
