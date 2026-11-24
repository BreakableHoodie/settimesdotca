import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BACKED_UP_TABLES, buildBackup, EXCLUDED_TABLES, restoreSql, unclassifiedTables } from "../d1-backup.mjs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const SCHEMA_SQL = read("database/setup-complete.sql");

// Every table the generated schema creates, read from source so a new
// migration's table cannot be missed by a hand-kept list.
const schemaTables = [...SCHEMA_SQL.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+"?(\w+)"?/g)].map((m) => m[1]);

// setup-complete.sql carries seed data too; take only its schema, as a D1
// export of an empty database would.
function exportWith(statements) {
  const db = new DatabaseSync(":memory:", { enableForeignKeyConstraints: false });
  db.exec(SCHEMA_SQL);
  for (const table of schemaTables) db.exec(`DELETE FROM "${table}"`);
  db.exec(statements);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => row.name);
  const ddl = db
    .prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid")
    .all()
    .map((row) => `${row.sql};`);
  const inserts = [];
  for (const table of tables) {
    for (const row of db.prepare(`SELECT * FROM "${table}"`).all()) {
      const cols = Object.keys(row);
      const vals = cols.map((c) =>
        row[c] === null ? "NULL" : typeof row[c] === "string" ? `'${row[c].replaceAll("'", "''")}'` : row[c],
      );
      inserts.push(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${vals.join(",")});`);
    }
  }
  db.close();
  return ["PRAGMA defer_foreign_keys=TRUE;", ...ddl, ...inserts].join("\n");
}

const PRIVATE_EMAIL = "login-attempt-marker@example.test";
const SEED = `
  INSERT INTO events (id, name, date, slug) VALUES (1, 'Backup Fest', '2026-02-14', 'backup-fest');
  INSERT INTO venues (id, name) VALUES (1, 'Backup Hall');
  INSERT INTO users (id, email, password_hash, role, activation_token, totp_secret, totp_enabled, totp_pending_secret, totp_pending_set_at)
    VALUES (1, 'invitee@example.test', 'x', 'editor', 'activation-token-marker', NULL, 0, 'enc-v1:pending', 1),
           (2, 'legacy@example.test', 'x', 'admin', NULL, 'LEGACYTOTPSECRETMARKER', 1, NULL, NULL),
           (3, 'current@example.test', 'x', 'admin', NULL, 'enc-v1:kept', 1, NULL, NULL);
  INSERT INTO auth_attempts (email, ip_address, success, attempt_type) VALUES ('${PRIVATE_EMAIL}', '203.0.113.9', 0, 'login');
`;

describe("d1-backup table classification", () => {
  it("classifies every table the schema creates", () => {
    expect(schemaTables.length).toBeGreaterThan(20);
    expect(unclassifiedTables(schemaTables)).toEqual([]);
  });

  it("classifies no table that no longer exists", () => {
    const classified = [...BACKED_UP_TABLES, ...Object.keys(EXCLUDED_TABLES)];
    expect(classified.filter((name) => !schemaTables.includes(name))).toEqual([]);
  });

  it("never both backs up and excludes a table", () => {
    expect(BACKED_UP_TABLES.filter((name) => name in EXCLUDED_TABLES)).toEqual([]);
  });

  // The retention job is the code that keeps the policy's short windows. A
  // table it prunes holds rows promised to disappear, so a year-long copy of
  // it would break that promise.
  it("excludes every table the retention job prunes", () => {
    const retention = read("functions/api/admin/maintenance/retention.js");
    const pruned = [...new Set([...retention.matchAll(/DELETE FROM (\w+)/g)].map((m) => m[1]))];
    expect(pruned.length).toBeGreaterThan(5);
    expect(pruned.filter((name) => !(name in EXCLUDED_TABLES))).toEqual([]);
  });

  it("excludes schedule builds, whose visitor codes are anonymised after 30 days", () => {
    expect(read("functions/scheduled/anonymize-schedule-builds.js")).toContain("schedule_builds");
    expect(EXCLUDED_TABLES).toHaveProperty("schedule_builds");
  });
});

describe("buildBackup", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "d1-backup-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps the catalogue and empties the excluded tables, leaving no trace in the file", () => {
    const out = join(dir, "backup.db");
    const counts = buildBackup(exportWith(SEED), out);

    expect(counts.events).toBe(1);
    expect(counts.venues).toBe(1);
    expect(counts.auth_attempts).toBe(0);

    const backup = new DatabaseSync(out, { readOnly: true });
    expect(backup.prepare("SELECT slug FROM events").get().slug).toBe("backup-fest");
    expect(backup.prepare("SELECT COUNT(*) AS n FROM auth_attempts").get().n).toBe(0);
    // The schema survives the scrub, so a restore is complete.
    expect(backup.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'auth_attempts'").get().n).toBe(1);
    backup.close();

    // VACUUM INTO rewrites live pages only: the deleted row's bytes are gone.
    expect(readFileSync(out).includes(PRIVATE_EMAIL)).toBe(false);
  });

  it("clears credentials inside backed-up users, keeping encrypted TOTP secrets", () => {
    const out = join(dir, "backup.db");
    buildBackup(exportWith(SEED), out);

    const backup = new DatabaseSync(out, { readOnly: true });
    const users = backup
      .prepare(
        "SELECT id, activation_token, totp_secret, totp_enabled, totp_pending_secret, totp_pending_set_at FROM users ORDER BY id",
      )
      .all();
    backup.close();
    expect(users).toEqual([
      {
        id: 1,
        activation_token: null,
        totp_secret: null,
        totp_enabled: 0,
        totp_pending_secret: null,
        totp_pending_set_at: null,
      },
      {
        id: 2,
        activation_token: null,
        totp_secret: null,
        totp_enabled: 0,
        totp_pending_secret: null,
        totp_pending_set_at: null,
      },
      {
        id: 3,
        activation_token: null,
        totp_secret: "enc-v1:kept",
        totp_enabled: 1,
        totp_pending_secret: null,
        totp_pending_set_at: null,
      },
    ]);
    const bytes = readFileSync(out);
    expect(bytes.includes("activation-token-marker")).toBe(false);
    expect(bytes.includes("LEGACYTOTPSECRETMARKER")).toBe(false);
  });

  it("drops D1's own tables, which a restore cannot create", () => {
    const out = join(dir, "backup.db");
    buildBackup(exportWith(`${SEED} CREATE TABLE _cf_KV (key TEXT PRIMARY KEY, value BLOB);`), out);
    const backup = new DatabaseSync(out, { readOnly: true });
    expect(
      backup.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE '\\_cf\\_%' ESCAPE '\\'").get().n,
    ).toBe(0);
    backup.close();
  });

  it("never quotes export text in its error", () => {
    const out = join(dir, "backup.db");
    expect(() => buildBackup("INSERT INTO nowhere VALUES ('row-data-marker' oops);", out)).toThrow(
      /^the export did not load \(SQLite [^)]*\)$/,
    );
  });

  it("refuses an export with a table nobody classified, writing nothing", () => {
    const out = join(dir, "backup.db");
    expect(() => buildBackup(exportWith(`${SEED} CREATE TABLE fan_emails (email TEXT);`), out)).toThrow(
      /unclassified table\(s\): fan_emails/,
    );
    expect(existsSync(out)).toBe(false);
  });

  it("refuses an export that does not restore cleanly", () => {
    const out = join(dir, "backup.db");
    const orphan = `${SEED} INSERT INTO performances (event_id, venue_id, band_profile_id, start_time) VALUES (999, 1, 1, '20:00');`;
    expect(() => buildBackup(exportWith(orphan), out)).toThrow(/foreign_key_check/);
    expect(existsSync(out)).toBe(false);
  });

  it("refuses an export missing a backed-up table", () => {
    const out = join(dir, "backup.db");
    expect(() => buildBackup(exportWith(`${SEED} DROP TABLE event_hourly_views;`), out)).toThrow(
      /missing table\(s\): event_hourly_views/,
    );
    expect(existsSync(out)).toBe(false);
  });

  it("refuses an export missing an excluded table, whose schema the copy promises", () => {
    const out = join(dir, "backup.db");
    expect(() => buildBackup(exportWith(`${SEED} DROP TABLE auth_attempts;`), out)).toThrow(
      /missing table\(s\): auth_attempts/,
    );
    expect(existsSync(out)).toBe(false);
  });
});

describe("restoreSql", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "d1-restore-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // A description holding a line that reads COMMIT; and a quote: what broke
  // line-based stripping of a .dump, and what unistr() escapes D1 refuses.
  const TRICKY = "First line\nCOMMIT;\nO'Brien's last line";

  it("rebuilds the backup exactly, with D1-compatible SQL", () => {
    const out = join(dir, "backup.db");
    const seed = `${SEED} INSERT INTO band_profiles (id, name, name_normalized, description) VALUES (7, 'Tricky', 'tricky', '${TRICKY.replaceAll("'", "''")}');`;
    buildBackup(exportWith(seed), out);
    const sql = restoreSql(out);

    expect(sql).not.toMatch(/unistr\(|BEGIN TRANSACTION|_cf_/);
    expect(sql.startsWith("PRAGMA defer_foreign_keys=TRUE;\n")).toBe(true);

    const restored = new DatabaseSync(":memory:");
    restored.exec(sql);
    const original = new DatabaseSync(out, { readOnly: true });
    const tables = original
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => r.name);
    expect(tables.length).toBeGreaterThan(20);
    for (const name of tables) {
      const q = `SELECT * FROM "${name}" ORDER BY rowid`;
      expect(restored.prepare(q).all(), name).toEqual(original.prepare(q).all());
    }
    expect(restored.prepare("SELECT description FROM band_profiles WHERE id = 7").get().description).toBe(TRICKY);
    expect(restored.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    original.close();
    restored.close();
  });

  it("copies every row of every table, blobs, big integers and counters included", () => {
    const path = join(dir, "synthetic.db");
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id), data BLOB, big INTEGER, ratio REAL);
      CREATE INDEX idx_child_parent ON child(parent_id);
      INSERT INTO parent (label) VALUES ('a'), ('b'), ('c');
      DELETE FROM parent WHERE id = 3;
      INSERT INTO child VALUES (1, 2, X'00ff10', 9007199254740993, 0.25), (2, 1, NULL, -1, 1e-7);
    `);
    db.close();

    const restored = new DatabaseSync(":memory:");
    restored.exec(restoreSql(path));
    const rows = (q) => {
      const st = restored.prepare(q);
      st.setReadBigInts(true);
      return st.all();
    };
    expect(rows("SELECT id, label FROM parent ORDER BY id")).toEqual([
      { id: 1n, label: "a" },
      { id: 2n, label: "b" },
    ]);
    expect(rows("SELECT id, hex(data) AS data, big, ratio FROM child ORDER BY id")).toEqual([
      { id: 1n, data: "00FF10", big: 9007199254740993n, ratio: 0.25 },
      { id: 2n, data: "", big: -1n, ratio: 1e-7 },
    ]);
    // The AUTOINCREMENT counter survives, so a deleted id is never reused.
    restored.exec("INSERT INTO parent (label) VALUES ('d')");
    expect(rows("SELECT MAX(id) AS id FROM parent")[0].id).toBe(4n);
    expect(rows("SELECT name FROM sqlite_master WHERE name = 'idx_child_parent'")).toHaveLength(1);
    restored.close();
  });
});
