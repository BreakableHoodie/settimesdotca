// The stored poster-palette shape (#1248). The frontend's isValidThemeColours
// must accept and refuse the same cases (frontend/src/utils/__tests__).
import { describe, expect, it } from "vitest";
import { isValidThemeColors, validateThemeColorsJson } from "../themeColors.js";

const VARIANT = { ground: "#f7eef0", ink: "#1a1819", accent: "#924d7a", nowFill: "#dce9f2" };
const POSTER = "https://band-photos.settimes.ca/event-posters/a.jpg";
const valid = () => ({ v: 1, source: "poster", poster: POSTER, light: { ...VARIANT }, dark: { ...VARIANT } });
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
    ["no poster", omit(valid(), "poster")],
    ["an http poster", { ...valid(), poster: "http://band-photos.settimes.ca/event-posters/a.jpg" }],
    ["a javascript: poster", { ...valid(), poster: ["javascript", "alert(1)"].join(":") }],
    ["an over-long poster", { ...valid(), poster: `https://x.test/${"a".repeat(500)}` }],
  ])("refuses %s", (_label, value) => {
    expect(isValidThemeColors(value)).toBe(false);
  });
});

describe("validateThemeColorsJson", () => {
  it("names the problem for malformed JSON and for the wrong shape", () => {
    expect(validateThemeColorsJson("{").error).toMatch(/valid JSON/);
    expect(validateThemeColorsJson("{}").error).toMatch(/version 1 poster palette/);
    expect(validateThemeColorsJson(JSON.stringify(valid()))).toEqual({ valid: true, value: JSON.stringify(valid()) });
  });

  // JSON.parse keeps the LAST copy of a repeated key, so a hidden first copy
  // passes the check. Callers store `value`, which is re-serialised from what
  // was checked, so the hidden copy is gone (Cass, #1248 review).
  it("returns the palette re-serialised, dropping a hidden duplicate key", () => {
    const smuggled = JSON.stringify(valid()).replace(
      '"ground":"#f7eef0"',
      '"ground":"red;}</style><script>alert(1)</script>","ground":"#f7eef0"',
    );
    const result = validateThemeColorsJson(smuggled);
    expect(result.valid).toBe(true);
    expect(result.value).not.toMatch(/script/);
    expect(JSON.parse(result.value)).toEqual(valid());
  });
});
