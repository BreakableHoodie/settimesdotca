import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTestEnv } from "../../api/test-utils.js";
import { scheduled } from "../../scheduled/aggregate-stats.js";
import { prepareBandProfileFields } from "../bandProfileFields.js";

// #1501: updated_at means "the profile's content changed". The trigger fires
// only on content columns; derived counters (rewritten daily) must not stamp it.
const DERIVED_COLUMNS = ["total_views", "total_social_clicks", "popularity_score"];
// Neither content nor derived, with the reason each is excluded.
const NON_CONTENT_COLUMNS = {
  id: "identity",
  created_at: "set once",
  updated_at: "the stamp itself",
  created_by_user_id: "attribution; nulled when a user is deleted",
};

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, "../../../database/setup-complete.sql"), "utf-8");

function triggerColumns() {
  const m = schema.match(
    /CREATE TRIGGER IF NOT EXISTS update_band_profile_timestamp\s+AFTER UPDATE OF ([^]*?) ON band_profiles/,
  );
  if (!m) throw new Error("update_band_profile_timestamp must be AFTER UPDATE OF <columns>");
  return m[1].split(",").map((c) => c.trim());
}

function whenColumns() {
  const m = schema.match(/update_band_profile_timestamp[^]*?\nWHEN ([^]*?)\nBEGIN/);
  if (!m) throw new Error("update_band_profile_timestamp must have a WHEN clause");
  return [...m[1].matchAll(/OLD\.(\w+) IS NOT NEW\.(\w+)/g)].map((x) => {
    expect(x[1]).toBe(x[2]);
    return x[1];
  });
}

const OLD = "2000-01-01 00:00:00";

function seed() {
  const { env, rawDb } = createTestEnv();
  const { lastInsertRowid: id } = rawDb
    .prepare("INSERT INTO band_profiles (name, name_normalized, updated_at) VALUES ('Stamp Band', 'stampband', ?)")
    .run(OLD);
  rawDb
    .prepare(
      "INSERT INTO artist_daily_stats (band_profile_id, date, page_views, social_clicks) VALUES (?, '2026-05-01', 10, 2)",
    )
    .run(id);
  const stamp = () => rawDb.prepare("SELECT updated_at FROM band_profiles WHERE id = ?").get(id).updated_at;
  return { env, rawDb, id, stamp };
}

describe("band_profiles.updated_at is content-only (#1501)", () => {
  it("the trigger lists every column except the classified non-content ones", () => {
    const { rawDb } = seed();
    const all = rawDb
      .prepare("PRAGMA table_info(band_profiles)")
      .all()
      .map((c) => c.name);
    const excluded = new Set([...DERIVED_COLUMNS, ...Object.keys(NON_CONTENT_COLUMNS)]);
    for (const c of excluded) expect(all, `classified column ${c} no longer exists`).toContain(c);
    const expected = all.filter((c) => !excluded.has(c)).sort();
    expect(triggerColumns().sort()).toEqual(expected);
  });

  it("the WHEN clause compares exactly the UPDATE OF columns", () => {
    expect(whenColumns().sort()).toEqual(triggerColumns().sort());
  });

  it("re-saving identical values through the real update path does not stamp; a change does", async () => {
    const { rawDb, id, stamp } = seed();
    const run = async (body) => {
      const { profileStatement, error } = await prepareBandProfileFields(
        { prepare: (sql) => ({ bind: (...p) => ({ run: () => rawDb.prepare(sql).run(...p) }) }) },
        body,
        id,
      );
      expect(error).toBeUndefined();
      await profileStatement.run();
    };
    const body = { name: "Stamp Band", description: "Bio", genre: "punk", origin: "Waterloo, ON", is_active: 1 };
    await run(body);
    rawDb.prepare("UPDATE band_profiles SET updated_at = ? WHERE id = ?").run(OLD, id);
    await run(body);
    expect(stamp()).toBe(OLD);
    await run({ ...body, genre: "folk" });
    expect(stamp()).not.toBe(OLD);
  });

  it("the aggregate-stats job rewrites counters without touching updated_at", async () => {
    const { env, rawDb, id, stamp } = seed();
    await scheduled({}, env, {});
    expect(rawDb.prepare("SELECT total_views FROM band_profiles WHERE id = ?").get(id).total_views).toBe(10);
    expect(stamp()).toBe(OLD);
  });

  it.each([
    ["name", "Renamed"],
    ["description", "A new bio"],
    ["photo_url", "https://example.test/p.jpg"],
    ["is_active", 0],
  ])("editing %s stamps updated_at", (column, value) => {
    const { rawDb, id, stamp } = seed();
    rawDb.prepare(`UPDATE band_profiles SET ${column} = ? WHERE id = ?`).run(value, id);
    expect(stamp()).not.toBe(OLD);
  });

  it("a derived-counter write alone does not stamp updated_at", () => {
    const { rawDb, id, stamp } = seed();
    rawDb.prepare("UPDATE band_profiles SET total_views = 5, popularity_score = 1.5 WHERE id = ?").run(id);
    expect(stamp()).toBe(OLD);
  });
});
