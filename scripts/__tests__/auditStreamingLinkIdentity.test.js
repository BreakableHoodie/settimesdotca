import { describe, expect, it } from "vitest";
import { classify, evaluateChecks, validateDecisionRegister } from "../audit-streaming-link-identity.mjs";

function decision(bandProfileId, platformName, value, platform = "spotify") {
  return {
    bandProfileId,
    platform,
    platformName,
    decision: value,
    reason: "Human-reviewed artist identity",
    decidedOn: "2026-09-22",
  };
}

function check(id, name, platformName, platform = "spotify") {
  return { id, name, platform, platformName, url: `https://example.test/${id}` };
}

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

describe("streaming-link decisions", () => {
  it.each([
    [1, "Yasiin Bey", "Mos Def"],
    [2, "Yusuf", "Cat Stevens"],
    [3, "Snoop Dogg", "Snoop Doggy Dogg"],
  ])("resolves the alias %j / %j as OK_DECIDED", (id, rosterName, platformName) => {
    const result = evaluateChecks([check(id, rosterName, platformName)], [decision(id, platformName, "same-artist")]);

    expect(result.buckets.OK_DECIDED).toHaveLength(1);
    expect(result.exitCode).toBe(0);
  });

  it.each([
    [4, "The Verve", "The Verve Pipe"],
    [5, "Bush", "Kate Bush"],
    [6, "Low", "Low Roar"],
  ])("requires a decision for the containment case %j / %j", (id, rosterName, platformName) => {
    const result = evaluateChecks([check(id, rosterName, platformName)], []);

    expect(result.buckets.REVIEW).toHaveLength(1);
    expect(result.exitCode).toBe(3);
  });

  it.each([
    [10, "Yasiin Bey", "Mos Def"],
    [11, "Yusuf", "Cat Stevens"],
    [12, "Snoop Dogg", "Snoop Doggy Dogg"],
    [13, "The Verve", "The Verve Pipe"],
    [14, "Bush", "Kate Bush"],
    [15, "Low", "Low Roar"],
  ])("records a different-artist decision as MISMATCH for %j / %j", (id, rosterName, platformName) => {
    const result = evaluateChecks(
      [check(id, rosterName, platformName)],
      [decision(id, platformName, "different-artist")],
    );

    expect(result.buckets.MISMATCH).toHaveLength(1);
    expect(result.exitCode).toBe(1);
  });

  it("does not apply a decision recorded for a different observed platform name", () => {
    const result = evaluateChecks(
      [check(20, "Yasiin Bey", "Mos Def")],
      [decision(20, "Mos Def (Live)", "same-artist")],
    );

    expect(result.buckets.MISMATCH).toHaveLength(1);
    expect(result.exitCode).toBe(1);
  });

  it("maps apple_music rows to the apple register platform", () => {
    const result = evaluateChecks(
      [check(21, "Yusuf", "Cat Stevens", "apple_music")],
      [decision(21, "Cat Stevens", "same-artist", "apple")],
    );

    expect(result.buckets.OK_DECIDED).toHaveLength(1);
  });

  it("gives MISMATCH precedence over undecided REVIEW", () => {
    const result = evaluateChecks(
      [check(22, "Bush", "Kate Bush"), check(23, "Low", "Low Roar")],
      [decision(23, "Low Roar", "different-artist")],
    );

    expect(result.buckets.REVIEW).toHaveLength(1);
    expect(result.buckets.MISMATCH).toHaveLength(1);
    expect(result.exitCode).toBe(1);
  });

  it("validates the register shape and duplicate keys", () => {
    expect(() => validateDecisionRegister([{ ...decision(30, "Name", "same-artist"), decision: "unknown" }])).toThrow(
      "invalid decision",
    );
    expect(() =>
      validateDecisionRegister([decision(31, "Name", "same-artist"), decision(31, "Name", "different-artist")]),
    ).toThrow("duplicates");
  });
});
