import { describe, expect, it } from "vitest";
import { sortableName, compareByName } from "../sortableName.js";

describe("sortableName", () => {
  it('strips a leading "The " (case-insensitive) so the name sorts under its first real word', () => {
    expect(sortableName("The Anti-Queens")).toBe("anti-queens");
    expect(sortableName("the anti-queens")).toBe("anti-queens");
    expect(sortableName("THE ANTI-QUEENS")).toBe("anti-queens");
  });

  it('strips a leading "A " so the name sorts under its first real word', () => {
    expect(sortableName("A Day to Remember")).toBe("day to remember");
  });

  it('strips a leading "An " so the name sorts under its first real word', () => {
    expect(sortableName("An Horse")).toBe("horse");
  });

  it('does not strip "The"/"A"/"An" when it is the whole name (no trailing word)', () => {
    expect(sortableName("The")).toBe("the");
    expect(sortableName("A")).toBe("a");
    expect(sortableName("An")).toBe("an");
  });

  it('does not falsely strip words that merely start with an article ("Theory", "Anthem", "Antler")', () => {
    expect(sortableName("Theory")).toBe("theory");
    expect(sortableName("Anthem")).toBe("anthem");
    expect(sortableName("Antler")).toBe("antler");
    expect(sortableName("Android Apocalypse")).toBe("android apocalypse");
  });

  it("only strips the article when it is the very first word (not mid-name)", () => {
    expect(sortableName("Beyond The Valley")).toBe("beyond the valley");
  });

  it("is null/empty safe", () => {
    expect(sortableName(null)).toBe("");
    expect(sortableName(undefined)).toBe("");
    expect(sortableName("")).toBe("");
    expect(sortableName("   ")).toBe("");
    expect(sortableName(42)).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(sortableName("  The Beatles  ")).toBe("beatles");
  });

  it("never mutates the original string (sort key only)", () => {
    const name = "The Anti-Queens";
    sortableName(name);
    expect(name).toBe("The Anti-Queens");
  });
});

describe("compareByName", () => {
  it("accepts plain strings", () => {
    expect(compareByName("The Anti-Queens", "Beatles")).toBeLessThan(0);
  });

  it("accepts objects with a .name property", () => {
    expect(compareByName({ name: "The Anti-Queens" }, { name: "Beatles" })).toBeLessThan(0);
  });

  it("is null/empty safe for missing names", () => {
    expect(compareByName({}, { name: "Beatles" })).toBeLessThan(0);
    expect(compareByName(null, undefined)).toBe(0);
  });

  it("sorts a mixed list of article and non-article band names into correct alphabetical order (#587)", () => {
    const bands = [
      { name: "The Anti-Queens" },
      { name: "Beatles" },
      { name: "A Day to Remember" },
      { name: "An Horse" },
      { name: "Zebras" },
      { name: "Theory of a Deadman" },
      { name: "The" },
    ];

    const sorted = [...bands].sort(compareByName).map((b) => b.name);

    expect(sorted).toEqual([
      "The Anti-Queens",
      "Beatles",
      "A Day to Remember",
      "An Horse",
      "The",
      "Theory of a Deadman",
      "Zebras",
    ]);
  });
});
