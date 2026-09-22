import { describe, expect, it, vi } from "vitest";

vi.mock("../../_middleware.js", () => ({
  checkPermission: async (context, required) => {
    const role = context?.data?.user?.role || context?.request?.headers?.get("x-test-role");
    if (!role || (required === "editor" && role === "viewer")) {
      return { error: true, response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) };
    }
    return { error: false, user: { userId: 2, role } };
  },
}));

import { onRequestPut } from "../[id]/schedule.js";
import { createTestEnv, insertBand, insertEvent, insertVenue } from "../../../test-utils.js";

function call(env, eventId, changes, role = "editor") {
  return onRequestPut({
    request: new Request(`https://example.test/api/admin/events/${eventId}/schedule`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-test-role": role },
      body: JSON.stringify({ changes }),
    }),
    params: { id: String(eventId) },
    env,
    data: { user: { userId: role === "admin" ? 1 : role === "editor" ? 2 : 3, role } },
  });
}

function setup(status = "draft") {
  const { env, rawDb } = createTestEnv({ role: "editor" });
  const event = insertEvent(rawDb, {
    name: "Schedule Event",
    slug: `schedule-${Math.random()}`,
    date: "2026-08-01",
    status,
  });
  const venue = insertVenue(rawDb, { name: "The Hall" });
  const first = insertBand(rawDb, {
    name: "Alpha",
    event_id: event.id,
    venue_id: venue.id,
    start_time: "20:00",
    end_time: "21:00",
  });
  const second = insertBand(rawDb, {
    name: "Beta",
    event_id: event.id,
    venue_id: venue.id,
    start_time: "21:00",
    end_time: "22:00",
  });
  return { env, rawDb, event, venue, first, second };
}

function stored(rawDb, id) {
  return rawDb.prepare("SELECT start_time, end_time, venue_id FROM performances WHERE id = ?").get(id);
}

