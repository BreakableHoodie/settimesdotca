import { describe, it, expect } from "vitest";
import {
  toMinutes,
  normalizeEndMinutes,
  buildIntervals,
  intervalsOverlap,
  computeNewEndTime,
} from "../timeConflicts.js";

describe("toMinutes", () => {
  it("converts HH:MM to total minutes", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("01:00")).toBe(60);
    expect(toMinutes("23:59")).toBe(1439);
    expect(toMinutes("18:30")).toBe(1110);
  });
});

describe("normalizeEndMinutes", () => {
  it("returns end unchanged when end > start (same day)", () => {
    expect(normalizeEndMinutes(60, 120)).toBe(120);
  });

  it("adds 24h when end <= start (midnight crossing)", () => {
    expect(normalizeEndMinutes(toMinutes("23:30"), toMinutes("00:30"))).toBe(toMinutes("00:30") + 24 * 60);
  });

  it("handles exact same start and end as midnight crossing", () => {
    expect(normalizeEndMinutes(60, 60)).toBe(60 + 24 * 60);
  });
});

describe("buildIntervals", () => {
  it("produces two mirrored intervals for a same-day set", () => {
    const intervals = buildIntervals("18:00", "19:00");
    expect(intervals).toHaveLength(2);
    expect(intervals[0]).toEqual([18 * 60, 19 * 60]);
    expect(intervals[1]).toEqual([18 * 60 + 24 * 60, 19 * 60 + 24 * 60]);
  });

  it("normalizes end for after-midnight sets", () => {
    const intervals = buildIntervals("23:30", "00:30");
    expect(intervals[0][0]).toBe(23 * 60 + 30);
    expect(intervals[0][1]).toBe(24 * 60 + 30); // 00:30 + 24h
  });
});

describe("intervalsOverlap", () => {
  it("detects overlap when intervals share time", () => {
    expect(intervalsOverlap([0, 60], [30, 90])).toBe(true);
  });

  it("returns false for non-overlapping intervals", () => {
    expect(intervalsOverlap([0, 60], [60, 120])).toBe(false);
    expect(intervalsOverlap([60, 120], [0, 60])).toBe(false);
  });

  it("returns false for completely separate intervals", () => {
    expect(intervalsOverlap([0, 30], [60, 90])).toBe(false);
  });
});

describe("computeNewEndTime", () => {
  it("preserves duration for same-day sets", () => {
    // 18:00–19:00 is 60 minutes. Shift to 20:00 → should end at 21:00.
    expect(computeNewEndTime("18:00", "19:00", "20:00")).toBe("21:00");
  });

  it("preserves duration for after-midnight sets when shifting earlier", () => {
    // 23:40–00:10 is 30 minutes. Shift to 23:00 → should end at 23:30.
    expect(computeNewEndTime("23:40", "00:10", "23:00")).toBe("23:30");
  });

  it("preserves duration for after-midnight sets when result also crosses midnight", () => {
    // 23:30–00:30 is 60 minutes. Shift to 23:40 → should end at 00:40.
    expect(computeNewEndTime("23:30", "00:30", "23:40")).toBe("00:40");
  });

  it("handles a set that shifts across midnight", () => {
    // 22:00–23:00 is 60 minutes. Shift to 23:30 → should end at 00:30.
    expect(computeNewEndTime("22:00", "23:00", "23:30")).toBe("00:30");
  });
});
