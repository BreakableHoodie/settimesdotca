import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatOrigin, formatVenueAddress } from "../formatPlace.js";

describe("formatOrigin", () => {
  it("joins trimmed city and region", () => {
    expect(formatOrigin({ origin_city: " Kitchener ", origin_region: "ON" })).toBe("Kitchener, ON");
  });
  it("never prints a dangling comma for a whitespace-only part", () => {
    expect(formatOrigin({ origin_city: "   ", origin_region: "ON" })).toBe("ON");
    expect(formatOrigin({ origin_city: "Guelph", origin_region: "  " })).toBe("Guelph");
  });
  it("falls back to the trimmed legacy origin, then null", () => {
    expect(formatOrigin({ origin_city: " ", origin_region: null, origin: " Toronto " })).toBe("Toronto");
    expect(formatOrigin({ origin_city: " ", origin: "  " })).toBeNull();
  });
  it("returns null for a missing profile", () => {
    expect(formatOrigin(null)).toBeNull();
    expect(formatOrigin(undefined)).toBeNull();
  });
});

describe("formatVenueAddress", () => {
  it("builds a one-line address", () => {
    expect(
      formatVenueAddress({
        address_line1: "1 King St",
        address_line2: "Unit 2",
        city: "Waterloo",
        region: "ON",
        postal_code: "N2L 1A1",
        country: "CA",
      }),
    ).toBe("1 King St, Unit 2, Waterloo, ON, N2L 1A1 CA");
  });
  it("skips missing and whitespace-only parts", () => {
    expect(formatVenueAddress({ address_line1: " 1 King ", city: "   ", region: "ON" })).toBe("1 King, ON");
  });
  it("returns null for a missing venue and '' for an empty one", () => {
    expect(formatVenueAddress(null)).toBeNull();
    expect(formatVenueAddress(undefined)).toBeNull();
    expect(formatVenueAddress({})).toBe("");
  });
});

// Guard (#1492): one home. A second copy drifts (it already had: "" vs null,
// city vs venue_city, no trimming).
const FUNCTIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HOME = path.join(FUNCTIONS_DIR, "utils", "formatPlace.js");

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(full);
    return /\.(js|ts)$/.test(entry.name) ? [full] : [];
  });
}

describe("place formatting has one home", () => {
  const DECLARATION =
    /\b(?:function\s+(?:formatOrigin|formatVenueAddress)\b|(?:const|let|var)\s+(?:formatOrigin|formatVenueAddress)\s*=)/;

  it("the scan pattern matches the shapes it hunts", () => {
    expect(DECLARATION.test("function formatOrigin(row) {")).toBe(true);
    expect(DECLARATION.test("  const formatVenueAddress = (v) => {")).toBe(true);
    expect(DECLARATION.test("formatOrigin(row)")).toBe(false);
  });

  it("no file under functions/ outside formatPlace.js declares either helper", () => {
    const offenders = walk(FUNCTIONS_DIR)
      .filter((f) => f !== HOME && !f.includes(`${path.sep}__tests__${path.sep}`))
      .filter((f) => DECLARATION.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(FUNCTIONS_DIR, f));
    expect(offenders).toEqual([]);
  });
});
