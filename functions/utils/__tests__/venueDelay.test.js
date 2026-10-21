// #1249: which sets a "running late" shift moves, and where to. Pure rules, so
// "now" is injected: every case pins the Toronto clock explicitly.
import { describe, expect, it } from "vitest";
import { festivalMinutes, hasStarted, planVenueShift } from "../venueDelay.js";

const EVENT_DATE = "2026-10-11";
// 2026-10-11 is EDT (UTC-4): 22:00 local is 02:00Z on the 12th.
const at = (localDate, localTime) => {
  const [h, m] = localTime.split(":").map(Number);
  const [y, mo, d] = localDate.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 4, m));
};
const set = (id, start, end, extra = {}) => ({
  id,
  name: `Band ${id}`,
  venue_id: 1,
  start_time: start,
  end_time: end,
  performance_date: null,
  is_cancelled: 0,
  ...extra,
});
const plan = (rows, minutes, now = at("2026-10-11", "18:00")) =>
  planVenueShift(rows, { venueId: 1, minutes, eventDate: EVENT_DATE, now });

describe("festivalMinutes", () => {
  it("counts after-midnight times past 24:00 so they sort after the evening", () => {
    expect(festivalMinutes("23:50")).toBe(23 * 60 + 50);
    expect(festivalMinutes("00:05")).toBe(24 * 60 + 5);
    expect(festivalMinutes("05:59")).toBe(29 * 60 + 59);
    expect(festivalMinutes("06:00")).toBe(6 * 60);
  });
});

describe("hasStarted (Toronto festival time, never UTC)", () => {
  it("a set later tonight has not started; one earlier has", () => {
    const now = at("2026-10-11", "21:30");
    expect(hasStarted(set(1, "22:00", "22:45"), EVENT_DATE, now)).toBe(false);
    expect(hasStarted(set(2, "21:00", "21:45"), EVENT_DATE, now)).toBe(true);
  });

  it("at 00:30 the festival day is still the 11th: a 01:00 set is upcoming, a 23:00 set started", () => {
    const now = at("2026-10-12", "00:30");
    expect(hasStarted(set(1, "01:00", "01:45"), EVENT_DATE, now)).toBe(false);
    expect(hasStarted(set(2, "23:00", "23:45"), EVENT_DATE, now)).toBe(true);
  });

  it("8 PM local is already the next UTC day, and that must not matter", () => {
    const now = at("2026-10-11", "20:30");
    expect(hasStarted(set(1, "21:00", "21:45"), EVENT_DATE, now)).toBe(false);
  });

  it("a later festival day has not started; an earlier one has", () => {
    const now = at("2026-10-11", "23:00");
    expect(hasStarted(set(1, "19:00", "20:00", { performance_date: "2026-10-12" }), EVENT_DATE, now)).toBe(false);
    expect(hasStarted(set(2, "23:30", "23:45", { performance_date: "2026-10-10" }), EVENT_DATE, now)).toBe(true);
  });
});

describe("planVenueShift", () => {
  it("crosses midnight within the same festival night: 23:50 +15 is 00:05", () => {
    const { changes, crossing } = plan([set(1, "23:50", "00:30")], 15);
    expect(crossing).toEqual([]);
    expect(changes).toEqual([expect.objectContaining({ id: 1, to: { startTime: "00:05", endTime: "00:45" } })]);
  });

  it("moves only remaining, non-cancelled sets at this venue", () => {
    const rows = [
      set(1, "17:00", "17:45"), // already started at 18:00
      set(2, "20:00", "20:45", { is_cancelled: 1 }),
      set(3, "21:00", "21:45", { venue_id: 2 }),
      set(4, "22:00", "22:45"),
      set(5, null, null), // no time yet
    ];
    const { changes } = plan(rows, 15);
    expect(changes.map((c) => c.id)).toEqual([4]);
    expect(changes[0].to).toEqual({ startTime: "22:15", endTime: "23:00" });
  });

  it("keeps a missing end time missing", () => {
    expect(plan([set(1, "22:00", null)], 10).changes[0].to).toEqual({ startTime: "22:10", endTime: null });
  });

  it("a negative shift moves sets earlier, back across midnight within the night", () => {
    expect(plan([set(1, "00:05", "00:45")], -15).changes[0].to).toEqual({ startTime: "23:50", endTime: "00:30" });
  });

  it("refuses to push a start across 06:00 into the next festival day", () => {
    const { changes, crossing } = plan([set(1, "05:50", "05:55")], 15);
    expect(changes).toEqual([]);
    expect(crossing).toEqual([expect.objectContaining({ id: 1 })]);
  });

  it("refuses to pull a set back across 06:00 into the previous night", () => {
    const { crossing } = plan(
      [set(1, "06:05", "06:50", { performance_date: "2026-10-12" })],
      -10,
      at("2026-10-11", "18:00"),
    );
    expect(crossing).toEqual([expect.objectContaining({ id: 1 })]);
  });

  it("refuses when only the END would cross 06:00", () => {
    const { crossing } = plan([set(1, "05:00", "05:50")], 15);
    expect(crossing).toEqual([expect.objectContaining({ id: 1 })]);
  });

  it("a set that already ends after 06:00 does not block the shift (it crosses nothing new)", () => {
    const { changes, crossing } = plan([set(1, "05:00", "07:00"), set(2, "22:00", "22:45")], 15);
    expect(crossing).toEqual([]);
    expect(changes.find((c) => c.id === 1).to).toEqual({ startTime: "05:15", endTime: "07:15" });
  });

  it("allows an end exactly at 06:00", () => {
    expect(plan([set(1, "05:00", "05:45")], 15).changes[0].to).toEqual({ startTime: "05:15", endTime: "06:00" });
  });
});
