// #1249: "venue running late +N min". Every refusal asserts the DATABASE is
// unchanged (times, the delay row, the audit log), not just the status: a
// refusal that still moved one set would pass a status-only check.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_middleware.js", () => ({
  checkPermission: async (context, required) => {
    const role = context?.data?.user?.role;
    if (!role || (required === "editor" && role === "viewer")) {
      return { error: true, response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) };
    }
    return { error: false, user: { userId: 2, role } };
  },
}));

import { onRequestDelete, onRequestPost } from "../[id]/venues/[venueId]/delay.js";
import { onRequestGet as listDelays } from "../[id]/venue-delays.js";
import { createTestEnv, insertBand, insertEvent, insertVenue } from "../../../test-utils.js";

afterEach(() => vi.useRealTimers());

// A date far ahead: every set is "remaining" unless a test pins the clock.
const FUTURE = "2099-10-11";

function call(handler, env, { eventId, venueId, minutes, role = "editor" }) {
  return handler({
    request: new Request(`https://example.test/api/admin/events/${eventId}/venues/${venueId}/delay`, {
      method: handler === onRequestPost ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: handler === onRequestPost ? JSON.stringify({ minutes }) : undefined,
    }),
    params: { id: String(eventId), venueId: String(venueId) },
    env,
    data: { user: { userId: 2, role } },
  });
}

function setup({
  date = FUTURE,
  status = "published",
  sets = [
    ["Alpha", "21:00", "21:45"],
    ["Beta", "22:00", "22:45"],
  ],
} = {}) {
  const { env, rawDb } = createTestEnv({ role: "editor" });
  const event = insertEvent(rawDb, { name: "Late Night", slug: `late-${Math.random()}`, date, status });
  const venue = insertVenue(rawDb, { name: "Blue Room" });
  const other = insertVenue(rawDb, { name: "Roost" });
  // insertBand has no is_cancelled parameter (it silently drops it), so the
  // flag is set here; otherwise a "cancelled" fixture is just another set.
  const rows = sets.map(([name, start, end, extra = {}]) => {
    const row = insertBand(rawDb, { name, event_id: event.id, venue_id: venue.id, start_time: start, end_time: end });
    if (extra.is_cancelled) rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(row.id);
    return row;
  });
  return { env, rawDb, event, venue, other, rows };
}

const times = (rawDb, id) => rawDb.prepare("SELECT start_time, end_time FROM performances WHERE id = ?").get(id);
const delayRow = (rawDb, eventId, venueId) =>
  rawDb
    .prepare("SELECT delay_minutes, revision FROM event_venue_delays WHERE event_id = ? AND venue_id = ?")
    .get(eventId, venueId);
const audits = (rawDb, action = "venue.delay_shifted") =>
  rawDb
    .prepare("SELECT details FROM audit_log WHERE action = ?")
    .all(action)
    .map((row) => JSON.parse(row.details));

