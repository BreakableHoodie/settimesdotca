import { expect, it, vi } from "vitest";

vi.mock("../../_middleware.js", () => ({
  checkPermission: async () => ({ error: false, user: { userId: 1, role: "editor" }, userId: 1 }),
  auditLog: vi.fn(async () => {}),
}));

import { onRequestPut } from "../[id].js";
import { createTestEnv, insertBand, insertEvent, insertVenue } from "../../../test-utils.js";

function put(env, id, body) {
  return onRequestPut({
    request: new Request(`https://example.test/api/admin/bands/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
    data: { user: { role: "editor", id: 2 } },
  });
}

it("rolls back the profile update when the performance update fails", async () => {
  const { env, rawDb } = createTestEnv({ role: "editor" });
  const event = insertEvent(rawDb, { name: "Atomicity Fest", slug: "put-atomicity" });
  const venue = insertVenue(rawDb, { name: "Atomicity Hall" });
  const performance = insertBand(rawDb, {
    name: "Atomicity Band",
    genre: "rock",
    event_id: event.id,
    venue_id: venue.id,
    start_time: "20:00",
    end_time: "21:00",
  });

  rawDb.exec(`
    CREATE TRIGGER fail_atomicity_performance_update
    BEFORE UPDATE OF notes ON performances
    BEGIN
      SELECT RAISE(ABORT, 'forced performance update failure');
    END
  `);

  // The shared test helper mirrors D1's API but does not provide rollback.
  // Use SQLite's transaction here so this test exercises the production guarantee.
  env.DB.batch = async (statements) => rawDb.transaction(() => statements.map((statement) => statement.run()))();

  const response = await put(env, performance.id, {
    genre: "metal",
    notes: "This update must fail",
  });

  expect(response.status).toBe(500);
  expect(rawDb.prepare("SELECT genre FROM band_profiles WHERE id = ?").get(performance.band_profile_id)).toEqual({
    genre: "rock",
  });
  expect(rawDb.prepare("SELECT notes FROM performances WHERE id = ?").get(performance.id)).toEqual({ notes: null });
});
