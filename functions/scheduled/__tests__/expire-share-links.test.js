import { describe, expect, it, vi } from "vitest";
import { expireShareLinks } from "../expire-share-links.js";
import { createDBEnv, createTestDB, insertEvent } from "../../api/test-utils.js";

// expires_at is TEXT in D1's datetime('now') shape — 'YYYY-MM-DD HH:MM:SS',
// space-separated. Never toISOString(), whose T separator breaks the string
// comparison this cron depends on (SEC-F1 in CLAUDE.md).
const EXPIRED = "2020-01-01 00:00:00";
const LIVE = "2099-01-01 00:00:00";

function seed(db) {
  const event = insertEvent(db, { name: "My Fest", slug: "my-fest" });
  const insertLink = db.prepare(
    `INSERT INTO share_links (slug, event_id, event_slug, performance_ids, band_names, expires_at)
     VALUES (?, ?, 'my-fest', '[1]', '["Band A"]', ?)`,
  );
  insertLink.run("expired1", event.id, EXPIRED);
  insertLink.run("live0001", event.id, LIVE);

  const insertView = db.prepare("INSERT INTO share_link_views (slug, visitor_hash) VALUES (?, ?)");
  insertView.run("expired1", "hash-a");
  insertView.run("expired1", "hash-b");
  insertView.run("live0001", "hash-c");
  return event;
}