describe("PUT /api/admin/events/:id/schedule", () => {
  it("swaps two sets atomically and returns both final rows", async () => {
    const { env, rawDb, event, venue, first, second } = setup();
    const res = await call(env, event.id, [
      { id: first.id, startTime: "21:00", endTime: "22:00", venueId: venue.id },
      { id: second.id, startTime: "20:00", endTime: "21:00", venueId: venue.id },
    ]);
    expect(res.status).toBe(200);
    expect(stored(rawDb, first.id)).toEqual({ start_time: "21:00", end_time: "22:00", venue_id: venue.id });
    expect(stored(rawDb, second.id)).toEqual({ start_time: "20:00", end_time: "21:00", venue_id: venue.id });
    expect((await res.json()).updated).toBe(2);
  });

  it("rejects a final overlap without changing any row or writing an audit", async () => {
    const { env, rawDb, event, venue, first, second } = setup();
    const before = [stored(rawDb, first.id), stored(rawDb, second.id)];
    const res = await call(env, event.id, [
      { id: first.id, startTime: "20:30", endTime: "21:30", venueId: venue.id },
      { id: second.id, startTime: "21:00", endTime: "22:00", venueId: venue.id },
    ]);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.conflicts[0].a.name).toBe("Alpha");
    expect(body.conflicts[0].b.name).toBe("Beta");
    expect([stored(rawDb, first.id), stored(rawDb, second.id)]).toEqual(before);
    expect(
      rawDb.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action = 'event.schedule_updated'").get().count,
    ).toBe(0);
  });

  it("keeps after-midnight swaps valid", async () => {
    const { env, rawDb, event, venue, first, second } = setup();
    rawDb.prepare("UPDATE performances SET start_time = '23:30', end_time = '00:30' WHERE id = ?").run(first.id);
    rawDb.prepare("UPDATE performances SET start_time = '00:30', end_time = '01:30' WHERE id = ?").run(second.id);
    const res = await call(env, event.id, [
      { id: first.id, startTime: "00:30", endTime: "01:30", venueId: venue.id },
      { id: second.id, startTime: "23:30", endTime: "00:30", venueId: venue.id },
    ]);
    expect(res.status).toBe(200);
  });

  it("does not conflict across festival days, venues, or TBD times", async () => {
    const { env, rawDb, event, venue, first, second } = setup();
    const otherVenue = insertVenue(rawDb, { name: "Second Hall" });
    rawDb.prepare("UPDATE performances SET performance_date = ? WHERE id = ?").run("2026-08-02", second.id);
    const dayRes = await call(env, event.id, [
      { id: first.id, startTime: "21:00", endTime: "22:00", venueId: venue.id },
    ]);
    expect(dayRes.status).toBe(200);
    const venueRes = await call(env, event.id, [
      { id: first.id, startTime: "20:30", endTime: "21:30", venueId: otherVenue.id },
    ]);
    expect(venueRes.status).toBe(200);
    const tbdRes = await call(env, event.id, [{ id: first.id, startTime: null, endTime: null, venueId: venue.id }]);
    expect(tbdRes.status).toBe(200);
  });

  it("ignores a pre-existing clash between untouched rows", async () => {
    const { env, rawDb, event, venue, first, second } = setup();
    const third = insertBand(rawDb, {
      name: "Third",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:30",
      end_time: "21:30",
    });
    const res = await call(env, event.id, [{ id: first.id, startTime: "18:00", endTime: "19:00", venueId: venue.id }]);
    expect(res.status).toBe(200);
    expect(stored(rawDb, third.id)).toEqual({ start_time: "20:30", end_time: "21:30", venue_id: venue.id });
    expect(stored(rawDb, second.id)).toEqual({ start_time: "21:00", end_time: "22:00", venue_id: venue.id });
  });

  it("writes one audit row in the same successful batch", async () => {
    const { env, rawDb, event, first } = setup();
    const res = await call(env, event.id, [{ id: first.id, startTime: "18:00", endTime: "19:00", venueId: null }]);
    expect(res.status).toBe(200);
    const audit = rawDb
      .prepare(
        "SELECT action, resource_type, resource_id, details FROM audit_log WHERE action = 'event.schedule_updated'",
      )
      .get();
    expect(audit).toMatchObject({ action: "event.schedule_updated", resource_type: "event", resource_id: event.id });
    expect(JSON.parse(audit.details).changes[0].to.startTime).toBe("18:00");
  });

  it.each([
    ["archived event", () => setup("archived"), 400],
    ["nonexistent event", () => ({ ...setup(), event: { id: 999999 } }), 404],
  ])("rejects %s", async (_label, makeSetup, status) => {
    const { env, event, first, venue } = makeSetup();
    const res = await call(env, event.id, [{ id: first.id, startTime: "18:00", endTime: "19:00", venueId: venue.id }]);
    expect(res.status).toBe(status);
  });

  // Both guards below run only when something goes wrong, so each is tested by
  // FORCING that failure (CLAUDE.md: verify guards against the failure they
  // guard, not the success).
  it("refuses, and writes nothing, when the event is archived between the read and the batch", async () => {
    const { env, rawDb, event, venue, first, second } = setup("published");
    const before = [stored(rawDb, first.id), stored(rawDb, second.id)];
    const realBatch = env.DB.batch.bind(env.DB);
    env.DB.batch = async (statements) => {
      rawDb.prepare("UPDATE events SET status = 'archived' WHERE id = ?").run(event.id);
      return realBatch(statements);
    };
    const res = await call(env, event.id, [
      { id: first.id, startTime: "21:00", endTime: "22:00", venueId: venue.id },
      { id: second.id, startTime: "20:00", endTime: "21:00", venueId: venue.id },
    ]);
    expect(res.status).toBe(409);
    expect([stored(rawDb, first.id), stored(rawDb, second.id)]).toEqual(before);
    expect(
      rawDb.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action = 'event.schedule_updated'").get().count,
    ).toBe(0);
  });

  it("reports success when D1 omits meta.changes, because only an explicit 0 means not applied", async () => {
    const { env, rawDb, event, venue, first, second } = setup();
    const realBatch = env.DB.batch.bind(env.DB);
    env.DB.batch = async (statements) =>
      (await realBatch(statements)).map((result) => ({ ...result, meta: undefined }));
    const res = await call(env, event.id, [
      { id: first.id, startTime: "21:00", endTime: "22:00", venueId: venue.id },
      { id: second.id, startTime: "20:00", endTime: "21:00", venueId: venue.id },
    ]);
    expect(res.status).toBe(200);
    expect(stored(rawDb, first.id).start_time).toBe("21:00");
  });

  it("rejects invalid rows, ownership, venue and permissions", async () => {
    const fixture = setup();
    const { env, rawDb, event, first, venue } = fixture;
    const otherEvent = insertEvent(rawDb, { name: "Other Event", slug: "other-event" });
    const otherPerformance = insertBand(rawDb, { name: "Other Band", event_id: otherEvent.id, venue_id: venue.id });
    expect((await call(env, event.id, [], "editor")).status).toBe(400);
    expect(
      (
        await call(
          env,
          event.id,
          Array.from({ length: 201 }, () => ({
            id: first.id,
            startTime: "18:00",
            endTime: "19:00",
            venueId: venue.id,
          })),
        )
      ).status,
    ).toBe(400);
    expect(
      (await call(env, event.id, [{ id: first.id, startTime: "25:99", endTime: "19:00", venueId: venue.id }])).status,
    ).toBe(400);
    expect(
      (await call(env, event.id, [{ id: first.id, startTime: "18:00", endTime: "18:00", venueId: venue.id }])).status,
    ).toBe(400);
    expect(
      (await call(env, event.id, [{ id: first.id, startTime: "18:00", endTime: "19:00", venueId: 999999 }])).status,
    ).toBe(404);
    expect(
      (
        await call(env, event.id, [
          { id: first.id, startTime: "18:00", endTime: "19:00", venueId: venue.id },
          { id: first.id, startTime: "19:00", endTime: "20:00", venueId: venue.id },
        ])
      ).status,
    ).toBe(400);
    expect(
      (await call(env, event.id, [{ id: 999999, startTime: "18:00", endTime: "19:00", venueId: venue.id }])).status,
    ).toBe(400);
    expect(
      (
        await call(env, event.id, [
          { id: otherPerformance.id, startTime: "18:00", endTime: "19:00", venueId: venue.id },
        ])
      ).status,
    ).toBe(400);
    expect(
      (await call(env, event.id, [{ id: first.id, startTime: "18:00", endTime: "19:00", venueId: venue.id }], "viewer"))
        .status,
    ).toBe(403);
  });
});
