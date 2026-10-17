import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

// #1334: migration 0071 retires dead invite rows and leaves live ones alone
// (a one-off script hashes those after deploy; SQLite cannot SHA-256).
const MIGRATION = readFileSync(new URL("../../../migrations/0071_hash_invite_codes.sql", import.meta.url), "utf8");

describe("migration 0071_hash_invite_codes", () => {
  it("retires used, inactive and expired rows; leaves live rows untouched", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY); INSERT INTO users (id) VALUES (1);");
    db.exec(readFileSync(new URL("../../../migrations/0009_migration-invite-codes.sql", import.meta.url), "utf8"));
    const insert = db.prepare(
      "INSERT INTO invite_codes (code, role, expires_at, is_active, used_by_user_id) VALUES (?, 'editor', ?, ?, ?)",
    );
    insert.run("live-aaaa-1111", "2099-01-01 00:00:00", 1, null);
    insert.run("used-bbbb-2222", "2099-01-01 00:00:00", 1, 1);
    insert.run("off-cccc-3333", "2099-01-01 00:00:00", 0, null);
    insert.run("old-dddd-4444", "2000-01-01 00:00:00", 1, null);
    // Used, then the user was deleted: used_by_user_id nulled, used_at kept.
    db.prepare(
      "INSERT INTO invite_codes (code, role, expires_at, used_at) VALUES ('gone-eeee-5555', 'admin', '2099-01-01 00:00:00', '2026-01-01 00:00:00')",
    ).run();
    // Legacy ISO 'T' expiry already in the past today: must read as expired, not live.
    insert.run("tee-ffff-6666", "2000-01-01T23:59:59.000Z", 1, null);
    insert.run("tee-gggg-7777", "2099-01-01T00:00:00.000Z", 1, null);

    db.exec(MIGRATION);

    const rows = Object.fromEntries(
      db
        .prepare("SELECT id, code, code_prefix FROM invite_codes ORDER BY id")
        .all()
        .map((r) => [r.id, r]),
    );
    expect(rows[1]).toMatchObject({ code: "live-aaaa-1111", code_prefix: null });
    expect(rows[2]).toMatchObject({ code: "retired:2", code_prefix: "used-bbb" });
    expect(rows[3]).toMatchObject({ code: "retired:3", code_prefix: "off-cccc" });
    expect(rows[4]).toMatchObject({ code: "retired:4", code_prefix: "old-dddd" });
    expect(rows[5]).toMatchObject({ code: "retired:5", code_prefix: "gone-eee" });
    expect(rows[6]).toMatchObject({ code: "retired:6", code_prefix: "tee-ffff" });
    expect(rows[7]).toMatchObject({ code: "tee-gggg-7777", code_prefix: null });
    expect(db.prepare("SELECT expires_at FROM invite_codes WHERE id = 7").get().expires_at).toBe("2099-01-01 00:00:00");
  });
});
