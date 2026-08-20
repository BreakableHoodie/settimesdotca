import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateSetTimes } from "../validation.js";
import { normalizeEndMinutes, toMinutes } from "../timeConflicts.js";

/**
 * A zero-length set (end === start) was read two incompatible ways: the server
 * normalized it to a 24-hour interval that conflicts with everything at its
 * venue, the admin UI to a zero-width interval that conflicts with nothing.
 *
 * The rule now lives in one place and is applied on every write path that
 * accepts a user-supplied start AND end. These tests cover the rule, the
 * alignment that removes the divergence, and a source scan so a sixth write
 * path cannot quietly skip it.
 */
describe("validateSetTimes", () => {
  it("rejects a zero-length set", () => {
    const result = validateSetTimes("21:00", "21:00");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/cannot be the same/i);
  });

  it("allows a normal set", () => {
    expect(validateSetTimes("21:00", "22:00").valid).toBe(true);
  });

  it("allows a set that crosses midnight — 5 exist in production", () => {
    expect(validateSetTimes("23:30", "00:30").valid).toBe(true);
  });

  it.each([
    ["both absent", null, null],
    ["no end time", "21:00", null],
    ["no start time", null, "22:00"],
    ["empty strings", "", ""],
  ])("allows %s — the rule applies only when both are present", (_label, start, end) => {
    expect(validateSetTimes(start, end).valid).toBe(true);
  });
});

describe("normalizeEndMinutes agrees with the frontend", () => {
  it("treats end < start as a midnight crossing", () => {
    expect(normalizeEndMinutes(toMinutes("23:30"), toMinutes("00:30"))).toBe(toMinutes("00:30") + 24 * 60);
  });

  it("leaves end === start alone rather than making it a 24h span", () => {
    // The divergence itself: `<=` here vs `<` in
    // frontend/src/admin/utils/timeUtils.js. Reverting to `<=` returns 1500.
    expect(normalizeEndMinutes(60, 60)).toBe(60);
  });
});

describe("every write path taking a user start+end uses the shared rule", () => {
  // Source scan, not behaviour: the failure this prevents is a NEW write path
  // that forgets the check, which no request-level test can see. `import.js`
  // was exactly that — it validated each time individually and never compared
  // them, so it accepted zero-length sets the other paths rejected.
  const ROOT = join(import.meta.dirname, "../..");
  const WRITE_PATHS = [
    "api/admin/bands.js",
    "api/admin/bands/[id].js",
    "api/admin/bands/import.js",
    "api/admin/events/wizard.js",
  ];

  it.each(WRITE_PATHS)("%s imports validateSetTimes", (rel) => {
    const source = readFileSync(join(ROOT, rel), "utf-8");
    expect(source).toContain("validateSetTimes");
  });

  it("no write path still compares the times inline", () => {
    // The rule had three inline copies, worded differently. One canonical home.
    const offenders = WRITE_PATHS.filter((rel) => {
      const source = readFileSync(join(ROOT, rel), "utf-8");
      return /(start[A-Za-z]*Time|start_time)\s*===\s*(end[A-Za-z]*Time|end_time)/.test(source);
    });
    expect(offenders, `these re-implement the rule instead of importing it:\n${offenders.join("\n")}`).toEqual([]);
  });
});
