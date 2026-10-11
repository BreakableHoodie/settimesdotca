import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { anonymizeScheduleBuilds } from "../anonymize-schedule-builds.js";
import { createTestEnv, insertBand, insertEvent } from "../../api/test-utils.js";
import { eventLocalFestivalToday } from "../../utils/eventDay.js";

function shiftDate(days) {
  const date = new Date(`${eventLocalFestivalToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function seedBuilds(rawDb, event, values) {
  const performances = values.map((_, index) =>
    insertBand(rawDb, { name: `${event.slug}-${index}`, event_id: event.id }),
  );
  const insert = rawDb.prepare("INSERT INTO schedule_builds (event_id, performance_id, visitor_hash) VALUES (?, ?, ?)");
  values.forEach((value, index) => insert.run(event.id, performances[index].id, value));
}

describe("anonymizeScheduleBuilds", () => {
  test("anonymises old events without changing picks or distinct builders", async () => {
    const { env, rawDb } = createTestEnv();
    const oldEvent = insertEvent(rawDb, { slug: "old", date: shiftDate(-31), status: "published" });
    seedBuilds(rawDb, oldEvent, ["raw-a", "raw-a", "raw-b"]);
    const before = rawDb
      .prepare(
        "SELECT COUNT(*) AS picks, COUNT(DISTINCT visitor_hash) AS builders FROM schedule_builds WHERE event_id = ?",
      )
      .get(oldEvent.id);

    await anonymizeScheduleBuilds({}, env, {});

    const after = rawDb
      .prepare(
        "SELECT COUNT(*) AS picks, COUNT(DISTINCT visitor_hash) AS builders FROM schedule_builds WHERE event_id = ?",
      )
      .get(oldEvent.id);
    expect(after).toEqual(before);
    expect(
      rawDb.prepare("SELECT visitor_hash FROM schedule_builds WHERE event_id = ? ORDER BY id").all(oldEvent.id),
    ).toEqual([{ visitor_hash: "anon:1" }, { visitor_hash: "anon:1" }, { visitor_hash: "anon:2" }]);
  });

  test("leaves recent and upcoming events untouched", async () => {
    const { env, rawDb } = createTestEnv();
    const recent = insertEvent(rawDb, { slug: "recent", date: shiftDate(-29), status: "published" });
    const upcoming = insertEvent(rawDb, { slug: "upcoming", date: shiftDate(1), status: "published" });
    seedBuilds(rawDb, recent, ["recent-raw"]);
    seedBuilds(rawDb, upcoming, ["upcoming-raw"]);

    await anonymizeScheduleBuilds({}, env, {});

    expect(rawDb.prepare("SELECT visitor_hash FROM schedule_builds WHERE event_id = ?").get(recent.id)).toEqual({
      visitor_hash: "recent-raw",
    });
    expect(rawDb.prepare("SELECT visitor_hash FROM schedule_builds WHERE event_id = ?").get(upcoming.id)).toEqual({
      visitor_hash: "upcoming-raw",
    });
  });

  test("starts after existing anon labels and is idempotent", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { slug: "collision", date: shiftDate(-31), status: "published" });
    seedBuilds(rawDb, event, ["anon:1", "anon:3", "raw-value"]);

    await anonymizeScheduleBuilds({}, env, {});
    const firstRun = rawDb
      .prepare("SELECT visitor_hash FROM schedule_builds WHERE event_id = ? ORDER BY id")
      .all(event.id);
    await anonymizeScheduleBuilds({}, env, {});
    const secondRun = rawDb
      .prepare("SELECT visitor_hash FROM schedule_builds WHERE event_id = ? ORDER BY id")
      .all(event.id);

    expect(firstRun).toEqual([{ visitor_hash: "anon:1" }, { visitor_hash: "anon:3" }, { visitor_hash: "anon:4" }]);
    expect(secondRun).toEqual(firstRun);
  });

  test("anonymises an event moved back to draft after it ran", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { slug: "unpublished-later", date: shiftDate(-31), status: "draft" });
    seedBuilds(rawDb, event, ["raw-draft"]);

    await anonymizeScheduleBuilds({}, env, {});

    expect(rawDb.prepare("SELECT visitor_hash FROM schedule_builds WHERE event_id = ?").get(event.id)).toEqual({
      visitor_hash: "anon:1",
    });
  });

  test("one event failing does not stop the events after it", async () => {
    const { env, rawDb } = createTestEnv();
    const failing = insertEvent(rawDb, { slug: "failing", date: shiftDate(-40), status: "archived" });
    const healthy = insertEvent(rawDb, { slug: "healthy", date: shiftDate(-35), status: "archived" });
    seedBuilds(rawDb, failing, ["raw-fail"]);
    seedBuilds(rawDb, healthy, ["raw-ok"]);
    const realBatch = env.DB.batch.bind(env.DB);
    env.DB.batch = async (statements) => {
      const hitsFailing = rawDb
        .prepare("SELECT 1 FROM schedule_builds WHERE event_id = ? AND visitor_hash = 'raw-fail'")
        .get(failing.id);
      if (hitsFailing && !env.__failedOnce) {
        env.__failedOnce = true;
        throw new Error("simulated D1 failure");
      }
      return realBatch(statements);
    };

    await anonymizeScheduleBuilds({}, env, {});

    expect(rawDb.prepare("SELECT visitor_hash FROM schedule_builds WHERE event_id = ?").get(failing.id)).toEqual({
      visitor_hash: "raw-fail",
    });
    expect(rawDb.prepare("SELECT visitor_hash FROM schedule_builds WHERE event_id = ?").get(healthy.id)).toEqual({
      visitor_hash: "anon:1",
    });
  });

  test("a label taken by a concurrent run is never reused for a different builder", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { slug: "race", date: shiftDate(-31), status: "archived" });
    seedBuilds(rawDb, event, ["anon:1", "raw-late"]);
    const extra = insertBand(rawDb, { name: "race-extra", event_id: event.id });
    const realBatch = env.DB.batch.bind(env.DB);
    env.DB.batch = async (statements) => {
      // Another run claims anon:2 for a different builder between our read and our write.
      rawDb
        .prepare("INSERT INTO schedule_builds (event_id, performance_id, visitor_hash) VALUES (?, ?, 'anon:2')")
        .run(event.id, extra.id);
      return realBatch(statements);
    };

    await anonymizeScheduleBuilds({}, env, {});

    const builders = rawDb
      .prepare("SELECT COUNT(DISTINCT visitor_hash) AS n FROM schedule_builds WHERE event_id = ?")
      .get(event.id);
    expect(builders.n).toBe(3);
  });
});

test("migration anonymises legacy rows while preserving distinct values", () => {
  const db = new Database(":memory:");
  const migration = readFileSync(join(process.cwd(), "migrations/0067_schedule_builds_visitor_hash.sql"), "utf8");
  db.exec(
    "CREATE TABLE schedule_builds (id INTEGER PRIMARY KEY, event_id INTEGER, performance_id INTEGER, user_session TEXT NOT NULL);",
  );
  db.exec("CREATE UNIQUE INDEX idx_schedule_builds_unique ON schedule_builds(event_id, performance_id, user_session);");
  db.exec("CREATE INDEX idx_schedule_builds_session ON schedule_builds(user_session);");
  const insert = db.prepare("INSERT INTO schedule_builds (event_id, performance_id, user_session) VALUES (?, ?, ?)");
  insert.run(1, 1, "550e8400-e29b-41d4-a716-446655440000");
  insert.run(1, 2, "550e8400-e29b-41d4-a716-446655440001");
  insert.run(2, 3, "550e8400-e29b-41d4-a716-446655440000");

  db.exec(migration);

  const columns = db
    .prepare("PRAGMA table_info(schedule_builds)")
    .all()
    .map((column) => column.name);
  expect(columns).toContain("visitor_hash");
  expect(columns).not.toContain("user_session");
  expect(db.prepare("SELECT visitor_hash FROM schedule_builds ORDER BY id").all()).toEqual([
    { visitor_hash: "anon:1" },
    { visitor_hash: "anon:2" },
    { visitor_hash: "anon:1" },
  ]);
  expect(
    db
      .prepare("SELECT * FROM schedule_builds")
      .all()
      .flatMap((row) => Object.values(row)),
  ).not.toContain("550e8400-e29b-41d4-a716-446655440000");
  db.close();
});
