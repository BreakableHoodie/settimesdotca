#!/usr/bin/env node
// scripts/check-schema-drift.mjs
//
// Structurally compares database/setup-complete.sql (the bootstrap script that
// seeds every CI/E2E database) against the cumulative effect of migrations/*.sql
// applied in numeric order (what production actually has, via
// `wrangler d1 migrations apply <db> --remote`). The two must describe the same
// schema, or CI/E2E databases silently diverge from production and mutations
// against tables/columns/triggers that only exist in one of the two 500 in
// exactly the environment nobody is watching.
//
// Compares STRUCTURE, not raw SQL text — a textual diff false-positives on things
// like `IF NOT EXISTS`, comment differences, or whitespace/formatting that don't
// change the resulting schema. See issue #506.
//
// Usage: node scripts/check-schema-drift.mjs

import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

// ============================================================================
// ALLOWLIST — accepted divergences between setup-complete.sql and migrations/.
// Empty by default: as of #506, the two describe the same schema exactly.
//
// Add an entry here only for a deliberate, permanent divergence (e.g. a table
// that is intentionally migrations-only and never bootstrapped). Every entry
// must reference the issue that decided it's intentional — this is a
// documented exception list, not a place to silence real drift. If a table
// only differs temporarily (a migration hasn't landed on this branch yet,
// etc.), fix the source of drift instead of allowlisting it.
// ============================================================================
const ALLOWLIST = new Set([
  // (none — see #506)
]);

const SYSTEM_TABLE_PATTERNS = [/^sqlite_/i, /^d1_migrations$/i, /^_cf_/i];

function isSystemTable(name) {
  return SYSTEM_TABLE_PATTERNS.some((re) => re.test(name));
}

// ----------------------------------------------------------------------------
// DB construction
// ----------------------------------------------------------------------------

function buildFromSetupComplete() {
  const db = new Database(":memory:");
  const sql = readFileSync(path.join(rootDir, "database/setup-complete.sql"), "utf8");
  db.exec(sql);
  return db;
}

export function buildFromMigrations() {
  const db = new Database(":memory:");
  const migrationsDir = path.join(rootDir, "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // zero-padded NNNN_ prefixes sort numerically as strings

  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    applyMigration(db, sql, file);
  }
  return db;
}

function applyMigration(db, sql, filename) {
  try {
    db.exec(sql);
    return;
  } catch (wholeFileError) {
    // Some migrations mix PRAGMA/DDL/DML in ways a single exec() call can choke
    // on. Fall back to executing each top-level statement individually (still
    // whole-file semantics — just statement-by-statement instead of one call).
    try {
      for (const statement of splitStatements(sql)) {
        if (!statement.trim()) continue;
        try {
          db.exec(statement);
        } catch (statementError) {
          if (isHarmlessDuplicateColumn(statement, statementError)) {
            // Pre-existing quirk, not something this script should "fix": a few
            // migrations backfill columns onto tables for production databases
            // that predated a *later* migration's CREATE TABLE already
            // including that column (e.g. 0016 backfills password_reset_tokens
            // columns that 0003's CREATE TABLE IF NOT EXISTS already defines).
            // In production, migrations are only ever applied incrementally on
            // top of the existing DB (never replayed from empty), so this path
            // never actually fires there — it only surfaces here because we
            // replay 0001..N from scratch to reconstruct the cumulative schema.
            // Either way the column ends up present, so treat as satisfied.
            console.warn(`  (${filename}) skipping redundant ADD COLUMN — already present: ${statement.trim()}`);
            continue;
          }
          throw statementError;
        }
      }
    } catch (fallbackError) {
      throw new Error(
        `Failed to apply migration ${filename}:\n  whole-file error: ${wholeFileError.message}\n  fallback error: ${fallbackError.message}`,
        { cause: fallbackError },
      );
    }
  }
}

function isHarmlessDuplicateColumn(statement, error) {
  // Strip line comments first — a statement chunk from splitStatements() often
  // carries a leading `-- comment` line, which would otherwise defeat the
  // anchored ALTER TABLE check below.
  const withoutComments = statement.replace(/--[^\n]*/g, "").trim();
  return /^ALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN/i.test(withoutComments) && /duplicate column name/i.test(error.message);
}

// Splits a SQL file into top-level statements, treating `CREATE TRIGGER ... END;`
// blocks as a single atomic statement (they contain their own internal `;`s that
// must not be split on). Not a general SQL parser — sufficient for this repo's
// migration files.
function splitStatements(sql) {
  const triggerBlocks = [];
  const placeholder = (i) => `__TRIGGER_BLOCK_${i}__`;

  const withPlaceholders = sql.replace(/CREATE\s+TRIGGER[\s\S]*?\bEND\s*;/gi, (match) => {
    const idx = triggerBlocks.length;
    triggerBlocks.push(match);
    return `${placeholder(idx)};`;
  });

  return withPlaceholders
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((stmt) => {
      const m = stmt.match(/^__TRIGGER_BLOCK_(\d+)__$/);
      return m ? triggerBlocks[Number(m[1])] : `${stmt};`;
    });
}

// ----------------------------------------------------------------------------
// Introspection
// ----------------------------------------------------------------------------

