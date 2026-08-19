#!/usr/bin/env node
/**
 * Audit every Spotify / Apple Music link on the roster for *identity*, not
 * merely existence (#788).
 *
 * `hasField()` in frontend/src/admin/utils/bandFields.js can only tell you a
 * link resolves to a real href. It cannot tell you the href points at the
 * right artist. A wrong link is invisible to every existing check and is
 * strictly worse than a blank field: a blank field shows up in the roster gap
 * filter, while a wrong one silently sends fans to a stranger's music.
 *
 * The audit is keyless and cheap — no API credentials, no rate-limited
 * developer app:
 *
 *   Spotify      GET https://open.spotify.com/oembed?url=<artist url>  -> .title
 *   Apple Music  GET https://itunes.apple.com/lookup?id=<artist id>    -> .artistName
 *
 * Usage:
 *   node scripts/audit-streaming-link-identity.mjs <d1-database-name>
 *   D1_DATABASE_NAME=<name> node scripts/audit-streaming-link-identity.mjs
 *
 * Exit codes:  0 = no mismatches   1 = at least one MISMATCH   2 = usage/setup
 *
 * Why three buckets and not two: name comparison alone produces false
 * positives that a human must not be asked to re-adjudicate every run. The
 * 2026-08-14 pass found six genuinely wrong links, but also flagged four
 * artists whose links were correct — `I CAN'T RƎMƎMBƎR` (stylised reversed E)
 * and three billing variants such as "Charlie Weber" for
 * "Charlie Weber & the Glorious Failures". Those belong in REVIEW, never in
 * MISMATCH, or the signal drowns.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const execFileAsync = promisify(execFile);
const wranglerBin = path.resolve("frontend", "node_modules", ".bin", "wrangler");

function resolveDatabaseName() {
  const name = process.argv[2]?.trim() || process.env.D1_DATABASE_NAME?.trim();
  if (!name) {
    console.error("Usage: node scripts/audit-streaming-link-identity.mjs <d1-database-name>");
    console.error("   or: D1_DATABASE_NAME=<name> node scripts/audit-streaming-link-identity.mjs");
    process.exit(2);
  }
  // Same guard as verify-remote-d1-schema.mjs: the name lands in an argv slot,
  // so reject anything that is not a plain identifier.
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    console.error(`Invalid D1 database name: ${name}`);
    process.exit(2);
  }
  return name;
}

async function queryRoster(databaseName) {
  try {
    await access(wranglerBin);
  } catch {
    console.error(`Wrangler not found at ${wranglerBin}. Run \`npm ci\` inside frontend/.`);
    process.exit(2);
  }

  const sql =
    "SELECT id, name, social_links FROM band_profiles " +
    "WHERE is_active = 1 AND social_links IS NOT NULL ORDER BY id";

  const { stdout } = await execFileAsync(
    wranglerBin,
    ["d1", "execute", databaseName, "--remote", "--json", "--command", sql],
    { cwd: process.cwd(), env: process.env, maxBuffer: 1024 * 1024 * 16 },
  );

  // Wrangler prefixes the JSON with human-readable banner lines, so slice from
  // the first bracket rather than JSON.parse-ing the whole stream.
  const start = stdout.indexOf("[");
  if (start === -1) throw new Error("No JSON array in wrangler output");
  const parsed = JSON.parse(stdout.slice(start));
  return parsed[0]?.results ?? [];
}

/**
 * Fold a name to a comparable form.
 *
 * Deliberately NOT a bare ASCII strip. The previous audit's normaliser dropped
 * non-ASCII entirely, which turned `I CAN'T RƎMƎMBƎR` into a false positive
 * against "I Can't Remember" — same band, stylised glyph. NFKD plus a small
 * homoglyph map folds the stylisation instead of deleting it.
 */
const HOMOGLYPHS = new Map([
  ["Ǝ", "e"],
  ["ǝ", "e"],
  ["Ø", "o"],
  ["ø", "o"],
  ["Ð", "d"],
  ["Æ", "ae"],
  ["æ", "ae"],
  ["ß", "ss"],
]);

