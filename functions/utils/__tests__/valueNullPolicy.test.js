import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePerformanceDate, validateDoorsJson } from "../validation/datetime.js";

const validationDir = join(dirname(dirname(fileURLToPath(import.meta.url))), "validation");

/**
 * `.github/instructions/nodejs-javascript-vitest.instructions.md` prefers
 * `undefined` over `null` for optional values, and #917 asked for a sweep. The
 * sweep found two different cases wearing the same shape:
 *
 *   valid: false  -> `.value` is never read; callers branch on `.valid` and
 *                    return the error. A value key there is noise.
 *   valid: true   -> the value is legitimately ABSENT and is bound straight into
 *                    D1 (bands.js binds it as performance_date, events.js as
 *                    doors_json). D1's .bind() REJECTS undefined, so null is
 *                    correct and required.
 *
 * A blanket sed would have broken the second case. These pin the split so a
 * future "consistency" pass cannot quietly flip it.
 */
describe("validation result value policy", () => {
  it("returns null - never undefined - when a valid result has no value", () => {
    const noDate = validatePerformanceDate(null, { date: "2026-10-11", end_date: null });
    expect(noDate.valid).toBe(true);
    expect(noDate.value).toBeNull();
    expect(Object.hasOwn(noDate, "value")).toBe(true);

    const noDoors = validateDoorsJson(null, { date: "2026-10-11", end_date: null });
    expect(noDoors.valid).toBe(true);
    expect(noDoors.value).toBeNull();
    expect(Object.hasOwn(noDoors, "value")).toBe(true);
  });

  it("omits value entirely on a rejection", () => {
    const bad = validatePerformanceDate("not-a-date", { date: "2026-10-11", end_date: null });
    expect(bad.valid).toBe(false);
    expect(Object.hasOwn(bad, "value")).toBe(false);
  });

  // Source scan: a runtime test only reaches the paths it exercises, and these
  // modules have many rejection branches.
  it("no rejection anywhere in validation/ carries a value key", () => {
    const offenders = [];
    for (const file of ["datetime.js", "ids.js", "strings.js", "urls.js", "contact.js", "identity.js", "schema.js"]) {
      let source;
      try {
        source = readFileSync(join(validationDir, file), "utf8");
      } catch {
        continue;
      }
      source.split("\n").forEach((line, i) => {
        if (line.includes("valid: false") && line.includes("value:")) {
          offenders.push(`${file}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
