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

async function runUrlUpdateOutcome(DB, profileId) {
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
  return { error: error || result?.error, threw: Boolean(error) };
}

async function runUrlUpdate(DB, profileId) {
  return (await runUrlUpdateOutcome(DB, profileId)).error;
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

  it("surfaces a rejected social-links read without wiping existing links", async () => {
    const profile = createProfile({
      instagram: "https://instagram.com/test-band",
      bandcamp: "https://test-band.bandcamp.com",
    });
    const failingDB = {
      ...profile.DB,
      prepare(sql) {
        if (!sql.startsWith("SELECT social_links")) {
          return profile.DB.prepare(sql);
        }
        return {
          bind(...params) {
            const statement = profile.DB.prepare(sql).bind(...params);
            return { ...statement, first: () => Promise.reject(new Error("simulated rejected D1 failure")) };
          },
        };
      },
    };

    const error = await runUrlUpdate(failingDB, profile.id);

    expect(error).toHaveProperty("message", "simulated rejected D1 failure");
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
    let updatePrepared = false;
    const trackingDB = {
      ...profile.DB,
      prepare(sql) {
        if (sql.startsWith("UPDATE band_profiles")) {
          updatePrepared = true;
        }
        return profile.DB.prepare(sql);
      },
    };

    const error = await runUrlUpdate(trackingDB, profile.id);

    expect(error).toHaveProperty("message", "Band profile not found");
    expect(updatePrepared).toBe(false);
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

  it.each([
    ["null", null],
    ["42", 42],
    ['"hello"', "hello"],
  ])("recovers from a non-object stored JSON value: %s", async (storedValue) => {
    const profile = createProfile({ instagram: "https://instagram.com/test-band" });
    profile.rawDb.prepare("UPDATE band_profiles SET social_links = ? WHERE id = ?").run(storedValue, profile.id);

    const error = await runUrlUpdate(profile.DB, profile.id);

    expect(error).toBeUndefined();
    expect(JSON.parse(readSocialLinks(profile.rawDb, profile.id))).toMatchObject({
      website: "https://example.com/",
    });
  });

  it.each([
    ["an unsafe scheme", '{"bandcamp":"ftp://x.com"}', "Bandcamp URL must start with http:// or https://"],
    [
      "an overlong URL",
      `{"bandcamp":"https://x.com/${"a".repeat(501)}"}`,
      "Bandcamp URL must be no more than 500 characters",
    ],
  ])("surfaces stored-data sanitisation failure for %s as a server fault", async (_caseName, storedValue, message) => {
    const profile = createProfile({ instagram: "https://instagram.com/test-band" });
    profile.rawDb.prepare("UPDATE band_profiles SET social_links = ? WHERE id = ?").run(storedValue, profile.id);

    const outcome = await runUrlUpdateOutcome(profile.DB, profile.id);

    expect(outcome).toMatchObject({ threw: true, error: { message } });
    expect(readSocialLinks(profile.rawDb, profile.id)).toBe(storedValue);
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
