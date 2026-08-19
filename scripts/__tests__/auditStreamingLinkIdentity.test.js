import { describe, expect, it } from "vitest";
import { classify } from "../audit-streaming-link-identity.mjs";

describe("classify", () => {
  it.each([
    ["Kman & the 45s", "K-Man & The 45s"],
    ["I Can't Remember", "I CAN'T RƎMƎMBƎR"],
    ["identical name", "identical name"],
    // withoutArticle() strips a leading article before comparison, so these
    // normalise to the same string — an exact match, not a billing variant.
    // The script's own comment states the intent: "The OBGMs" = "OBGMs".
    ["The OBGMs", "OBGMs"],
  ])("classifies %j and %j as OK", (dbName, platformName) => {
    expect(classify(dbName, platformName)).toBe("OK");
  });

  it.each([
    ["Charlie Weber & the Glorious Failures", "Charlie Weber"],
    ["Scott Reynolds Band", "Scott Reynolds"],
  ])("classifies %j and %j as REVIEW", (dbName, platformName) => {
    expect(classify(dbName, platformName)).toBe("REVIEW");
  });

  it.each([
    ["Man Made Hill", "Mark It Zero"],
    ["Azathoth Entombed", "Avro Arrows"],
    ["A Dallas Welcome", "Dead Karma"],
    ["Sun", "Sunday Blues"],
    ["Beat", "Beatles"],
    // Guards the hyphen rule from being widened into "ignore all spaces":
    // both of these fold to "sealion" if word boundaries are erased, but they
    // are different names and must stay MISMATCH.
    ["Sea Lion", "Seal Ion"],
  ])("classifies %j and %j as MISMATCH", (dbName, platformName) => {
    expect(classify(dbName, platformName)).toBe("MISMATCH");
  });

  it.each([undefined, ""])("classifies a missing platform name as UNRESOLVED", (platformName) => {
    expect(classify("Any Band", platformName)).toBe("UNRESOLVED");
  });
});
