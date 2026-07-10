import { describe, it, expect } from "vitest";
import { eventLocalToday } from "../eventDay.js";

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
