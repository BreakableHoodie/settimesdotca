#!/usr/bin/env node
// Regenerates database/setup-complete.sql from the cumulative migrations replay.
//
// database/setup-complete.sql bootstraps every CI/E2E database in one shot and
// MUST be schema-identical to applying migrations/0001..N in order (#506 —
// years of hand-maintenance had drifted it from production on whole tables,
// columns, foreign keys, indexes, and triggers). This script makes syncing
// mechanical instead of manual:
//
//   1. Replays every migrations/*.sql into an in-memory SQLite DB
//      (via buildFromMigrations from scripts/check-schema-drift.mjs).
//   2. Dumps the resulting schema objects in creation order (FK-safe),
//      normalized to IF NOT EXISTS form.
//   3. Carries the SEED DATA section forward verbatim from the current
//      database/setup-complete.sql (seed rows are data, not schema — the
//      drift guard deliberately ignores them).
//
// Workflow after any schema change:
//   node scripts/regenerate-setup-complete.mjs   # rewrite the bootstrap
//   node scripts/check-schema-drift.mjs          # verify (also runs in CI)

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFromMigrations } from "./check-schema-drift.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const targetPath = path.join(rootDir, "database/setup-complete.sql");

const SYSTEM_TABLE_PATTERNS = [/^sqlite_/i, /^d1_migrations$/i, /^_cf_/i];

function isSystemObject(row) {
  return SYSTEM_TABLE_PATTERNS.some((re) => re.test(row.tbl_name || row.name));
}

// sqlite_master stores each object's original CREATE text; normalize to the
// idempotent form the bootstrap file uses throughout.
function toIfNotExists(sql) {
  return sql.replace(
    /^CREATE\s+(TABLE|(?:UNIQUE\s+)?INDEX|TRIGGER)\s+(?!IF\s+NOT\s+EXISTS)/i,
    "CREATE $1 IF NOT EXISTS ",
  );
}

function extractSeedSection(currentFile) {
  const match = currentFile.match(/^-- =+\n-- TEST ACCOUNTS[\s\S]*$/m);
  if (!match) {
    throw new Error(
      "Could not locate the '-- TEST ACCOUNTS' banner in database/setup-complete.sql — refusing to regenerate without carrying the seed rows forward.",
    );
  }
  return match[0].trimEnd() + "\n";
}

function main() {
  const currentFile = readFileSync(targetPath, "utf8");
  const seedSection = extractSeedSection(currentFile);

  console.log("Replaying migrations/*.sql...");
  const db = buildFromMigrations();

  const objects = db
    .prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_master
       WHERE sql IS NOT NULL AND type IN ('table', 'index', 'trigger')
       ORDER BY rowid`,
    )
    .all()
    .filter((row) => !isSystemObject(row));
  db.close();

  const header = `-- Complete Local Development Database Setup
-- Usage: sqlite3 <database-file> < database/setup-complete.sql
--
-- GENERATED FILE — do not hand-edit the schema section.
-- Regenerate with:  node scripts/regenerate-setup-complete.mjs
-- Verified in CI by: node scripts/check-schema-drift.mjs (quality.yml)
--
-- Schema below is the exact cumulative result of migrations/0001..N replayed
-- in order (#506). To change the schema, add a migration and regenerate.
-- The SEED DATA section at the bottom is carried forward as-is.

-- ============================================
-- SCHEMA (generated from migrations/)
-- ============================================
`;

  const body = objects.map((row) => toIfNotExists(row.sql.trim()) + ";").join("\n\n");

  writeFileSync(targetPath, `${header}\n${body}\n\n${seedSection}`);
  console.log(
    `Wrote ${path.relative(rootDir, targetPath)}: ${objects.filter((o) => o.type === "table").length} tables, ` +
      `${objects.filter((o) => o.type === "index").length} indexes, ` +
      `${objects.filter((o) => o.type === "trigger").length} triggers (+ seed section carried forward).`,
  );
}

main();
