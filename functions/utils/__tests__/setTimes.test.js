import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

  // Both null and undefined are covered deliberately. `null` is what actually
  // arrives at runtime -- D1/SQLite returns null for a NULL column, and 175
  // production rows have no end_time -- so dropping it would stop testing the
  // only absent-value shape the database produces. `undefined` is what a
  // caller omitting the argument passes. The rule must accept either.
  it.each([
    ["both null (DB shape)", null, null],
    ["no end time, null (DB shape)", "21:00", null],
    ["no start time, null", null, "22:00"],
    ["both undefined (omitted argument)", undefined, undefined],
    ["no end time, undefined", "21:00", undefined],
    ["no start time, undefined", undefined, "22:00"],
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
  //
  // The inventory is DISCOVERED, not listed. A hand-maintained list cannot fail
  // for a path nobody added to it, which is the whole failure being guarded
  // against — and deriving it proved the point immediately: it surfaced
  // `bands/bulk.js`, whose add action takes both times from the request body
  // and had no check. A hardcoded list of the four known paths kept passing.
  //
  // fileURLToPath rather than import.meta.dirname, matching the sibling guards
  // (opencodeInstructions.test.js, staticPageMeta.test.js). import.meta.dirname
  // needs Node >= 20.11 and the repo documents a Node 20+ baseline.
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

  // Copies times between existing rows rather than accepting them from a
  // request, so there is no user input to validate. Named, not pattern-matched,
  // so adding one stays a deliberate edit.
  const EXEMPT = new Set(["api/admin/events/[id]/duplicate.js"]);

  function collectJsFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "__tests__") continue;
        out.push(...collectJsFiles(full));
      } else if (entry.endsWith(".js")) {
        out.push(full);
      }
    }
    return out;
  }

  // A write path is any admin file that writes a performance's start/end time.
  const writePaths = collectJsFiles(join(ROOT, "api/admin"))
    .map((full) => ({ rel: full.slice(ROOT.length + 1), source: readFileSync(full, "utf-8") }))
    .filter((f) => /INSERT INTO performances|UPDATE performances/.test(f.source))
    .filter((f) => /start_time|startTime/.test(f.source))
    .filter((f) => !EXEMPT.has(f.rel));

  it("discovers the write paths rather than trusting a hardcoded list", () => {
    // Guards the guard: if the scan silently matched nothing, every assertion
    // below would pass vacuously.
    expect(writePaths.length).toBeGreaterThanOrEqual(5);
  });

  it.each(writePaths.map((f) => f.rel))("%s CALLS validateSetTimes", (rel) => {
    const { source } = writePaths.find((f) => f.rel === rel);
    // A call, not a mention: `toContain("validateSetTimes")` was satisfied by an
    // import left behind after the call was removed.
    expect(source).toMatch(/\bvalidateSetTimes\s*\(/);
  });

  it("no write path still compares the times inline", () => {
    // The rule had three inline copies, worded differently. One canonical home.
    const offenders = writePaths
      .filter((f) => /(start[A-Za-z]*Time|start_time)\s*===\s*(end[A-Za-z]*Time|end_time)/.test(f.source))
      .map((f) => f.rel);
    expect(offenders, `these re-implement the rule instead of importing it:\n${offenders.join("\n")}`).toEqual([]);
  });
});
