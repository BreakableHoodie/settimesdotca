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
 * Exit codes:  0 = no mismatches or undecided reviews
 *             1 = at least one MISMATCH
 *             2 = usage/setup or malformed decision register
 *             3 = at least one undecided REVIEW
 *
 * Why three decision buckets and not two: name comparison alone produces
 * false positives that a human must not be asked to re-adjudicate every run. The
 * 2026-08-14 pass found six genuinely wrong links, but also flagged four
 * artists whose links were correct — `I CAN'T RƎMƎMBƎR` (stylised reversed E)
 * and three billing variants such as "Charlie Weber" for
 * "Charlie Weber & the Glorious Failures". Those belong in REVIEW until a
 * human records a decision, never in MISMATCH, or the signal drowns. A
 * same-artist decision is counted separately as OK_DECIDED so it stays visible.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateDate } from "../functions/utils/validation/datetime.js";
import path from "node:path";

const execFileAsync = promisify(execFile);
const wranglerBin = path.resolve("frontend", "node_modules", ".bin", "wrangler");
const decisionRegisterPath = path.resolve("scripts", "streaming-link-decisions.json");

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

/**
 * Normalise with hyphens deleted rather than treated as separators, so
 * "K-Man" and "Kman" agree. Covers the ASCII hyphen plus the Unicode dash
 * range (U+2010-U+2015), which platform metadata does use.
 */
export function normaliseIgnoringHyphens(raw) {
  if (typeof raw !== "string") return "";
  return withoutArticle(normalise(raw.replace(/[-\u2010-\u2015]/g, "")));
}

export function classify(dbName, platformName) {
  if (!platformName) return "UNRESOLVED";
  const a = withoutArticle(normalise(dbName));
  const b = withoutArticle(normalise(platformName));
  if (!a || !b) return "UNRESOLVED";
  if (a === b) return "OK";
  // Hyphenation variant. normalise() turns every non-alphanumeric run into a
  // space, so intra-word punctuation splits a token ("K-Man" -> "k man") and
  // stops equalling its unpunctuated twin ("Kman"). Real case, #171: our
  // "Kman & the 45s" vs the platform's "K-Man & The 45s", whose Apple slug is
  // literally k-man-the-45s.
  //
  // Deliberately narrow: strip ONLY hyphens from the raw name, then normalise
  // as usual. The obvious shortcut -- comparing both sides with all spaces
  // removed -- also erases genuine word boundaries, so "Sea Lion" and
  // "Seal Ion" would both fold to "sealion" and be called the same artist.
  // That would hide exactly the mismatch this script exists to find.
  if (normaliseIgnoringHyphens(dbName) === normaliseIgnoringHyphens(platformName)) return "OK";
  // Billing variant: one name contains the other, e.g. Spotify lists
  // "Scott Reynolds" for our "Scott Reynolds Band". Related, not wrong.
  if (containsTokens(a, b) || containsTokens(b, a)) return "REVIEW";
  return "MISMATCH";
}

const DECISIONS = new Set(["same-artist", "different-artist"]);
const PLATFORMS = new Set(["spotify", "apple"]);

/** Uniqueness key for a register entry: profile, platform ("spotify"|"apple"), and the platform name as observed. */
export function decisionKey(bandProfileId, platform, platformName) {
  return `${bandProfileId}|${platform}|${platformName}`;
}

/**
 * Validate the decision register's shape and return it unchanged.
 * @param {unknown} register - parsed contents of streaming-link-decisions.json
 * @returns {Array<object>} the same array
 * @throws {Error} naming the first bad entry: not an array, a non-object entry, a bad bandProfileId /
 *   platform / platformName / decision / reason / decidedOn (YYYY-MM-DD), or a duplicate key. main() maps
 *   any throw to exit 2 -- a register that silently failed to load would make every decision vanish.
 */
export function validateDecisionRegister(register) {
  if (!Array.isArray(register)) throw new Error("Streaming-link decision register must be an array");

  const keys = new Set();
  for (const [index, entry] of register.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Streaming-link decision ${index + 1} must be an object`);
    }
    if (!Number.isInteger(entry.bandProfileId) || entry.bandProfileId < 1) {
      throw new Error(`Streaming-link decision ${index + 1} has an invalid bandProfileId`);
    }
    if (!PLATFORMS.has(entry.platform)) {
      throw new Error(`Streaming-link decision ${index + 1} has an invalid platform`);
    }
    if (typeof entry.platformName !== "string" || !entry.platformName) {
      throw new Error(`Streaming-link decision ${index + 1} has an invalid platformName`);
    }
    if (!DECISIONS.has(entry.decision)) {
      throw new Error(`Streaming-link decision ${index + 1} has an invalid decision`);
    }
    if (typeof entry.reason !== "string" || !entry.reason) {
      throw new Error(`Streaming-link decision ${index + 1} has an invalid reason`);
    }
    // validateDate() checks the calendar, not just the shape: 2026-02-31 and a
    // non-leap Feb 29 are rejected. Reused rather than re-implemented.
    if (typeof entry.decidedOn !== "string" || !validateDate(entry.decidedOn).valid) {
      throw new Error(`Streaming-link decision ${index + 1} has an invalid decidedOn`);
    }

    const key = decisionKey(entry.bandProfileId, entry.platform, entry.platformName);
    if (keys.has(key)) throw new Error(`Streaming-link decision ${index + 1} duplicates ${key}`);
    keys.add(key);
  }

  return register;
}

/**
 * Read and validate the register (defaults to scripts/streaming-link-decisions.json).
 * @throws {Error} if the file is missing, is not JSON, or fails validateDecisionRegister().
 */
export async function loadDecisionRegister(filePath = decisionRegisterPath) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to load streaming-link decision register: ${error.message}`, { cause: error });
  }
  return validateDecisionRegister(parsed);
}