export function normalise(raw) {
  if (typeof raw !== "string") return "";
  let s = raw;
  for (const [from, to] of HOMOGLYPHS) s = s.split(from).join(to);
  return s
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A leading article is billing, not identity ("The OBGMs" = "OBGMs"). */
export function withoutArticle(s) {
  return s.replace(/^(the|a|an)\s+/, "");
}

/**
 * Whole-token containment.
 *
 * Raw substring containment matches mid-word: a db name of "sun" is contained
 * in "sunday blues", and "beat" in "beatles" — both genuinely wrong links, and
 * both would land in REVIEW rather than MISMATCH and therefore pass with exit
 * 0, inverting this file's whole point. Padding both sides forces a token
 * boundary, while still resolving the documented billing case ("Scott
 * Reynolds" inside "Scott Reynolds Band") to REVIEW.
 */
export function containsTokens(haystack, needle) {
  return ` ${haystack} `.includes(` ${needle} `);
}

export function classify(dbName, platformName) {
  if (!platformName) return "UNRESOLVED";
  const a = withoutArticle(normalise(dbName));
  const b = withoutArticle(normalise(platformName));
  if (!a || !b) return "UNRESOLVED";
  if (a === b) return "OK";
  // Spacing-only difference: normalise() turns every non-alphanumeric run into
  // a space, so intra-word punctuation splits a token ("K-Man" -> "k man") and
  // no longer equals its unpunctuated twin ("Kman"). Real case, #171: our
  // "Kman & the 45s" vs the platform's "K-Man & The 45s", whose Apple slug is
  // literally k-man-the-45s. Equality-after-despacing (never containment,
  // which would collapse genuinely different names) folds that back to OK, so
  // it does not pollute MISMATCH — the one bucket that means fans are being
  // sent to a stranger's music.
  if (a.replace(/ /g, "") === b.replace(/ /g, "")) return "OK";
  // Billing variant: one name contains the other, e.g. Spotify lists
  // "Scott Reynolds" for our "Scott Reynolds Band". Related, not wrong.
  if (containsTokens(a, b) || containsTokens(b, a)) return "REVIEW";
  return "MISMATCH";
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "settimes-link-audit" } });
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    // A transient network failure must not read as a wrong link. Returning
    // undefined lands the row in UNRESOLVED, which is reported but never sets
    // the failing exit code — only a positive MISMATCH does.
    return undefined;
  }
}

async function spotifyName(url) {
  const data = await fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
  return data?.title ?? undefined;
}

async function appleName(url) {
  // .../artist/<slug>/<numeric id> — the id is the last path segment, and
  // reading it off the parsed pathname survives a trailing slash, a query
  // string and a #fragment. A regex anchored on "?-or-end-of-string" missed
  // all three, dropping a perfectly resolvable link into UNRESOLVED.
  let id;
  try {
    id = new URL(url).pathname.split("/").filter(Boolean).at(-1);
  } catch {
    return undefined;
  }
  if (!/^\d+$/.test(id ?? "")) return undefined;
  const data = await fetchJson(`https://itunes.apple.com/lookup?id=${id}`);
  return data?.results?.[0]?.artistName ?? undefined;
}

async function main() {
  const databaseName = resolveDatabaseName();
  const rows = await queryRoster(databaseName);

  const checks = [];
  for (const row of rows) {
    let links;
    try {
      links = JSON.parse(row.social_links);
    } catch {
      continue; // malformed JSON is a different defect, not this audit's job
    }
    if (links?.spotify) checks.push({ ...row, platform: "spotify", url: links.spotify });
    if (links?.apple_music) checks.push({ ...row, platform: "apple_music", url: links.apple_music });
  }

  console.log(`Auditing ${checks.length} streaming links across ${rows.length} active profiles...\n`);

  const buckets = { OK: [], REVIEW: [], MISMATCH: [], UNRESOLVED: [] };

  // Sequential on purpose. Both endpoints are unauthenticated courtesy APIs; a
  // parallel burst across ~150 links is the quickest way to get throttled and
  // turn correct links into UNRESOLVED noise. A full pass takes a few minutes.
  for (const check of checks) {
    const platformName = check.platform === "spotify" ? await spotifyName(check.url) : await appleName(check.url);
    const verdict = classify(check.name, platformName);
    buckets[verdict].push({ ...check, platformName });
    if (verdict === "MISMATCH" || verdict === "REVIEW") {
      console.log(
        `${verdict.padEnd(10)} #${check.id} ${check.platform.padEnd(12)} ` +
          `db="${check.name}" platform="${platformName}"`,
      );
    }
  }

  console.log(
    `\nOK ${buckets.OK.length} - REVIEW ${buckets.REVIEW.length} - ` +
      `MISMATCH ${buckets.MISMATCH.length} - UNRESOLVED ${buckets.UNRESOLVED.length}`,
  );

  if (buckets.UNRESOLVED.length) {
    console.log("\nUNRESOLVED (no name returned - dead link, throttling, or unparseable id):");
    for (const u of buckets.UNRESOLVED) console.log(`  #${u.id} ${u.platform} ${u.name} - ${u.url}`);
  }

  if (buckets.MISMATCH.length) {
    console.log(
      "\nA MISMATCH points fans at a different artist. Null the link rather than " +
        "leaving it live - a blank field is strictly better, and the roster gap " +
        "filter will then surface the profile as missing.",
    );
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    if (err.stderr) console.error(err.stderr);
    if (err.code !== undefined) console.error(`Code: ${err.code}`);
    process.exit(2);
  });
}
