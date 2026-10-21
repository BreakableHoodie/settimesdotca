// The stored poster-palette shape (#1248). The frontend's isValidThemeColours
// must accept and refuse the same cases (frontend/src/utils/__tests__).
import { describe, expect, it } from "vitest";
import { isValidThemeColors, validateThemeColorsJson } from "../themeColors.js";

const VARIANT = { ground: "#f7eef0", ink: "#1a1819", accent: "#924d7a", nowFill: "#dce9f2" };
const valid = () => ({ v: 1, source: "poster", light: { ...VARIANT }, dark: { ...VARIANT } });
const omit = (object, key) => Object.fromEntries(Object.entries(object).filter(([k]) => k !== key));

describe("isValidThemeColors", () => {
  it("accepts a version 1 palette from a poster or by hand", () => {
    expect(isValidThemeColors(valid())).toBe(true);
    expect(isValidThemeColors({ ...valid(), source: "manual" })).toBe(true);
    expect(isValidThemeColors({ ...valid(), light: { ...VARIANT, ink: "#1A1819" } })).toBe(true);
  });

  it.each([
    ["null", null],
    ["an array", []],
    ["the 0008 legacy shape", { primary: "#000000", secondary: "#111111", accent: "#222222" }],
    ["version 2", { ...valid(), v: 2 }],
    ["an unknown source", { ...valid(), source: "other" }],
    ["an extra top-level key", { ...valid(), extra: 1 }],
    ["a missing variant", omit(valid(), "dark")],
    ["a missing role", { ...valid(), dark: omit(VARIANT, "nowFill") }],
    ["an extra role", { ...valid(), light: { ...VARIANT, border: "#000000" } }],
    ["a short hex", { ...valid(), light: { ...VARIANT, ink: "#000" } }],
    ["a named colour", { ...valid(), light: { ...VARIANT, ink: "black" } }],
    ["a CSS injection", { ...valid(), light: { ...VARIANT, ink: "#000000;background:url(x)" } }],
  ])("refuses %s", (_label, value) => {
    expect(isValidThemeColors(value)).toBe(false);
  });
});

describe("validateThemeColorsJson", () => {
  it("names the problem for malformed JSON and for the wrong shape", () => {
    expect(validateThemeColorsJson("{").error).toMatch(/valid JSON/);
    expect(validateThemeColorsJson("{}").error).toMatch(/version 1 poster palette/);
    expect(validateThemeColorsJson(JSON.stringify(valid()))).toEqual({ valid: true });
  });
});
