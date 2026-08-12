import { describe, it, expect } from "vitest";
import {
  eventLocalToday,
  eventLocalClock,
  eventLocalFestivalToday,
  AFTER_MIDNIGHT_THRESHOLD_HOUR,
  AFTER_MIDNIGHT_THRESHOLD_TIME,
} from "../eventDay.js";

// The FESTIVAL day, not the calendar day. A set before 6 AM belongs to the
// previous evening, so between local midnight and 06:00 the festival day is
// still yesterday's date. Every assertion here pins an explicit instant --
// the two functions only differ inside that six-hour window, so an unpinned
// test would pass against a plain eventLocalToday() implementation for
// eighteen hours out of every twenty-four.
describe("eventLocalFestivalToday", () => {
  it("matches the calendar day during normal hours", () => {
    // 20:00 EDT on 2026-08-07 -> 2026-08-08T00:00Z
    const evening = new Date("2026-08-08T00:00:00Z");
    expect(eventLocalFestivalToday(evening)).toBe("2026-08-07");
    expect(eventLocalFestivalToday(evening)).toBe(eventLocalToday(evening));
  });

  it("stays on the previous date at 00:15 local, while after-midnight sets are still playing", () => {
    // 00:15 EDT on 2026-08-08 -> 2026-08-08T04:15Z. The calendar has rolled
    // over; the festival night has not.
    const afterMidnight = new Date("2026-08-08T04:15:00Z");
    expect(eventLocalToday(afterMidnight)).toBe("2026-08-08");
    expect(eventLocalFestivalToday(afterMidnight)).toBe("2026-08-07");
  });

  it("still reports the previous date at 05:59 local", () => {
    const justBefore = new Date("2026-08-08T09:59:00Z"); // 05:59 EDT
    expect(eventLocalFestivalToday(justBefore)).toBe("2026-08-07");
  });

  it("rolls over at exactly 06:00 local — the threshold is exclusive", () => {
    const atThreshold = new Date("2026-08-08T10:00:00Z"); // 06:00 EDT
    expect(eventLocalFestivalToday(atThreshold)).toBe("2026-08-08");
  });

  it("steps back a CALENDAR day across a DST boundary, not a fixed 24h", () => {
    // 2026-11-01 is the EDT->EST transition (local day is 25 hours long), so
    // subtracting 86_400_000 ms from 01:30 local lands on the wrong date.
    // 01:30 EST on 2026-11-01 -> 2026-11-01T06:30Z.
    const dstNight = new Date("2026-11-01T06:30:00Z");
    expect(eventLocalFestivalToday(dstNight)).toBe("2026-10-31");
  });

  it("exports the threshold so no caller re-encodes 6", () => {
    expect(AFTER_MIDNIGHT_THRESHOLD_HOUR).toBe(6);
  });
});

// #746: functions/api/events/timeline.js needs the "HH:MM" string shape for a
// lexicographic comparison against performances.start_time, while
// eventLocalFestivalToday() above needs the numeric hour. Two shapes of the
// same value is exactly the drift risk the single-home rule exists to
// prevent — this pins that AFTER_MIDNIGHT_THRESHOLD_TIME is always derived
// from AFTER_MIDNIGHT_THRESHOLD_HOUR, never a separately maintained literal.
describe("AFTER_MIDNIGHT_THRESHOLD_TIME", () => {
  it("agrees with AFTER_MIDNIGHT_THRESHOLD_HOUR", () => {
    expect(Number(AFTER_MIDNIGHT_THRESHOLD_TIME.slice(0, 2))).toBe(AFTER_MIDNIGHT_THRESHOLD_HOUR);
  });

  it("is a zero-padded HH:MM string", () => {
    expect(AFTER_MIDNIGHT_THRESHOLD_TIME).toMatch(/^\d{2}:\d{2}$/);
    expect(AFTER_MIDNIGHT_THRESHOLD_TIME).toBe("06:00");
  });
});

describe("eventLocalToday", () => {
  it("returns YYYY-MM-DD", () => {
    expect(eventLocalToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("stays on the Toronto day when UTC has already rolled over (the BLR3 bug)", () => {
    // 2026-07-10T01:00:00Z is 9:00 PM EDT on July 9 — toISOString() says
    // "2026-07-10" here, which marked events "Happening Now" the evening
    // before. The Toronto day is still July 9.
    expect(eventLocalToday(new Date("2026-07-10T01:00:00Z"))).toBe("2026-07-09");
  });

  it("rolls to the next Toronto day at local midnight, not UTC midnight", () => {
    // 04:00Z on July 10 is exactly midnight EDT — the first instant of the
    // Toronto July 10.
    expect(eventLocalToday(new Date("2026-07-10T04:00:00Z"))).toBe("2026-07-10");
    expect(eventLocalToday(new Date("2026-07-10T03:59:59Z"))).toBe("2026-07-09");
  });

  it("handles EST (winter, UTC-5) as well as EDT", () => {
    // 04:30Z on Jan 10 is 11:30 PM EST on Jan 9.
    expect(eventLocalToday(new Date("2026-01-10T04:30:00Z"))).toBe("2026-01-09");
    expect(eventLocalToday(new Date("2026-01-10T05:00:00Z"))).toBe("2026-01-10");
  });

  it("agrees with the UTC day in the Toronto afternoon", () => {
    expect(eventLocalToday(new Date("2026-07-10T18:00:00Z"))).toBe("2026-07-10");
  });
});

describe("eventLocalClock", () => {
  it("returns { date, time } in YYYY-MM-DD / zero-padded HH:MM", () => {
    const clock = eventLocalClock(new Date("2026-07-10T18:00:00Z"));
    expect(clock.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(clock.time).toMatch(/^\d{2}:\d{2}$/);
  });

  // #569 doors gate: BLR3 Friday doors at 16:00 EDT. These two instants
  // straddle a 16:00 doors time by one minute on each side (EDT = UTC-4, so
  // 16:00 local is 20:00Z) — the exact comparison the timeline gate depends on.
  it("is before a 16:00 EDT doors time one minute prior", () => {
    const clock = eventLocalClock(new Date("2026-07-10T19:59:00Z"));
    expect(clock.date).toBe("2026-07-10");
    expect(clock.time).toBe("15:59");
    expect(clock.time < "16:00").toBe(true);
  });

  it("is at/after a 16:00 EDT doors time at the exact instant", () => {
    const clock = eventLocalClock(new Date("2026-07-10T20:00:00Z"));
    expect(clock.date).toBe("2026-07-10");
    expect(clock.time).toBe("16:00");
    expect(clock.time < "16:00").toBe(false);
  });

  it("handles EST (winter, UTC-5) as well as EDT", () => {
    // 20:00Z on Jan 10 is 15:00 EST (UTC-5), not 16:00 — confirms the offset
    // isn't hardcoded to EDT's -4.
    const clock = eventLocalClock(new Date("2026-01-10T20:00:00Z"));
    expect(clock.date).toBe("2026-01-10");
    expect(clock.time).toBe("15:00");
  });

  it("rolls the date at Toronto local midnight, matching eventLocalToday", () => {
    const clock = eventLocalClock(new Date("2026-07-10T04:00:00Z"));
    expect(clock.date).toBe("2026-07-10");
    expect(clock.time).toBe("00:00");
    expect(clock.date).toBe(eventLocalToday(new Date("2026-07-10T04:00:00Z")));
  });
});
