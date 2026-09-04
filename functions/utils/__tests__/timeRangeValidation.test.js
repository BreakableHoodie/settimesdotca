import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * One canonical home for "is this a real time", enforced by scan.
 *
 * `isValidTime()` in utils/validation/datetime.js checks SHAPE and then
 * BOUNDS. Four write paths called it; three files re-implemented only the
 * shape half inline as /^\d{2}:\d{2}$/ and skipped the bounds, so "25:99",
 * "24:00" and "12:60" passed validation and reached the database as set times
 * that do not exist (#1089).
 *
 * That is the same shape as the after-midnight threshold and the event
 * visibility gate: a correct helper exists, and callers copy-paste half of it.
 * A source scan is the cheap way to stop the fourth copy, because nothing
 * about an inline regex looks wrong at the call site.
 *
 * Scoped to `functions/`. The frontend cannot import from here (Pages
 * Functions and `frontend/` are separate builds), so
 * `frontend/src/utils/timeFormat.js` carries its own bounds by necessity and
 * is covered by its own test.
 */
const FUNCTIONS_DIR = fileURLToPath(new URL("../..", import.meta.url));

// The canonical validator is allowed to contain the shape regex -- it is the
// first half of what it does.
const ALLOWED = new Set(["utils/validation/datetime.js"]);

// Matches an HH:MM shape test written as a literal regex, in any spelling that
// means the same thing. The first version matched only \d{2} and \d{1,2}, so
// [0-9]{2} and \d\d -- equally common and equally range-blind -- sailed past
// the guard that exists to catch exactly this. Normalising the spellings keeps
// the matcher readable instead of growing one alternation per variant.
function normalizeDigitClasses(source) {
  return source.replace(/\[0-9\]/g, String.raw`\d`).replace(/\\d\\d/g, String.raw`\d{2}`);
}

const SHAPE_PATTERN = /\/\^\\d\{(?:2|1,2)\}:\\d\{2\}\$\//;
const SHAPE_REGEX = { test: (source) => SHAPE_PATTERN.test(normalizeDigitClasses(source)) };

function* jsFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* jsFiles(full);
    } else if (entry.endsWith(".js")) {
      yield full;
    }
  }
}

describe("time validation has one canonical home (#1089)", () => {
  it("no file in functions/ shape-tests a time inline instead of calling isValidTime", () => {
    const offenders = [];
    for (const file of jsFiles(FUNCTIONS_DIR)) {
      const rel = relative(FUNCTIONS_DIR, file).split("\\").join("/");
      if (ALLOWED.has(rel)) continue;
      const source = readFileSync(file, "utf8");
      if (SHAPE_REGEX.test(source)) offenders.push(rel);
    }

    expect(
      offenders,
      `These files test a time's SHAPE with an inline regex, which accepts "25:99" and "12:60".\n` +
        `Import isValidTime from utils/validation.js instead -- it bounds hours and minutes too:\n` +
        offenders.map((f) => `  - ${f}`).join("\n"),
    ).toEqual([]);
  });

  it("the scan can actually fail (it is looking for the real shape)", () => {
    // Guards the guard: if SHAPE_REGEX ever stops matching the pattern it
    // exists to find, the scan above passes while checking nothing -- the
    // silent-no-op class this repo keeps hitting.
    expect(SHAPE_REGEX.test("if (!/^\\d{2}:\\d{2}$/.test(startTime)) {")).toBe(true);
    expect(SHAPE_REGEX.test("const isValidTimeString = /^\\d{1,2}:\\d{2}$/")).toBe(true);
    // The equivalent spellings this scan used to miss: same meaning, same
    // range-blindness, and either would have sailed past the guard.
    expect(SHAPE_REGEX.test("const t = /^[0-9]{2}:[0-9]{2}$/")).toBe(true);
    expect(SHAPE_REGEX.test("const t = /^\\d\\d:\\d\\d$/")).toBe(true);
    // Still not a blanket match on anything containing a colon or digits.
    expect(SHAPE_REGEX.test("const x = /^[0-9]+$/")).toBe(false);
    expect(SHAPE_REGEX.test("const iso = /^\\d{4}-\\d{2}-\\d{2}$/")).toBe(false);
  });
});
