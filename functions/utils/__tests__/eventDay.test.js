import { describe, it, expect } from "vitest";
import { eventLocalToday, eventLocalClock } from "../eventDay.js";

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
