import { describe, expect, it } from "vitest";
import { assertScratchD1Target, dropOrder, SCRATCH_D1_ID, SCRATCH_D1_NAME } from "../reset-e2e-db.mjs";

describe("reset-e2e-db target guard", () => {
  it.each([
    ["production name", "settimes-production-db", SCRATCH_D1_ID],
    ["production ID", SCRATCH_D1_NAME, "c6c8b4a6-f951-47c1-a787-aab0a61ca09b"],
    ["mismatched pair", "settimes-production-db", "c6c8b4a6-f951-47c1-a787-aab0a61ca09b"],
    ["empty name", "", SCRATCH_D1_ID],
    ["empty ID", SCRATCH_D1_NAME, ""],
  ])("refuses %s", (_case, name, id) => {
    expect(() => assertScratchD1Target(name, id)).toThrow("exact E2E scratch database");
  });

  it("accepts only the exact scratch name and ID", () => {
    expect(() => assertScratchD1Target(SCRATCH_D1_NAME, SCRATCH_D1_ID)).not.toThrow();
  });
});

// D1 refuses to drop a parent while a child table still exists ("no such table"
// from the child's implicit DELETE), measured against the scratch D1 on
// 2026-10-14. The order is the whole job.
describe("reset-e2e-db drop order", () => {
  const index = (order, name) => order.indexOf(name);

  it("drops every child before its parents, through a chain", () => {
    const order = dropOrder([
      { name: "events", parent: null },
      { name: "share_links", parent: "events" },
      { name: "share_link_views", parent: "share_links" },
      { name: "performances", parent: "events" },
      { name: "performances", parent: "band_profiles" },
      { name: "band_profiles", parent: null },
    ]);
    expect(order).toHaveLength(5);
    expect(index(order, "share_link_views")).toBeLessThan(index(order, "share_links"));
    expect(index(order, "share_links")).toBeLessThan(index(order, "events"));
    expect(index(order, "performances")).toBeLessThan(index(order, "events"));
    expect(index(order, "performances")).toBeLessThan(index(order, "band_profiles"));
  });

  it("ignores a self-reference instead of reporting a cycle", () => {
    expect(dropOrder([{ name: "tree", parent: "tree" }])).toEqual(["tree"]);
  });

  it("refuses a real cycle rather than looping", () => {
    expect(() =>
      dropOrder([
        { name: "a", parent: "b" },
        { name: "b", parent: "a" },
      ]),
    ).toThrow("Foreign-key cycle");
  });
});