function platformKey(platform) {
  return platform === "apple_music" ? "apple" : platform;
}

/**
 * Apply a recorded human decision to classify()'s verdict.
 * Matches on profile id, platform (apple_music rows map to "apple") and the platform name AS OBSERVED,
 * so a link repointed to a different artist never inherits an old decision.
 * @returns {{ verdict: string, decision: object|undefined }} same-artist -> "OK_DECIDED";
 *   different-artist -> "MISMATCH"; no matching decision -> classify()'s verdict unchanged.
 */
export function resolveDecision(classified, check, register) {
  const decision = register.find(
    (entry) =>
      entry.bandProfileId === check.id &&
      entry.platform === platformKey(check.platform) &&
      entry.platformName === check.platformName,
  );
  if (!decision) return { verdict: classified, decision: undefined };
  return {
    verdict: decision.decision === "same-artist" ? "OK_DECIDED" : "MISMATCH",
    decision,
  };
}

/**
 * The single place buckets and the exit code are decided (main() only fetches and prints).
 * @param {Array<{id:number,name:string,platform:string,platformName:string|undefined,url:string}>} checks
 * @param {Array<object>} register - a validated decision register
 * @returns {{ buckets: {OK:[],OK_DECIDED:[],REVIEW:[],MISMATCH:[],UNRESOLVED:[]}, exitCode: 0|1|3 }}
 *   exitCode: 1 if any MISMATCH, else 3 if any undecided REVIEW, else 0. UNRESOLVED never fails the run.
 */
export function evaluateChecks(checks, register) {
  validateDecisionRegister(register);
  const buckets = { OK: [], OK_DECIDED: [], REVIEW: [], MISMATCH: [], UNRESOLVED: [] };

  for (const check of checks) {
    const classified = classify(check.name, check.platformName);
    const resolved = resolveDecision(classified, check, register);
    buckets[resolved.verdict].push({ ...check, verdict: resolved.verdict, classified, decision: resolved.decision });
  }

  return {
    buckets,
    exitCode: buckets.MISMATCH.length ? 1 : buckets.REVIEW.length ? 3 : 0,
  };
}

function decisionEntry(check, decision, reason, decidedOn) {
  return JSON.stringify({
    bandProfileId: check.id,
    platform: platformKey(check.platform),
    platformName: check.platformName,
    decision,
    reason,
    decidedOn,
  });
}

function printUndecided(check, today) {
  const reason =
    check.verdict === "MISMATCH"
      ? "Confirm the detected different-artist result"
      : "Confirm whether this is the same artist";
  const decisions = check.verdict === "MISMATCH" ? ["different-artist"] : ["same-artist", "different-artist"];
  console.log(`\nUndecided ${check.verdict} #${check.id} ${check.platform}:`);
  for (const decision of decisions) console.log(`  ${decisionEntry(check, decision, reason, today)}`);
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
  const register = await loadDecisionRegister();
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

  // Sequential on purpose. Both endpoints are unauthenticated courtesy APIs; a
  // parallel burst across ~150 links is the quickest way to get throttled and
  // turn correct links into UNRESOLVED noise. A full pass takes a few minutes.
  const fetched = [];
  for (const check of checks) {
    const platformName = check.platform === "spotify" ? await spotifyName(check.url) : await appleName(check.url);
    fetched.push({ ...check, platformName });
  }

  // evaluateChecks() is the ONLY place buckets and the exit code are decided,
  // so the tests that cover it cover what this script actually does. main()
  // used to re-derive both inline -- a second copy the tests never exercised.
  const { buckets, exitCode } = evaluateChecks(fetched, register);

  for (const row of [...buckets.MISMATCH, ...buckets.REVIEW]) {
    console.log(
      `${row.verdict.padEnd(10)} #${row.id} ${row.platform.padEnd(12)} ` +
        `db="${row.name}" platform="${row.platformName}"`,
    );
  }

  console.log(
    `\nOK ${buckets.OK.length} - OK_DECIDED ${buckets.OK_DECIDED.length} - REVIEW ${buckets.REVIEW.length} - ` +
      `MISMATCH ${buckets.MISMATCH.length} - UNRESOLVED ${buckets.UNRESOLVED.length}`,
  );

  if (buckets.UNRESOLVED.length) {
    console.log("\nUNRESOLVED (no name returned - dead link, throttling, or unparseable id):");
    for (const u of buckets.UNRESOLVED) console.log(`  #${u.id} ${u.platform} ${u.name} - ${u.url}`);
  }

  // Toronto-local date, never a UTC slice (CLAUDE.md: toISOString() is already
  // tomorrow after 8 PM Eastern).
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  for (const undecided of [...buckets.MISMATCH, ...buckets.REVIEW].filter((check) => !check.decision)) {
    printUndecided(undecided, today);
  }

  if (buckets.MISMATCH.length) {
    console.log(
      "\nA MISMATCH points fans at a different artist. Null the link rather than " +
        "leaving it live - a blank field is strictly better, and the roster gap " +
        "filter will then surface the profile as missing.",
    );
  }
  process.exit(exitCode);
}

// `process.argv[1]` is undefined under `node --eval`, where pathToFileURL()
// would throw during import. Check it before converting.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    if (err.stderr) console.error(err.stderr);
    if (err.code !== undefined) console.error(`Code: ${err.code}`);
    process.exit(2);
  });
}
