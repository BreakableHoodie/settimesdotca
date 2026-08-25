import { describe, expect, it } from "vitest";
import { createTestEnv } from "../../api/test-utils.js";
import { prepareBandProfileFields } from "../bandProfileFields.js";

function createProfile({ origin_city = null, origin_region = null, origin = null } = {}) {
  const { env, rawDb } = createTestEnv();
  const result = rawDb
    .prepare(
      "INSERT INTO band_profiles (name, name_normalized, origin, origin_city, origin_region) VALUES (?, ?, ?, ?, ?)",
    )
    .run("Test Band", "test-band", origin, origin_city, origin_region);
  return { DB: env.DB, rawDb, id: result.lastInsertRowid };
}

async function applyUpdate(DB, body, profileId) {
  const { profileStatement } = await prepareBandProfileFields(DB, body, profileId, undefined);
  expect(profileStatement).toBeDefined();
  profileStatement.run();
}

function readOrigin(rawDb, profileId) {
  return rawDb.prepare("SELECT origin, origin_city, origin_region FROM band_profiles WHERE id = ?").get(profileId);
}

describe("band profile origin recomposition", () => {
  it("recomposes a city-only update with the stored region", async () => {
    const profile = createProfile({ origin_city: "Kitchener", origin_region: "ON" });

    await applyUpdate(profile.DB, { origin_city: "Waterloo" }, profile.id);

    expect(readOrigin(profile.rawDb, profile.id)).toEqual({
      origin: "Waterloo, ON",
      origin_city: "Waterloo",
      origin_region: "ON",
    });
  });

  it("recomposes a region-only update with the stored city", async () => {
    const profile = createProfile({ origin_city: "Kitchener", origin_region: "ON" });

    await applyUpdate(profile.DB, { origin_region: "QC" }, profile.id);

    expect(readOrigin(profile.rawDb, profile.id)).toEqual({
      origin: "Kitchener, QC",
      origin_city: "Kitchener",
      origin_region: "QC",
    });
  });

  it("keeps the surviving region when the city is cleared", async () => {
    const profile = createProfile({ origin_city: "Kitchener", origin_region: "ON" });

    await applyUpdate(profile.DB, { origin_city: "" }, profile.id);

    expect(readOrigin(profile.rawDb, profile.id)).toEqual({
      origin: "ON",
      origin_city: null,
      origin_region: "ON",
    });
  });

  it("keeps the surviving city when the region is cleared", async () => {
    const profile = createProfile({ origin_city: "Kitchener", origin_region: "ON" });

    await applyUpdate(profile.DB, { origin_region: "" }, profile.id);

    expect(readOrigin(profile.rawDb, profile.id)).toEqual({
      origin: "Kitchener",
      origin_city: "Kitchener",
      origin_region: null,
    });
  });

  it("clears all three columns when both components are cleared", async () => {
    const profile = createProfile({ origin: "Kitchener, ON", origin_city: "Kitchener", origin_region: "ON" });

    await applyUpdate(profile.DB, { origin_city: "", origin_region: "" }, profile.id);

    expect(readOrigin(profile.rawDb, profile.id)).toEqual({
      origin: null,
      origin_city: null,
      origin_region: null,
    });
  });

  it("lets an explicit origin win over component fields", async () => {
    const profile = createProfile({ origin_city: "Kitchener", origin_region: "ON" });

    await applyUpdate(profile.DB, { origin: "Waterloo, ON", origin_city: "Waterloo", origin_region: "ON" }, profile.id);

    expect(readOrigin(profile.rawDb, profile.id)).toEqual({
      origin: "Waterloo, ON",
      origin_city: "Waterloo",
      origin_region: "ON",
    });
  });

  // Both components supplied is the JS path, deliberately left in place because
  // it reads nothing and so has no race. It still needs cover: the SQL branch
  // above does not run for it.
  it("recomposes origin when both components are supplied together", async () => {
    const profile = createProfile({ origin: "Kitchener, ON", origin_city: "Kitchener", origin_region: "ON" });

    await applyUpdate(profile.DB, { origin_city: "Guelph", origin_region: "QC" }, profile.id);

    expect(readOrigin(profile.rawDb, profile.id)).toEqual({
      origin: "Guelph, QC",
      origin_city: "Guelph",
      origin_region: "QC",
    });
  });

  it("keeps the composite consistent when partial updates interleave", async () => {
    const profile = createProfile({ origin_city: "Kitchener", origin_region: "ON" });
    const cityUpdate = prepareBandProfileFields(profile.DB, { origin_city: "Waterloo" }, profile.id, undefined);
    const regionUpdate = prepareBandProfileFields(profile.DB, { origin_region: "QC" }, profile.id, undefined);
    const [{ profileStatement: cityStatement }, { profileStatement: regionStatement }] = await Promise.all([
      cityUpdate,
      regionUpdate,
    ]);

    cityStatement.run();
    regionStatement.run();

    expect(readOrigin(profile.rawDb, profile.id)).toEqual({
      origin: "Waterloo, QC",
      origin_city: "Waterloo",
      origin_region: "QC",
    });
  });

  it("does not touch origin columns when no origin field is supplied", async () => {
    const profile = createProfile({ origin: "Kitchener, ON", origin_city: "Kitchener", origin_region: "ON" });

    await applyUpdate(profile.DB, { name: "ALL" }, profile.id);

    expect(readOrigin(profile.rawDb, profile.id)).toEqual({
      origin: "Kitchener, ON",
      origin_city: "Kitchener",
      origin_region: "ON",
    });
  });
});
