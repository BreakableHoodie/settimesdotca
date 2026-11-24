import { describe, expect, test } from "vitest";
import { buildBandFallbackDescription, buildBandTitle } from "../bandMeta.js";

const fixtures = [
  [{ name: "Hamilton Act", genre: "Punk", origin_city: "Hamilton" }, "Hamilton Act — Punk from Hamilton | SetTimes"],
  [
    { name: "Kitchener Act", genre: "Rock", origin_city: "Kitchener", origin_region: "Waterloo Region" },
    "Kitchener Act — Rock from Kitchener | SetTimes",
  ],
  [{ name: "No Facts Act" }, "No Facts Act | SetTimes"],
  [{ name: "Legacy Act", genre: "Jazz", origin: "Toronto, ON" }, "Legacy Act — Jazz from Toronto, ON | SetTimes"],
];

describe("buildBandTitle", () => {
  test.each(fixtures)("formats %j", (band, expected) => {
    expect(buildBandTitle(band)).toBe(expected);
  });
});

describe("buildBandFallbackDescription", () => {
  test.each([
    [
      { genre: "Punk", origin_city: "Hamilton", played_editions_count: 3, most_recent_edition_name: "LWBC 18" },
      "Punk from Hamilton. On 3 SetTimes lineups, latest LWBC 18.",
    ],
    [
      { genre: "Punk", played_editions_count: 1, most_recent_edition_name: "LWBC 18" },
      "Punk. On 1 SetTimes lineup, latest LWBC 18.",
    ],
    [{ origin_city: "Guelph", played_editions_count: 2 }, "From Guelph. On 2 SetTimes lineups."],
    // A band whose only set was cancelled still has a page; "On 0 lineups" says nothing true.
    [{ genre: "Folk", origin_city: "Waterloo", played_editions_count: 0 }, "Folk from Waterloo."],
    [{}, ""],
  ])("states only the facts it has: %j", (band, expected) => {
    expect(buildBandFallbackDescription(band)).toBe(expected);
  });

  test("never claims an act is a band, or that it played", () => {
    const text = buildBandFallbackDescription({ genre: "Punk", origin_city: "Hamilton", played_editions_count: 2 });
    expect(text).not.toMatch(/\bband\b/i);
    expect(text).not.toMatch(/\bplayed\b/i);
  });
});
