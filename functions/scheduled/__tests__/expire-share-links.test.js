import { describe, expect, it } from "vitest";
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

  it("is a no-op without a DB binding", async () => {
    await expect(expireShareLinks({}, {}, {})).resolves.toBeUndefined();
  });
});
