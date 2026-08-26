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

async function runUrlUpdateOutcome(DB, profileId, url = "https://example.com") {
  let result;
  let error;
  try {
    result = await prepareBandProfileFields(DB, { url }, profileId, undefined);
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
  it("does not read social links during a website update", async () => {
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

    expect(error).toBeUndefined();
    expect(JSON.parse(readSocialLinks(profile.rawDb, profile.id))).toMatchObject({
      instagram: "https://instagram.com/test-band",
      bandcamp: "https://test-band.bandcamp.com",
      website: "https://example.com/",
    });
  });

  it("does not depend on a social-links read promise during a website update", async () => {
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

    expect(error).toBeUndefined();
    expect(JSON.parse(readSocialLinks(profile.rawDb, profile.id))).toMatchObject({
      instagram: "https://instagram.com/test-band",
      bandcamp: "https://test-band.bandcamp.com",
      website: "https://example.com/",
    });
  });

  it("lets an UPDATE matching a missing profile do nothing", async () => {
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

    expect(error).toBeUndefined();
    expect(updatePrepared).toBe(true);
    expect(profile.rawDb.prepare("SELECT * FROM band_profiles WHERE id = ?").get(profile.id)).toBeUndefined();
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

  it("returns a validation error for an unsafe incoming website URL", async () => {
    const profile = createProfile({ instagram: "https://instagram.com/test-band" });

    const outcome = await runUrlUpdateOutcome(profile.DB, profile.id, "ftp://example.com");

    expect(outcome).toMatchObject({
      threw: false,
      error: { message: "Website URL must start with http:// or https://" },
    });
    expect(JSON.parse(readSocialLinks(profile.rawDb, profile.id))).toEqual({
      instagram: "https://instagram.com/test-band",
    });
  });

  // Each row is the raw JSON TEXT stored in the column, not a JS value: the
  // callback takes one parameter, so it.each binds the first element. "[]" is
  // the only case that reaches the Array.isArray clause -- an array parses as a
  // truthy typeof "object" and passes every other check in the guard.
  it.each(["null", "42", '"hello"', "[]"])("recovers from a non-object stored JSON value: %s", async (storedValue) => {
    const profile = createProfile({ instagram: "https://instagram.com/test-band" });
    profile.rawDb.prepare("UPDATE band_profiles SET social_links = ? WHERE id = ?").run(storedValue, profile.id);

    const error = await runUrlUpdate(profile.DB, profile.id);

    expect(error).toBeUndefined();
    expect(JSON.parse(readSocialLinks(profile.rawDb, profile.id))).toMatchObject({
      website: "https://example.com/",
    });
  });

  it.each([
    ["an unsafe scheme", '{"bandcamp":"ftp://x.com"}'],
    ["an overlong URL", `{"bandcamp":"https://x.com/${"a".repeat(501)}"}`],
  ])("does not revalidate unrelated stored data: %s", async (_caseName, storedValue) => {
    const profile = createProfile({ instagram: "https://instagram.com/test-band" });
    profile.rawDb.prepare("UPDATE band_profiles SET social_links = ? WHERE id = ?").run(storedValue, profile.id);

    const outcome = await runUrlUpdateOutcome(profile.DB, profile.id);

    expect(outcome).toMatchObject({ threw: false, error: undefined });
    expect(JSON.parse(readSocialLinks(profile.rawDb, profile.id))).toMatchObject({
      bandcamp: JSON.parse(storedValue).bandcamp,
      website: "https://example.com/",
    });
  });

  it("preserves the SQL NULL all-empty collapse when clearing the only link", async () => {
    const profile = createProfile({ website: "https://old.example.com" });

    const error = await runUrlUpdate(profile.DB, profile.id);

    expect(error).toBeUndefined();
    expect(readSocialLinks(profile.rawDb, profile.id)).toBe('{"website":"https://example.com/"}');

    const clearStatement = (await prepareBandProfileFields(profile.DB, { url: "" }, profile.id, undefined))
      .profileStatement;
    clearStatement.run();
    expect(readSocialLinks(profile.rawDb, profile.id)).toBeNull();
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
      bandcamp: "https://test-band.bandcamp.com",
    });
  });

  it("preserves an interleaved wholesale social-links update", async () => {
    const profile = createProfile({ instagram: "https://instagram.com/test-band" });
    const urlUpdate = prepareBandProfileFields(profile.DB, { url: "https://example.com" }, profile.id, undefined);
    const linksUpdate = prepareBandProfileFields(
      profile.DB,
      { social_links: { instagram: "https://instagram.com/new-band" } },
      profile.id,
      undefined,
    );
    const [{ profileStatement: urlStatement }, { profileStatement: linksStatement }] = await Promise.all([
      urlUpdate,
      linksUpdate,
    ]);

    linksStatement.run();
    urlStatement.run();

    expect(JSON.parse(readSocialLinks(profile.rawDb, profile.id))).toMatchObject({
      website: "https://example.com/",
      instagram: "https://instagram.com/new-band",
    });
  });
});
