#!/usr/bin/env node
// Turn a full `wrangler d1 export` of production into the offsite backup
// copy (#1479): restore it into SQLite, prove it is sound, empty every table
// whose rows the privacy policy promises to delete sooner than a backup
// lives, and write the result as one SQLite file.
//
//   node scripts/d1-backup.mjs <export.sql> <backup.db>
//
// Why one full export and a scrub, not per-table exports: `wrangler d1
// export` takes a single `--table`, and every export LOCKS production
// (docs/field-notes/backup-restore.md). One lock a month is the agreed cost.
//
// Excluded tables keep their schema and lose their rows, so a restore has the
// complete schema and only the short-lived data is missing. A table this file
// does not classify fails the backup: a new table may hold personal data, and
// it is not this script's call whether a year-long copy of it is allowed.

import { readFileSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

/**
 * Tables copied offsite. Everything needed to rebuild the site: the
 * catalogue, the accounts that run it, and aggregate counts with no visitor
 * information.
 */
export const BACKED_UP_TABLES = Object.freeze([
  "api_keys",
  "artist_daily_stats",
  "band_profiles",
  "event_daily_stats",
  "event_hourly_views",
  "event_share_totals",
  "event_venue_delays",
  "events",
  "invite_codes",
  "page_views_daily",
  "performances",
  "referrer_daily_stats",
  "users",
  "venues",
  "webauthn_credentials",
]);

/**
 * Tables whose rows never leave production, each with the promise that a
 * 400-day offsite copy would break (frontend/src/pages/PrivacyPage.jsx's
 * retention table, enforced by functions/api/admin/maintenance/retention.js
 * and functions/scheduled/anonymize-schedule-builds.js).
 */
export const EXCLUDED_TABLES = Object.freeze({
  audit_log: "admin action log: 1 year (api_key.request rows: 90 days)",
  auth_attempts: "login attempt log (IPs, emails): 30 days",
  auth_audit: "security audit log (IPs, events): 90 days",
  email_otp_codes: "deleted at expiry",
  lucia_sessions: "deleted at expiry",
  mfa_challenges: "deleted at expiry",
  password_reset_tokens: "deleted at expiry",
  rate_limits: "rate-limit counters: about 25 hours; per-address email limit: about 2 days",
  schedule_builds: "visitor codes anonymised 30 days after the event",
  share_link_views: "one-way visitor code per link: deleted with the link",
  share_links: "shared schedule links: expire after 30 days",
  trusted_devices: "deleted at expiry",
});

/**
 * Credentials inside backed-up tables, cleared in the copy. Each would let
 * whoever holds a leaked copy act as someone (the #1334/#1354 reasoning), and
 * none is needed to rebuild the site: an unactivated invitee asks for a new
 * link, a half-finished authenticator move starts again, and an account whose
 * TOTP secret predates encryption re-enrols (admins and editors are made to).
 */
export const SCRUB_UPDATES = Object.freeze([
  {
    why: "activation tokens are stored in plaintext and redeemable, some with no expiry",
    sql: "UPDATE users SET activation_token = NULL, activation_token_expires_at = NULL WHERE activation_token IS NOT NULL OR activation_token_expires_at IS NOT NULL",
  },
  {
    why: "a pending authenticator move lives 15 minutes",
    sql: "UPDATE users SET totp_pending_secret = NULL, totp_pending_set_at = NULL WHERE totp_pending_secret IS NOT NULL OR totp_pending_set_at IS NOT NULL",
  },
  {
    why: "a TOTP secret from before encryption (no enc-v1: prefix) is a usable second factor",
    sql: "UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_last_step = NULL WHERE totp_secret IS NOT NULL AND totp_secret NOT LIKE 'enc-v1:%'",
  },
]);

/** SQLite and D1 bookkeeping, kept as is. `d1_migrations` records the schema level. */
export function isInternalTable(name) {
  return name === "d1_migrations" || name.startsWith("sqlite_") || name.startsWith("_cf_");
}

/** Tables in `names` that are neither backed up, excluded, nor internal. */
export function unclassifiedTables(names) {
  return names.filter(
    (name) => !isInternalTable(name) && !BACKED_UP_TABLES.includes(name) && !(name in EXCLUDED_TABLES),
  );
}

const quoteIdent = (name) => `"${name.replaceAll('"', '""')}"`;

/**
 * Restore `exportSql` into a fresh database, verify it, scrub it and write
 * the backup to `outPath`. Returns per-table row counts of the backup.
 * Throws, writing nothing, on any failed check.
 */
export function buildBackup(exportSql, outPath) {
  // Foreign keys off while restoring, as the sqlite3 CLI does: an export
  // inserts table by table, not in dependency order. foreign_key_check below
  // then proves every reference resolves.
  const db = new DatabaseSync(":memory:", { enableForeignKeyConstraints: false });
  try {
    try {
      db.exec(exportSql);
    } catch (error) {
      // SQLite quotes the text near a syntax error, which could be row data,
      // and this message reaches a public workflow log. Report the code only.
      // The CLI below prints `message` only, never `cause`.
      throw new Error(`the export did not load (SQLite ${error.errcode ?? error.code ?? "error"})`, { cause: error });
    }

    const integrity = db.prepare("PRAGMA integrity_check").all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
      throw new Error(`integrity_check failed: ${JSON.stringify(integrity.slice(0, 5))}`);
    }
    const fkViolations = db.prepare("PRAGMA foreign_key_check").all();
    if (fkViolations.length > 0) {
      throw new Error(`foreign_key_check found ${fkViolations.length} violation(s)`);
    }

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);
    const unknown = unclassifiedTables(tables);
    if (unknown.length > 0) {
      throw new Error(
        `unclassified table(s): ${unknown.join(", ")}. Add each to BACKED_UP_TABLES or EXCLUDED_TABLES in scripts/d1-backup.mjs.`,
      );
    }
    const missing = BACKED_UP_TABLES.filter((name) => !tables.includes(name));
    if (missing.length > 0) {
      throw new Error(`export is missing backed-up table(s): ${missing.join(", ")}`);
    }

    for (const name of tables) {
      if (name in EXCLUDED_TABLES) db.exec(`DELETE FROM ${quoteIdent(name)}`);
    }
    for (const { sql } of SCRUB_UPDATES) db.exec(sql);
    // D1's own tables (_cf_KV) cannot be created by a restore; D1 makes them.
    for (const name of tables) {
      if (name.startsWith("_cf_")) db.exec(`DROP TABLE ${quoteIdent(name)}`);
    }

    // A backed-up row pointing at an emptied table would restore broken.
    const danglingAfterScrub = db.prepare("PRAGMA foreign_key_check").all();
    if (danglingAfterScrub.length > 0) {
      const tablesHit = [...new Set(danglingAfterScrub.map((row) => `${row.table} -> ${row.parent}`))];
      throw new Error(`the scrub left dangling references: ${tablesHit.join(", ")}`);
    }

    const counts = {};
    for (const name of tables) {
      if (isInternalTable(name)) continue;
      counts[name] = db.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdent(name)}`).get().n;
      if (name in EXCLUDED_TABLES && counts[name] !== 0) {
        throw new Error(`excluded table ${name} still has ${counts[name]} row(s) after the scrub`);
      }
    }

    const leftover = db
      .prepare(
        "SELECT COUNT(*) AS n FROM users WHERE activation_token IS NOT NULL OR totp_pending_secret IS NOT NULL OR (totp_secret IS NOT NULL AND totp_secret NOT LIKE 'enc-v1:%')",
      )
      .get().n;
    if (leftover !== 0) throw new Error(`${leftover} user row(s) still hold a credential after the scrub`);

    // VACUUM INTO writes a fresh file from live pages only, so the deleted
    // rows cannot survive in free pages of the copy.
    rmSync(outPath, { force: true });
    db.prepare("VACUUM INTO ?").run(outPath);
    return counts;
  } finally {
    db.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [exportPath, outPath] = process.argv.slice(2);
  if (!exportPath || !outPath) {
    console.error("usage: node scripts/d1-backup.mjs <export.sql> <backup.db>");
    process.exit(2);
  }
  try {
    const counts = buildBackup(readFileSync(exportPath, "utf8"), outPath);
    // Counts only: table names and row totals, never row contents. This
    // output lands in a public repository's workflow log.
    for (const [name, n] of Object.entries(counts)) console.log(`${name}\t${n}`);
  } catch (error) {
    console.error(`[d1-backup] ${error.message}`);
    process.exit(1);
  }
}