describe("POST .../venues/:venueId/delay", () => {
  it("shifts every remaining set at the venue, records the delay, and writes one audit row", async () => {
    const { env, rawDb, event, venue, rows } = setup();
    const res = await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes: 15 });
    expect(res.status).toBe(200);
    expect(times(rawDb, rows[0].id)).toEqual({ start_time: "21:15", end_time: "22:00" });
    expect(times(rawDb, rows[1].id)).toEqual({ start_time: "22:15", end_time: "23:00" });
    expect(delayRow(rawDb, event.id, venue.id)).toEqual({ delay_minutes: 15, revision: 1 });
    const [audit, ...extra] = audits(rawDb);
    expect(extra).toEqual([]);
    expect(audit).toMatchObject({ venueId: venue.id, minutes: 15, totalMinutes: 15 });
    expect(audit.changes).toHaveLength(2);
  });

  it("is cumulative: +15 then +15 reads 30 and moves the sets 30", async () => {
    const { env, rawDb, event, venue, rows } = setup();
    await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes: 15 });
    const res = await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes: 15 });
    expect((await res.json()).delayMinutes).toBe(30);
    expect(times(rawDb, rows[0].id)).toEqual({ start_time: "21:30", end_time: "22:15" });
    expect(delayRow(rawDb, event.id, venue.id)).toEqual({ delay_minutes: 30, revision: 2 });
  });

  it("crosses midnight within the night: 23:50 +15 is 00:05, same festival day", async () => {
    const { env, rawDb, event, venue, rows } = setup({ sets: [["Late", "23:50", "00:30"]] });
    expect((await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes: 15 })).status).toBe(200);
    expect(times(rawDb, rows[0].id)).toEqual({ start_time: "00:05", end_time: "00:45" });
    expect(
      rawDb.prepare("SELECT performance_date FROM performances WHERE id = ?").get(rows[0].id).performance_date,
    ).toBeNull();
  });

  it("skips cancelled sets and leaves other venues alone", async () => {
    const { env, rawDb, event, venue, other, rows } = setup({
      sets: [
        ["Pulled", "21:00", "21:45", { is_cancelled: 1 }],
        ["On", "22:00", "22:45"],
      ],
    });
    const elsewhere = insertBand(rawDb, {
      name: "Elsewhere",
      event_id: event.id,
      venue_id: other.id,
      start_time: "22:00",
      end_time: "22:45",
    });
    await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes: 15 });
    expect(times(rawDb, rows[0].id)).toEqual({ start_time: "21:00", end_time: "21:45" });
    expect(times(rawDb, rows[1].id)).toEqual({ start_time: "22:15", end_time: "23:00" });
    expect(times(rawDb, elsewhere.id)).toEqual({ start_time: "22:00", end_time: "22:45" });
  });

  it("leaves a set that has already started where it is (Toronto clock)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T01:30:00Z")); // 21:30 EDT on 2026-10-11
    const { env, rawDb, event, venue, rows } = setup({ date: "2026-10-11" });
    await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes: 15 });
    expect(times(rawDb, rows[0].id)).toEqual({ start_time: "21:00", end_time: "21:45" });
    expect(times(rawDb, rows[1].id)).toEqual({ start_time: "22:15", end_time: "23:00" });
  });

  it("refuses a shift across 06:00 into the next festival day, writing nothing", async () => {
    const { env, rawDb, event, venue, rows } = setup({ sets: [["Dawn", "05:50", "05:58"]] });
    const res = await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes: 15 });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("SHIFT_CROSSES_FESTIVAL_DAY");
    expect(times(rawDb, rows[0].id)).toEqual({ start_time: "05:50", end_time: "05:58" });
    expect(delayRow(rawDb, event.id, venue.id)).toBeUndefined();
    expect(audits(rawDb)).toEqual([]);
  });

  it("refuses a shift that would clash with a set that already started, writing nothing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T00:15:00Z")); // 20:15 EDT: the 20:00 set has started
    const { env, rawDb, event, venue, rows } = setup({
      date: "2026-10-11",
      sets: [
        ["Playing", "20:00", "21:00"],
        ["Next", "21:00", "22:00"],
      ],
    });
    // Already 30 late, so pulling back 30 is in range and only the clash refuses it.
    rawDb
      .prepare(
        "INSERT INTO event_venue_delays (event_id, venue_id, delay_minutes, last_shift_id) VALUES (?, ?, 30, 'seed')",
      )
      .run(event.id, venue.id);
    const res = await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes: -30 });
    expect(res.status).toBe(409);
    expect((await res.json()).conflicts).toHaveLength(1);
    expect(times(rawDb, rows[1].id)).toEqual({ start_time: "21:00", end_time: "22:00" });
    expect(delayRow(rawDb, event.id, venue.id)).toEqual({ delay_minutes: 30, revision: 1 });
  });

  it("two simultaneous taps never stack: the one that loses the claim writes nothing", async () => {
    const { env, rawDb, event, venue, rows } = setup();
    await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes: 15 });
    // Another request commits its shift between this one's read and its batch.
    const batch = env.DB.batch.bind(env.DB);
    env.DB.batch = async (statements) => {
      rawDb
        .prepare("UPDATE event_venue_delays SET revision = revision + 1, last_shift_id = 'other' WHERE event_id = ?")
        .run(event.id);
      env.DB.batch = batch;
      return batch(statements);
    };
    const res = await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes: 15 });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("DELAY_CHANGED");
    expect(times(rawDb, rows[0].id)).toEqual({ start_time: "21:15", end_time: "22:00" }); // only the first shift
    expect(delayRow(rawDb, event.id, venue.id).delay_minutes).toBe(15);
    expect(audits(rawDb)).toHaveLength(1);
  });

  // A per-row edit, a move between venues, or a cancel landing between this
  // request's read and its batch: the claim's snapshot no longer matches, so
  // nothing is written and the other edit survives (#1249 review).
  const raceThenShift = async (mutate) => {
    const { env, rawDb, event, venue, other, rows } = setup();
    const batch = env.DB.batch.bind(env.DB);
    env.DB.batch = async (statements) => {
      mutate(rawDb, { event, venue, other, rows });
      env.DB.batch = batch;
      return batch(statements);
    };
    const res = await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes: 15 });
    return { res, rawDb, event, venue, other, rows };
  };

  it("a set edited meanwhile is not overwritten: 409, nothing shifted", async () => {
    const { res, rawDb, event, venue, rows } = await raceThenShift((db, { rows }) =>
      db.prepare("UPDATE performances SET start_time = '23:00', end_time = '23:45' WHERE id = ?").run(rows[0].id),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("DELAY_CHANGED");
    expect(times(rawDb, rows[0].id)).toEqual({ start_time: "23:00", end_time: "23:45" }); // the edit survives
    expect(times(rawDb, rows[1].id)).toEqual({ start_time: "22:00", end_time: "22:45" });
    expect(delayRow(rawDb, event.id, venue.id)).toBeUndefined();
    expect(audits(rawDb)).toEqual([]);
  });

  it("a set moved to another venue meanwhile is not dragged along or written back: 409", async () => {
    const { res, rawDb, other, rows } = await raceThenShift((db, { other, rows }) =>
      db.prepare("UPDATE performances SET venue_id = ? WHERE id = ?").run(other.id, rows[0].id),
    );
    expect(res.status).toBe(409);
    expect(rawDb.prepare("SELECT venue_id, start_time FROM performances WHERE id = ?").get(rows[0].id)).toEqual({
      venue_id: other.id,
      start_time: "21:00",
    });
  });

  it("a set added to the venue meanwhile, or one cancelled meanwhile, refuses the shift", async () => {
    const added = await raceThenShift((db, { event, venue }) =>
      insertBand(db, {
        name: "Walk-in",
        event_id: event.id,
        venue_id: venue.id,
        start_time: "23:00",
        end_time: "23:30",
      }),
    );
    expect(added.res.status).toBe(409);
    const cancelled = await raceThenShift((db, { rows }) =>
      db.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(rows[1].id),
    );
    expect(cancelled.res.status).toBe(409);
    expect(times(cancelled.rawDb, cancelled.rows[0].id)).toEqual({ start_time: "21:00", end_time: "21:45" });
  });

  it("with no change count from D1, the outcome is read back, not assumed", async () => {
    // Applied: the nonce is in the row, so this is a success.
    const ok = setup();
    const okBatch = ok.env.DB.batch.bind(ok.env.DB);
    ok.env.DB.batch = async (statements) => (await okBatch(statements)).map(() => ({}));
    expect(
      (await call(onRequestPost, ok.env, { eventId: ok.event.id, venueId: ok.venue.id, minutes: 15 })).status,
    ).toBe(200);
    // Lost: someone else's nonce is in the row, so this is a 409, not a false success.
    const lost = setup();
    await call(onRequestPost, lost.env, { eventId: lost.event.id, venueId: lost.venue.id, minutes: 15 });
    const lostBatch = lost.env.DB.batch.bind(lost.env.DB);
    lost.env.DB.batch = async (statements) => {
      lost.rawDb.prepare("UPDATE event_venue_delays SET revision = revision + 1, last_shift_id = 'other'").run();
      return (await lostBatch(statements)).map(() => ({}));
    };
    const res = await call(onRequestPost, lost.env, { eventId: lost.event.id, venueId: lost.venue.id, minutes: 15 });
    expect(res.status).toBe(409);
  });

  it("an event archived between the read and the write gets 409 and nothing moves", async () => {
    const { env, rawDb, event, venue, rows } = setup();
    const batch = env.DB.batch.bind(env.DB);
    env.DB.batch = async (statements) => {
      rawDb.prepare("UPDATE events SET status = 'archived' WHERE id = ?").run(event.id);
      env.DB.batch = batch;
      return batch(statements);
    };
    const res = await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes: 15 });
    expect(res.status).toBe(409);
    expect(times(rawDb, rows[0].id)).toEqual({ start_time: "21:00", end_time: "21:45" });
    expect(delayRow(rawDb, event.id, venue.id)).toBeUndefined();
    expect(audits(rawDb)).toEqual([]);
  });

  it("refuses an archived event, a total outside 0-600, bad minutes, and a venue with nothing left", async () => {
    const archived = setup({ status: "archived" });
    expect(
      (await call(onRequestPost, archived.env, { eventId: archived.event.id, venueId: archived.venue.id, minutes: 15 }))
        .status,
    ).toBe(400);

    const { env, rawDb, event, venue, other } = setup();
    const negative = await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes: -15 });
    expect((await negative.json()).code).toBe("DELAY_OUT_OF_RANGE");
    rawDb
      .prepare(
        "INSERT INTO event_venue_delays (event_id, venue_id, delay_minutes, revision, last_shift_id, updated_by) VALUES (?, ?, 600, 0, 'seed', ?)",
      )
      .run(event.id, venue.id, 3);
    const overMaximum = await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes: 15 });
    expect((await overMaximum.json()).code).toBe("DELAY_OUT_OF_RANGE");
    expect(delayRow(rawDb, event.id, venue.id).delay_minutes).toBe(600);
    for (const minutes of [0, 1.5, "15", 181]) {
      expect((await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes })).status).toBe(400);
    }
    const empty = await call(onRequestPost, env, { eventId: event.id, venueId: other.id, minutes: 15 });
    expect((await empty.json()).code).toBe("NO_REMAINING_SETS");
    expect(delayRow(rawDb, event.id, venue.id).delay_minutes).toBe(600);
  });

  it("a viewer is refused before anything is read or written", async () => {
    const { env, rawDb, event, venue, rows } = setup();
    expect(
      (await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes: 15, role: "viewer" })).status,
    ).toBe(403);
    expect(times(rawDb, rows[0].id)).toEqual({ start_time: "21:00", end_time: "21:45" });
  });
});