function getUserTables(db) {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all()
    .map((r) => r.name)
    .filter((n) => !isSystemTable(n));
}

function getColumns(db, table) {
  return db.pragma(`table_info("${table}")`).map(({ name, type, notnull, dflt_value, pk }) => ({
    name,
    type: normalizeText(type),
    notnull,
    dflt_value: normalizeText(dflt_value),
    pk,
  }));
}

function getForeignKeys(db, table) {
  return db
    .pragma(`foreign_key_list("${table}")`)
    .map(({ table: refTable, from, to, on_update, on_delete, match }) => ({
      refTable,
      from,
      to,
      on_update,
      on_delete,
      match,
    }))
    .sort((a, b) => (a.from + a.refTable).localeCompare(b.from + b.refTable));
}

function getIndexes(db, table) {
  return db
    .pragma(`index_list("${table}")`)
    .filter((idx) => !idx.name.startsWith("sqlite_autoindex_"))
    .map((idx) => ({
      name: idx.name,
      unique: !!idx.unique,
      columns: db.pragma(`index_info("${idx.name}")`).map((c) => c.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getTriggerNames(db, table) {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? ORDER BY name`)
    .all(table)
    .map((r) => r.name);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : value;
}

// ----------------------------------------------------------------------------
// Diffing
// ----------------------------------------------------------------------------

function diffColumns(colsA, colsB) {
  const messages = [];
  const mapA = new Map(colsA.map((c) => [c.name, c]));
  const mapB = new Map(colsB.map((c) => [c.name, c]));

  for (const name of mapB.keys()) {
    if (!mapA.has(name)) messages.push(`column '${name}' missing from setup-complete.sql`);
  }
  for (const name of mapA.keys()) {
    if (!mapB.has(name)) messages.push(`column '${name}' present in setup-complete.sql but not produced by migrations`);
  }
  for (const [name, colB] of mapB) {
    const colA = mapA.get(name);
    if (!colA) continue;
    for (const field of ["type", "notnull", "dflt_value", "pk"]) {
      if (colA[field] !== colB[field]) {
        messages.push(
          `column '${name}' ${field} mismatch: setup-complete=${JSON.stringify(colA[field])} vs migrations=${JSON.stringify(colB[field])}`,
        );
      }
    }
  }
  return messages;
}

function diffJson(label, a, b) {
  const normA = JSON.stringify(a);
  const normB = JSON.stringify(b);
  if (normA === normB) return null;
  return `${label} differ:\n      setup-complete: ${normA}\n      migrations:     ${normB}`;
}

function diffTable(dbA, dbB, table) {
  const messages = [];

  messages.push(...diffColumns(getColumns(dbA, table), getColumns(dbB, table)));

  const fkMsg = diffJson("foreign keys", getForeignKeys(dbA, table), getForeignKeys(dbB, table));
  if (fkMsg) messages.push(fkMsg);

  const idxMsg = diffJson("indexes", getIndexes(dbA, table), getIndexes(dbB, table));
  if (idxMsg) messages.push(idxMsg);

  const trigMsg = diffJson("triggers", getTriggerNames(dbA, table), getTriggerNames(dbB, table));
  if (trigMsg) messages.push(trigMsg);

  return messages;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

function main() {
  console.log("Building DB A from database/setup-complete.sql...");
  const dbA = buildFromSetupComplete();

  console.log("Building DB B from migrations/*.sql applied in order...");
  const dbB = buildFromMigrations();

  const tablesA = new Set(getUserTables(dbA));
  const tablesB = new Set(getUserTables(dbB));
  const allTables = [...new Set([...tablesA, ...tablesB])].sort();

  const failures = [];
  const allowlisted = [];

  for (const table of allTables) {
    if (ALLOWLIST.has(table)) {
      allowlisted.push(table);
      continue;
    }

    const inA = tablesA.has(table);
    const inB = tablesB.has(table);
    let messages;

    if (!inA && inB) {
      messages = ["table missing from setup-complete.sql (present in migrations)"];
    } else if (inA && !inB) {
      messages = ["table present in setup-complete.sql but not produced by migrations"];
    } else {
      messages = diffTable(dbA, dbB, table);
    }

    if (messages.length) failures.push({ table, messages });
  }

  dbA.close();
  dbB.close();

  if (failures.length) {
    console.error("\nSchema drift detected between database/setup-complete.sql and migrations/:\n");
    for (const { table, messages } of failures) {
      console.error(`  ${table}:`);
      for (const m of messages) console.error(`    - ${m}`);
    }
    console.error(
      `\n${failures.length} table(s) diverged (checked ${allTables.length - allowlisted.length} of ${allTables.length}; allowlisted: ${allowlisted.join(", ") || "none"}).`,
    );
    console.error(
      "Fix database/setup-complete.sql to match migrations/, or add a justified entry to the ALLOWLIST at the top of this script referencing an issue.",
    );
    process.exit(1);
  }

  console.log(
    `\nOK: database/setup-complete.sql matches migrations/ for ${allTables.length - allowlisted.length} table(s) (allowlisted: ${allowlisted.join(", ") || "none"}).`,
  );
}

// Run the check only when executed directly — scripts/regenerate-setup-complete.mjs
// imports buildFromMigrations() from this module and must not trigger a check.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
