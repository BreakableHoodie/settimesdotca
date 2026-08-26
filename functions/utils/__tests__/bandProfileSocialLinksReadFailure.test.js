import { describe, expect, it } from "vitest";
import { createTestEnv } from "../../api/test-utils.js";
import { prepareBandProfileFields } from "../bandProfileFields.js";

function createProfile(socialLinks) {
  const { env, rawDb } = createTestEnv();
  const result = rawDb
    .prepare("INSERT INTO band_profiles (name, name_normalized, social_links) VALUES (?, ?, ?)")
    .run("Test Band", "test-band", JSON.stringify(socialLinks));
  return { DB: env.DB, rawDb, id: result.lastInsertRowid };
}

function readSocialLinks(rawDb, profileId) {
  return rawDb.prepare("SELECT social_links FROM band_profiles WHERE id = ?").get(profileId).social_links;
}

async function runUrlUpdate(DB, profileId) {
  let result;
  let error;
  try {
    result = await prepareBandProfileFields(DB, { url: "https://example.com" }, profileId, undefined);
    if (result.profileStatement) {
      result.profileStatement.run();
    }
  } catch (caughtError) {
    error = caughtError;
  }
  return error;
}

describe("band profile social-links URL updates", () => {
  it("surfaces a failed social-links read without wiping existing links", async () => {
    const profile = createProfile({
      instagram: "https://instagram.com/test-band",
      bandcamp: "https://test-band.bandcamp.com",
    });
    const failingDB = {
      ...profile.DB,
      prepare(sql) {
        if (sql.startsWith("SELECT social_links")) {
          throw new Error("simulated transient D1 failure");
        }
        return profile.DB.prepare(sql);
      },
    };

    const error = await runUrlUpdate(failingDB, profile.id);

    expect(error).toHaveProperty("message", "simulated transient D1 failure");
    expect(JSON.parse(readSocialLinks(profile.rawDb, profile.id))).toEqual({
      instagram: "https://instagram.com/test-band",
      bandcamp: "https://test-band.bandcamp.com",
    });
  });

  it("surfaces a missing profile without preparing a replacement social-links blob", async () => {
    const profile = createProfile({
      instagram: "https://instagram.com/test-band",
      bandcamp: "https://test-band.bandcamp.com",
    });
    profile.rawDb.prepare("DELETE FROM band_profiles WHERE id = ?").run(profile.id);

    const error = await runUrlUpdate(profile.DB, profile.id);

    expect(error).toHaveProperty("message", "Band profile not found");
    expect(profile.rawDb.prepare("SELECT id FROM band_profiles WHERE id = ?").get(profile.id)).toBeUndefined();
  });

  it("recovers from malformed stored JSON and updates the website", async () => {
    const profile = createProfile({ instagram: "https://instagram.com/test-band" });
    profile.rawDb.prepare("UPDATE band_profiles SET social_links = ? WHERE id = ?").run("{bad", profile.id);

    const error = await runUrlUpdate(profile.DB, profile.id);

    expect(error).toBeUndefined();
    expect(JSON.parse(readSocialLinks(profile.rawDb, profile.id))).toMatchObject({
      website: "https://example.com/",
    });
  });

  it("merges the website with existing social links", async () => {
    const profile = createProfile({
      instagram: "https://instagram.com/test-band",
      bandcamp: "https://test-band.bandcamp.com",
    });

    const error = await runUrlUpdate(profile.DB, profile.id);

    expect(error).toBeUndefined();
    expect(JSON.parse(readSocialLinks(profile.rawDb, profile.id))).toMatchObject({
      website: "https://example.com/",
      instagram: "https://instagram.com/test-band",
      bandcamp: "https://test-band.bandcamp.com/",
    });
  });
});