describe("DELETE .../venues/:venueId/delay (back on time)", () => {
  it("clears the banner, leaves the set times as they are, and is audited", async () => {
    const { env, rawDb, event, venue, rows } = setup();
    await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes: 15 });
    const res = await call(onRequestDelete, env, { eventId: event.id, venueId: venue.id });
    expect(res.status).toBe(200);
    expect(delayRow(rawDb, event.id, venue.id).delay_minutes).toBe(0);
    expect(times(rawDb, rows[0].id)).toEqual({ start_time: "21:15", end_time: "22:00" });
    expect(audits(rawDb, "venue.delay_cleared")).toEqual([{ venueId: venue.id, previousMinutes: 15 }]);
  });

  it("is a no-op, with no audit row, when the venue is not running late", async () => {
    const { env, rawDb, event, venue } = setup();
    expect((await call(onRequestDelete, env, { eventId: event.id, venueId: venue.id })).status).toBe(200);
    expect(audits(rawDb, "venue.delay_cleared")).toEqual([]);
  });
});

describe("GET .../venue-delays", () => {
  it("lists every venue with a set at the event, fresh, at 0 when on time", async () => {
    const { env, rawDb, event, venue, other } = setup();
    insertBand(rawDb, {
      name: "Elsewhere",
      event_id: event.id,
      venue_id: other.id,
      start_time: "22:00",
      end_time: "22:45",
    });
    insertVenue(rawDb, { name: "Unused Hall" }); // no sets at this event: not listed
    await call(onRequestPost, env, { eventId: event.id, venueId: venue.id, minutes: 15 });
    const res = await listDelays({
      params: { id: String(event.id) },
      env,
      data: { user: { userId: 3, role: "viewer" } },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).delays).toEqual([
      { venueId: venue.id, venue: "Blue Room", minutes: 15, updatedAt: expect.any(String) },
      { venueId: other.id, venue: "Roost", minutes: 0, updatedAt: null },
    ]);
  });
});
