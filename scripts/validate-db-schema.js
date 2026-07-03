#!/usr/bin/env node
import { access, constants, readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

const FILE_RULES = [
  {
    path: "database/setup-complete.sql",
    tables: [
      "events",
      "venues",
      "performances",
      "band_profiles",
      "artist_daily_stats",
      "page_views_daily",
      "users",
      "sessions",
      "audit_log",
    ],
    requiredColumns: {
      performances: ["band_profile_id", "venue_id", "start_time", "end_time"],
      band_profiles: ["name", "name_normalized", "genre", "origin_city", "origin_region", "social_links", "photo_url"],
      venues: ["address_line1", "address_line2", "city", "region", "postal_code", "country"],
      events: ["description", "city", "ticket_url"],
    },
  },
];

async function ensureFile(rule) {
  const target = path.join(rootDir, rule.path);
  await access(target, constants.F_OK);
  const sql = await readFile(target, "utf8");
  if (!sql.trim()) {
    throw new Error(`${rule.path} is empty`);
  }

  const missingTables = rule.tables.filter((table) => !hasCreateTable(sql, table));
  if (missingTables.length) {
    throw new Error(
      `${rule.path} is missing required tables: ${missingTables.join(", ")}. ` +
        "Run the latest migrations and regenerate the schema file.",
    );
  }

  const missingColumns = Object.entries(rule.requiredColumns || {}).flatMap(([table, columns]) =>
    columns.filter((column) => !hasColumn(sql, table, column)).map((column) => `${table}.${column}`),
  );

  if (missingColumns.length) {
    throw new Error(
      `${rule.path} is missing required columns: ${missingColumns.join(", ")}. ` +
        "Run the latest migrations and regenerate the schema file.",
    );
  }

  return { file: rule.path, tables: rule.tables.length };
}

function hasCreateTable(sql, table) {
  const pattern = new RegExp(`CREATE\\s+TABLE[^;]*\\b${table}\\b`, "i");
  return pattern.test(sql);
}

function hasColumn(sql, table, column) {
  // Table names may be quoted in generated SQL (sqlite_master preserves the
  // original CREATE text, and migration 0032's recreated `"performances"`
  // carries its quotes into the regenerated setup-complete.sql).
  const tablePattern = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?"?${table}"?\\s*\\((.*?)\\)\\s*;`,
    "is",
  );
  const tableMatch = sql.match(tablePattern);
  if (!tableMatch) return false;

  const columnPattern = new RegExp(`\\b${column}\\b`, "i");
  return columnPattern.test(tableMatch[1]);
}

async function main() {
  try {
    const summaries = [];
    for (const rule of FILE_RULES) {
      summaries.push(await ensureFile(rule));
    }

    console.log("✅ Database schema validated:");
    for (const summary of summaries) {
      console.log(`  • ${summary.file} (${summary.tables} required tables present)`);
    }
  } catch (error) {
    console.error("❌ Schema validation failed:");
    console.error(error.message);
    process.exit(1);
  }
}

main();
