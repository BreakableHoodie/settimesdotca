import { describe, expect, it, vi } from "vitest";

vi.mock("../../_middleware.js", () => ({
  checkPermission: async () => ({ error: false, user: { userId: 1, email: "test@example.com", role: "editor" } }),
  auditLog: vi.fn(async () => {}),
}));

import { onRequestPut as onRequestSchedule } from "../../events/[id]/schedule.js";
import { onRequestPost as onRequestCreate } from "../../bands.js";
import { onRequestPut as onRequestBandPut } from "../[id].js";
import { onRequestPost as onRequestBulkAdd } from "../bulk.js";
import { createTestEnv, insertBand, insertEvent, insertVenue } from "../../../test-utils.js";

function request(url, method, body) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function context(env, req, params = {}) {
  return { env, request: req, params, data: { user: { userId: 1, role: "editor" } } };
}

function fixture() {
  const { env, rawDb } = createTestEnv({ role: "editor" });
  const event = insertEvent(rawDb, { name: "Venue Validation", slug: `venue-validation-${Math.random()}` });
  const venue = insertVenue(rawDb, { name: "Existing Venue" });
  const performance = insertBand(rawDb, {
    name: "Existing Band",
    event_id: event.id,
    venue_id: venue.id,
    start_time: "20:00",
    end_time: "21:00",
  });
  return { env, rawDb, event, venue, performance };
}

describe("venue ID validation at admin write boundaries", () => {
  it("rejects a boolean venueId in the schedule handler without changing the row", async () => {
    const { env, rawDb, event, performance } = fixture();
    const before = rawDb.prepare("SELECT venue_id FROM performances WHERE id = ?").get(performance.id);
    const res = await onRequestSchedule(
      context(
        env,
        request(`https://example.test/api/admin/events/${event.id}/schedule`, "PUT", {
          changes: [{ id: performance.id, startTime: "20:00", endTime: "21:00", venueId: true }],
        }),
        { id: String(event.id) },
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Validation error", message: "Invalid venue ID" });
    expect(rawDb.prepare("SELECT venue_id FROM performances WHERE id = ?").get(performance.id)).toEqual(before);
  });

  it.each([
    ["performance", String(1)],
    ["profile", "profile_1"],
  ])("rejects a boolean venueId in the %s PUT path without changing the row", async (kind, id) => {
    const { env, rawDb, performance } = fixture();
    const before = rawDb.prepare("SELECT venue_id FROM performances WHERE id = ?").get(performance.id);
    const res = await onRequestBandPut(
      context(env, request(`https://example.test/api/admin/bands/${id}`, "PUT", { venueId: true })),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Validation error", message: "Invalid venue ID" });
    expect(rawDb.prepare("SELECT venue_id FROM performances WHERE id = ?").get(performance.id)).toEqual(before);
  });

  it("rejects a boolean venueId when creating a band without creating rows", async () => {
    const { env, rawDb, event } = fixture();
    const before = rawDb.prepare("SELECT COUNT(*) AS count FROM performances").get().count;
    const res = await onRequestCreate(
      context(
        env,
        request("https://example.test/api/admin/bands", "POST", {
          eventId: event.id,
          name: "Should Not Be Created",
          venueId: true,
        }),
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Validation error", message: "Invalid venue ID" });
    expect(rawDb.prepare("SELECT COUNT(*) AS count FROM performances").get().count).toBe(before);
  });

  it("rejects a boolean venue_id in bulk add without changing the lineup", async () => {
    const { env, rawDb, event, performance } = fixture();
    const before = rawDb.prepare("SELECT venue_id FROM performances WHERE id = ?").get(performance.id);
    const res = await onRequestBulkAdd(
      context(
        env,
        request("https://example.test/api/admin/bands/bulk", "POST", {
          band_profile_ids: [performance.band_profile_id],
          event_id: event.id,
          venue_id: true,
        }),
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Validation error", message: "Invalid venue ID" });
    expect(rawDb.prepare("SELECT venue_id FROM performances WHERE id = ?").get(performance.id)).toEqual(before);
  });
});
