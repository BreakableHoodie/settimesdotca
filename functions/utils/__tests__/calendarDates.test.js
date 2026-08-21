import { describe, expect, it } from "vitest";
import { isValidISODate, validateDate } from "../validation.js";

/**
 * `new Date('2025-02-29')` does not fail — it rolls over to March 1 and reports
 * itself valid. So a format check plus a parse check accepted dates that do not
 * exist (#929): the value was stored as typed while meaning a different day, and
 * could never match a real event date under this repo's lexicographic
 * YYYY-MM-DD comparisons.
 *
 * The two validators disagreed about it, which is the more interesting half:
 * validateDate rejected 2025-02-29 correctly while isValidISODate accepted it.
 * They now share isRealCalendarDate, so they cannot drift apart again.
 */

describe("impossible calendar dates are rejected", () => {
  it.each([
    ["Feb 29 in a non-leap year", "2025-02-29"],
    ["Feb 30 in a leap year", "2024-02-30"],
    ["April 31", "2025-04-31"],
    ["June 31", "2025-06-31"],
    ["September 31", "2025-09-31"],
    ["November 31", "2025-11-31"],
    ["day zero", "2025-06-00"],
    ["month zero", "2025-00-15"],
    ["month 13", "2025-13-01"],
  ])("rejects %s", (_label, date) => {
    expect(isValidISODate(date)).toBe(false);
    expect(validateDate(date).valid).toBe(false);
  });

  it.each([
    ["Feb 29 in a leap year", "2024-02-29"],
    ["Feb 29 in a 400-year leap year", "2000-02-29"],
    ["Feb 28 in a non-leap year", "2025-02-28"],
    ["a 31-day month", "2025-07-31"],
    ["a 30-day month", "2025-04-30"],
    ["the target event date", "2026-10-11"],
  ])("accepts %s", (_label, date) => {
    expect(isValidISODate(date)).toBe(true);
  });

  it("handles ISO years 0000-0099 without Date remapping them to 1900-1999", () => {
    // `new Date(year, month, 0)` maps year 0 to 1900, which is NOT a leap year
    // while year 0 IS (divisible by 400) — so 0000-02-29 was wrongly rejected.
    // setFullYear sets the literal year instead.
    expect(isValidISODate("0000-02-29")).toBe(true);
    expect(isValidISODate("0099-02-29")).toBe(false);
    expect(isValidISODate("0004-02-29")).toBe(true);
  });

  it("rejects a century year that is NOT a leap year", () => {
    // 1900 is divisible by 4 but not a leap year — the case a hand-written
    // `year % 4 === 0` rule gets wrong.
    expect(isValidISODate("1900-02-29")).toBe(false);
  });

  it("keeps validateDate's year range as its own concern", () => {
    // isValidISODate answers "does this date exist?"; validateDate adds the
    // business rule that events fall between 2020 and 2100. Collapsing the two
    // would silently apply that range everywhere.
    expect(isValidISODate("2019-06-15")).toBe(true);
    expect(validateDate("2019-06-15").valid).toBe(false);
  });

  it("applies calendar validity to the DATETIME form too", () => {
    // ISO_DATE_REGEX accepts a full timestamp, so the calendar check must read
    // only the leading YYYY-MM-DD — splitting the whole string on "-" yields
    // NaN for the day and would reject every timestamp.
    expect(isValidISODate("2025-11-18T14:00:00Z")).toBe(true);
    expect(isValidISODate("2025-11-18T14:00:00.123Z")).toBe(true);
    expect(isValidISODate("2025-11-18T14:00:00+00:00")).toBe(true);
    expect(isValidISODate("2024-02-29T00:00:00Z")).toBe(true);
    expect(isValidISODate("2025-02-29T14:00:00Z")).toBe(false);
  });

  it("still rejects malformed input rather than throwing", () => {
    for (const bad of ["", null, undefined, "not-a-date", "2025-6-15", "20250615", 20250615]) {
      expect(isValidISODate(bad)).toBe(false);
    }
  });
});