describe("expireShareLinks (#705 ledger cleanup)", () => {
  it("deletes the ledger rows of expired links, not just the links", async () => {
    const db = createTestDB();
    seed(db);

    // The cron runs from _scheduled.js, which never passes through
    // _middleware.js — so PRAGMA foreign_keys is OFF in production and the
    // ON DELETE CASCADE does NOT fire. Reproduce that here, otherwise the test
    // passes on a cascade production never gets and the explicit child delete
    // this asserts would be untested.
    db.pragma("foreign_keys = OFF");

    // createDBEnv returns the DB binding itself, so it must be wrapped —
    // passing it bare leaves `const { DB } = env` undefined and the cron
    // early-returns, which would make this whole test vacuously green.
    await expireShareLinks({}, { DB: createDBEnv(db) }, {});

    const orphans = db.prepare("SELECT COUNT(*) AS n FROM share_link_views WHERE slug = ?").get("expired1");
    expect(orphans.n).toBe(0);

    const links = db.prepare("SELECT COUNT(*) AS n FROM share_links WHERE slug = ?").get("expired1");
    expect(links.n).toBe(0);
  });

  it("leaves live links and their ledger rows alone", async () => {
    const db = createTestDB();
    seed(db);
    db.pragma("foreign_keys = OFF");

    // createDBEnv returns the DB binding itself, so it must be wrapped —
    // passing it bare leaves `const { DB } = env` undefined and the cron
    // early-returns, which would make this whole test vacuously green.
    await expireShareLinks({}, { DB: createDBEnv(db) }, {});

    // Guards the obvious wrong fix: deleting the whole ledger rather than the
    // expired slugs' rows.
    const kept = db.prepare("SELECT COUNT(*) AS n FROM share_link_views WHERE slug = ?").get("live0001");
    expect(kept.n).toBe(1);

    const link = db.prepare("SELECT COUNT(*) AS n FROM share_links WHERE slug = ?").get("live0001");
    expect(link.n).toBe(1);
  });

  it("folds expired link counts into per-event totals and accumulates on retry", async () => {
    const db = createTestDB();
    const eventA = insertEvent(db, { name: "Event A", slug: "event-a" });
    const eventB = insertEvent(db, { name: "Event B", slug: "event-b" });
    const insertLink = db.prepare(
      `INSERT INTO share_links (slug, event_id, event_slug, performance_ids, band_names, expires_at)
       VALUES (?, ?, ?, '[1]', '["Band A"]', ?)`,
    );
    insertLink.run("expired-a1", eventA.id, eventA.slug, EXPIRED);
    insertLink.run("expired-a2", eventA.id, eventA.slug, EXPIRED);
    insertLink.run("expired-b1", eventB.id, eventB.slug, EXPIRED);
    insertLink.run("live-a1", eventA.id, eventA.slug, LIVE);
    db.prepare(
      `UPDATE share_links
       SET view_count = ?, view_count_legacy = ?, import_count = ?
       WHERE slug = ?`,
    ).run(2, 3, 4, "expired-a1");
    db.prepare("UPDATE share_links SET view_count = ?, import_count = ? WHERE slug = ?").run(5, 6, "expired-a2");
    db.prepare("UPDATE share_links SET view_count = ?, view_count_legacy = ?, import_count = ? WHERE slug = ?").run(
      7,
      8,
      9,
      "expired-b1",
    );
    db.pragma("foreign_keys = OFF");

    const env = { DB: createDBEnv(db) };
    await expireShareLinks({}, env, {});

    expect(db.prepare("SELECT * FROM event_share_totals WHERE event_id = ?").get(eventA.id)).toMatchObject({
      shares: 2,
      views: 7,
      views_legacy: 3,
      imports: 10,
    });
    expect(db.prepare("SELECT * FROM event_share_totals WHERE event_id = ?").get(eventB.id)).toMatchObject({
      shares: 1,
      views: 7,
      views_legacy: 8,
      imports: 9,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM share_links WHERE slug = ?").get("live-a1").count).toBe(1);

    insertLink.run("expired-a3", eventA.id, eventA.slug, EXPIRED);
    db.prepare("UPDATE share_links SET view_count = ?, import_count = ? WHERE slug = ?").run(11, 12, "expired-a3");
    await expireShareLinks({}, env, {});

    expect(db.prepare("SELECT * FROM event_share_totals WHERE event_id = ?").get(eventA.id)).toMatchObject({
      shares: 3,
      views: 18,
      views_legacy: 3,
      imports: 22,
    });
  });

  it("treats a NULL legacy view count as zero when folding", async () => {
    const db = createTestDB();
    const event = insertEvent(db, { slug: "null-legacy" });
    const link = db.prepare(
      `INSERT INTO share_links (slug, event_id, event_slug, performance_ids, band_names, expires_at)
       VALUES ('null-legacy-link', ?, 'null-legacy', '[1]', '["Band"]', ?)`,
    );
    link.run(event.id, EXPIRED);
    db.pragma("foreign_keys = OFF");

    await expireShareLinks({}, { DB: createDBEnv(db) }, {});

    expect(
      db.prepare("SELECT views_legacy FROM event_share_totals WHERE event_id = ?").get(event.id).views_legacy,
    ).toBe(0);
  });

  it("uses one bound cutoff for the fold and both deletes", async () => {
    const db = createTestDB();
    seed(db);
    db.pragma("foreign_keys = OFF");
    const realEnv = createDBEnv(db);
    const boundValues = [];
    const env = {
      DB: {
        prepare(sql) {
          const statement = realEnv.prepare(sql);
          return {
            ...statement,
            bind(...values) {
              boundValues.push(values);
              return statement.bind(...values);
            },
          };
        },
        batch: realEnv.batch.bind(realEnv),
      },
    };

    await expireShareLinks({}, env, {});

    expect(boundValues).toHaveLength(3);
    expect(boundValues.every(([value]) => value === boundValues[0][0])).toBe(true);
    expect(boundValues[0][0]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("reports failure without a DB binding", async () => {
    await expect(expireShareLinks({}, {}, {})).resolves.toEqual({ failures: ["expire-share-links"] });
  });

  it("reports a cleanup throw as a failure", async () => {
    const db = createTestDB();
    const env = { DB: createDBEnv(db) };
    const batchSpy = vi.spyOn(env.DB, "batch").mockRejectedValue(new Error("expiry unavailable"));

    await expect(expireShareLinks({}, env, {})).resolves.toEqual({ failures: ["expire-share-links"] });
    expect(batchSpy).toHaveBeenCalled();
  });

  it("a failed sweep folds nothing, so the retry counts each link exactly once", async () => {
    const db = createTestDB();
    const event = seed(db);
    db.prepare("UPDATE share_links SET view_count = 2, import_count = 3 WHERE slug = 'expired1'").run();
    db.pragma("foreign_keys = OFF");
    const env = { DB: createDBEnv(db) };

    // Fail at EXECUTION time, inside the real transaction (a CHECK violation
    // appended to the cron's own statements), so this proves rollback rather
    // than a batch that never ran. A fold moved out of the batch would commit
    // here and be counted again by the retry.
    const realBatch = env.DB.batch.bind(env.DB);
    vi.spyOn(env.DB, "batch").mockImplementationOnce((statements) =>
      realBatch([
        ...statements,
        env.DB.prepare("INSERT INTO event_share_totals (event_id, shares) VALUES (?, -1)").bind(event.id + 1000),
      ]),
    );

    await expect(expireShareLinks({}, env, {})).resolves.toEqual({ failures: ["expire-share-links"] });
    expect(db.prepare("SELECT COUNT(*) AS count FROM event_share_totals").get().count).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS count FROM share_links WHERE slug = 'expired1'").get().count).toBe(1);

    await expect(expireShareLinks({}, env, {})).resolves.toEqual({ failures: [] });
    expect(db.prepare("SELECT * FROM event_share_totals WHERE event_id = ?").get(event.id)).toMatchObject({
      shares: 1,
      views: 2,
      imports: 3,
    });
  });
});
