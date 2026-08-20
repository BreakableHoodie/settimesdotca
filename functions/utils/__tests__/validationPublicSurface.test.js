import { describe, expect, it } from "vitest";
import * as validation from "../validation.js";

/**
 * Pins the public surface of `validation.js` so a split cannot silently drop or
 * rename an export.
 *
 * 43 files under `functions/` import from this module, so it is split behind a
 * re-exporting facade rather than by rewriting call sites (#906). The facade is
 * only correct if every name still resolves and still resolves to the same
 * KIND of thing — and nothing in a green unit-test run proves that on its own,
 * because a route that imports a now-missing symbol fails at request time, not
 * at import time, under Workers' module semantics.
 *
 * This list is deliberately exhaustive rather than a count. A count passes when
 * one export is dropped and another added, which is exactly what a careless
 * rename looks like.
 *
 * ADDING an export here is normal — add the name when you add the function.
 * REMOVING one is a breaking change to 43 call sites; check every importer
 * first (`grep -rl "utils/validation.js" functions/`).
 */

const EXPECTED_EXPORTS = {
  // Constants
  FIELD_LIMITS: "object",
  VALIDATION_SCHEMAS: "object",

  // Identity and credentials
  isValidEmail: "function",
  isValidRole: "function",
  isValidUUID: "function",
  validatePassword: "function",

  // Generic string handling
  sanitizeString: "function",
  sanitizeOptionalText: "function",
  validateRequiredFields: "function",

  // URLs and social links
  isValidURL: "function",
  normalizeHttpUrl: "function",
  safeReflectHandleOrUrl: "function",
  safeReflectSocialLinks: "function",
  safeReflectSocialLinksString: "function",
  sanitizeBandSocialLinks: "function",
  sanitizeEventSocialLinks: "function",
  sanitizeOptionalHttpUrl: "function",
  sanitizeVenueInfo: "function",

  // Contact details
  isValidPhone: "function",
  isValidPostalCode: "function",
  normalizePostalCode: "function",

  // Dates and times
  isValidISODate: "function",
  isValidTime: "function",
  validateDate: "function",
  validateDoorsJson: "function",
  validatePerformanceDate: "function",
  validateSetTimes: "function",

  // Identifiers
  validateId: "function",
  validateIdArray: "function",

  // Schema engine and response helper
  validateEntity: "function",
  validationErrorResponse: "function",
};

describe("validation.js public surface", () => {
  it("exports exactly the expected names — no additions, no removals", () => {
    const actual = Object.keys(validation).sort();
    const expected = Object.keys(EXPECTED_EXPORTS).sort();

    const missing = expected.filter((name) => !actual.includes(name));
    const unexpected = actual.filter((name) => !expected.includes(name));

    expect(
      { missing, unexpected },
      `validation.js's public surface changed.\n` +
        `Missing (breaks importers): ${missing.join(", ") || "none"}\n` +
        `Unexpected (add to this list if intentional): ${unexpected.join(", ") || "none"}`,
    ).toEqual({ missing: [], unexpected: [] });
  });

  it.each(Object.entries(EXPECTED_EXPORTS))("%s is a %s", (name, kind) => {
    // Kind, not just presence: a facade that re-exports a module namespace
    // instead of the function it wraps still satisfies a presence check while
    // breaking every caller.
    expect(typeof validation[name]).toBe(kind);
  });

  it("the module actually loaded — guards the guard", () => {
    // A failed import would leave an empty namespace, making every "missing"
    // check above trivially symmetric and easy to misread.
    expect(Object.keys(validation).length).toBeGreaterThan(25);
  });
});
