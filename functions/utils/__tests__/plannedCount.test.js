import { describe, expect, it } from "vitest";
import { PLANNED_COUNT_MIN, publicPlannedCount } from "../plannedCount.js";

describe("publicPlannedCount (#1246 privacy floor)", () => {
  it("pins the floor at three, the figure the privacy policy states", () => {
    expect(PLANNED_COUNT_MIN).toBe(3);
  });

  it("hides a count just under the floor", () => {
    expect(publicPlannedCount(2, 0)).toBeNull();
    expect(publicPlannedCount(1, 0)).toBeNull();
  });

  it("hides zero", () => {
    expect(publicPlannedCount(0, 0)).toBeNull();
  });

  it("shows a count at the floor and above", () => {
    expect(publicPlannedCount(3, 0)).toBe(3);
    expect(publicPlannedCount(12, 0)).toBe(12);
  });

  it("hides the count of a cancelled set however large", () => {
    expect(publicPlannedCount(5, 1)).toBeNull();
    expect(publicPlannedCount(5, true)).toBeNull();
  });

  it("hides a missing or non-integer count", () => {
    expect(publicPlannedCount(undefined, 0)).toBeNull();
    expect(publicPlannedCount(null, 0)).toBeNull();
  });
});
