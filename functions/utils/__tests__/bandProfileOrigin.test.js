import { describe, expect, it, vi } from "vitest";
import { prepareBandProfileFields } from "../bandProfileFields.js";

/**
 * #954: clearing an artist's origin left the composite `origin` column stale.
 * Sending origin_city:"" and origin_region:"" (no `origin`) nulled both
 * component columns while the `origin = ?` update was skipped, so the admin UI
 * re-displayed the value the user had just deleted.
 *
 * The happy path passes either way — only the CLEARING path distinguishes the
 * fixed code from the broken code.
 */
const DB = () => ({
  prepare: vi.fn(() => ({
    bind: vi.fn(() => ({ first: vi.fn(async () => null) })),
  })),
});

async function fieldsFor(body) {
  const result = await prepareBandProfileFields(DB(), body, 7, undefined);
  const { profileUpdates, profileParams } = result;
  const map = new Map();
  profileUpdates.forEach((clause, i) => map.set(clause.replace(" = ?", ""), profileParams[i]));
  return map;
}

describe("band profile origin recomposition", () => {
  it("clears the composite origin when both components are cleared", async () => {
    const fields = await fieldsFor({ origin_city: "", origin_region: "" });

    expect(fields.has("origin")).toBe(true);
    expect(fields.get("origin")).toBeNull();
    expect(fields.get("origin_city")).toBeNull();
    expect(fields.get("origin_region")).toBeNull();
  });

  it("recomposes origin from a single supplied component", async () => {
    const fields = await fieldsFor({ origin_city: "Kitchener" });

    expect(fields.get("origin")).toBe("Kitchener");
    expect(fields.get("origin_city")).toBe("Kitchener");
  });

  it("recomposes origin from both components", async () => {
    const fields = await fieldsFor({ origin_city: "Kitchener", origin_region: "ON" });
    expect(fields.get("origin")).toBe("Kitchener, ON");
  });

  it("still lets an explicit origin win", async () => {
    const fields = await fieldsFor({ origin: "Waterloo, ON" });
    expect(fields.get("origin")).toBe("Waterloo, ON");
  });

  it("touches none of the three columns when no origin field is supplied", async () => {
    const fields = await fieldsFor({ name: "ALL" });

    expect(fields.has("origin")).toBe(false);
    expect(fields.has("origin_city")).toBe(false);
    expect(fields.has("origin_region")).toBe(false);
  });
});
