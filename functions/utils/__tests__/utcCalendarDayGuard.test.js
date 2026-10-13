import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// --- Durable guard: no UTC calendar day in functions/ ----------------------
//
// CLAUDE.md "Server-side "today"/"now" is Toronto-local — never UTC-sliced".
// Workers run in UTC, so a "today" taken from SQLite's date('now') or from
// `toISOString().slice(0, 10)` rolls to tomorrow at 8 PM Eastern. That has
// shipped at least three times: timeline "Happening Now" the evening before
// (#568), evening traffic filed under tomorrow's date (#668), and the iCal
// feed going empty at 8 PM on Vol 18's show night with sets still to play
// (#1269). Each was fixed where it was found; this scan is what stops the
// next copy.
//
// What it flags:
//   1. SQL `date('now', …)` unless every modifier is a whole number of days,
//      months or years. Those are rolling windows ("the last 30 days"), where a
//      four-hour edge is immaterial. An hours modifier is NOT a window: it is a
//      timezone approximation, which is how `date('now', '-6 hours')` came to
//      flip at 2 AM EDT instead of the 6 AM festival-day threshold (#1270).
//   2. `toISOString()` cut down to a date (`.slice(0, 10)`, `.substring(0, 10)`,
//      `.split("T")[0]`).
//
// What it deliberately does NOT flag: `datetime('now')`. That compares an
// INSTANT against stored UTC timestamps (expiries, leases, retention), which
// is correct in every timezone. The bug is a calendar DAY, not a clock.
//
// The fix for a flagged line is eventLocalFestivalToday() ("is this event still
// current?") or eventLocalToday() (a plain Toronto calendar date), both from
// functions/utils/eventDay.js, bound as a query parameter.

const SCANNED_EXTENSIONS = [".js", ".ts"];

function walk(dir) {
  let files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(full));
    } else if (entry.isFile() && SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

const currentFile = fileURLToPath(import.meta.url);
const functionsRoot = path.join(path.dirname(currentFile), "../../");

// Files allowed to contain a flagged pattern, each with the reason and the
// EXACT occurrences approved (duplicates included). An entry exempts those
// occurrences, not the file: a new match in an allowlisted file fails like
// anywhere else. An entry must also keep matching: a fixed file left here
// would silently exempt the next regression in it (see the last test).
const SLICE = "toISOString().slice(0, 10)";
const SIX_HOURS = "date('now', '-6 hours')";
const ALLOWED = {
  // Calendar arithmetic on dates BUILT in UTC from a Y-M-D (nextCalendarDay /
  // previousCalendarDay). The UTC day is the intended answer there, by
  // construction; this file is also the home of the Toronto-local helpers.
  "utils/eventDay.js": { reason: "UTC-constructed calendar arithmetic, not a 'today'", hits: [SLICE, SLICE] },
  // Round-trips a noon-UTC probe to reject impossible dates (Feb 30). Never
  // asks what day it is.
  "event/[slug].js": { reason: "noon-UTC validity probe, not a 'today'", hits: [SLICE] },
  // Admin-only past-date check made deliberately LENIENT: "yesterday in UTC"
  // admits today in every timezone. It can refuse nothing a Toronto admin
  // should be allowed and hides nothing from fans.
  "api/admin/events/wizard.js": { reason: "deliberately lenient admin cutoff", hits: [SLICE] },
  // Known live instances, tracked. Remove each entry in the PR that fixes it.
  "api/schedule.js": { reason: "#1270 — date('now', '-6 hours') flips at 2 AM EDT", hits: [SIX_HOURS] },
  "api/events/public.js": {
    reason: "#1270 — date('now', '-6 hours') flips at 2 AM EDT",
    hits: [SIX_HOURS, SIX_HOURS],
  },
};

// Comment lines are dropped before scanning: several files explain this very
// bug by quoting `date('now')`, and a guard that fails on its own
// documentation would get disabled. Only WHOLE comment lines and block
// comments go, so an expression after code on the same line is still seen.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

const SQL_DATE_NOW_RE = /\bdate\(\s*(['"])now\1((?:\s*,\s*(['"])[^'"]*\3)*)\s*\)/gi;
const ROLLING_WINDOW_MODIFIER_RE = /^[+-]?\d+\s+(?:days?|months?|years?)$/i;
// SQLite reads an argument-less date() as date('now'). Case-sensitive on
// purpose, and not after "." or an identifier, so JS `new Date()`, `Date()`
// and `obj.date()` are not SQL.
const SQL_DATE_NO_ARGS_RE = /(?<![.\w])(?:date|DATE)\(\s*\)/g;
// `date('now', '+0 days')` is a no-op: still today's UTC date, not a window.
const ZERO_OFFSET_MODIFIER_RE = /^[+-]?0+\s+(?:days?|months?|years?)$/i;
const ISO_DATE_SLICE_RE =
  /toISOString\(\)\s*\.\s*(?:slice\(\s*0\s*,\s*10\s*\)|substring\(\s*0\s*,\s*10\s*\)|split\(\s*(['"])T\1\s*\)\s*\[\s*0\s*\])/g;

function findUtcCalendarDays(source) {
  const code = stripComments(source);
  const hits = [];
  for (const match of code.matchAll(SQL_DATE_NOW_RE)) {
    const modifiers = [...match[2].matchAll(/(['"])([^'"]*)\1/g)].map((m) => m[2].trim());
    const isRollingWindow =
      modifiers.length > 0 &&
      modifiers.every((m) => ROLLING_WINDOW_MODIFIER_RE.test(m)) &&
      modifiers.some((m) => !ZERO_OFFSET_MODIFIER_RE.test(m));
    if (!isRollingWindow) hits.push(match[0]);
  }
  for (const match of code.matchAll(SQL_DATE_NO_ARGS_RE)) hits.push(match[0]);
  // Every occurrence, not the first: the allowlist approves exact counts.
  for (const match of code.matchAll(ISO_DATE_SLICE_RE)) hits.push(match[0]);
  return hits;
}

function scan() {
  const results = new Map();
  for (const absPath of walk(functionsRoot)) {
    const relPath = path.relative(functionsRoot, absPath).split(path.sep).join("/");
    if (relPath.split("/").includes("__tests__")) continue;
    const hits = findUtcCalendarDays(readFileSync(absPath, "utf8"));
    if (hits.length > 0) results.set(relPath, hits);
  }
  return results;
}

describe("no UTC calendar day in functions/ (Toronto-local, never UTC-sliced)", () => {
  // A scan whose detector has drifted passes while checking nothing, so prove
  // it can say both yes and no before trusting its silence.
  it("detector flags the shapes that have shipped, and passes the safe ones", () => {
    const flagged = [
      "WHERE d >= date('now')",
      'WHERE d >= date("now")',
      "WHERE d >= date('now', '-6 hours')",
      "WHERE d >= date( 'now' , '-1 day', '+4 hours')",
      "WHERE d = date('now', '+0 days')",
      "WHERE event_date <= date()",
      "WHERE event_date <= DATE( )",
      "WHERE d = date('now', '-00 months')",
      "const today = new Date().toISOString().slice(0, 10);",
      "const today = new Date().toISOString().split('T')[0];",
      "const today = d.toISOString().substring(0, 10);",
      // A trailing comment must not hide the code before it.
      "const q = `WHERE d >= date('now')`; // looks harmless",
    ];
    for (const sample of flagged) {
      expect(findUtcCalendarDays(sample), sample).not.toEqual([]);
    }

    const safe = [
      "WHERE created_at >= date('now', '-30 days')",
      "WHERE d < date('now', '-90 days')",
      "WHERE d < date('now', '-1 year')",
      "WHERE expires_at > datetime('now')",
      "WHERE claimed_at > datetime('now', '-15 minutes')",
      "// never SQLite's date('now'), which is UTC",
      "/* date('now') flips at 8 PM */",
      "  * `COALESCE(end_date, date) >= date('now','-6 hours')`",
      "const stamp = new Date().toISOString();",
      "const d = Date();",
      "const day = moment.date();",
      "const updated = updatedDate();",
      "const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];",
    ];
    for (const sample of safe) {
      expect(findUtcCalendarDays(sample), sample).toEqual([]);
    }
  });

  it("has no UTC calendar day outside the approved occurrences", () => {
    const sorted = (list) => [...list].sort();
    const offenders = [...scan()]
      .filter(([file, hits]) => JSON.stringify(sorted(hits)) !== JSON.stringify(sorted(ALLOWED[file]?.hits ?? [])))
      .map(
        ([file, hits]) =>
          `${file}: found ${hits.join(" | ")}; approved ${(ALLOWED[file]?.hits ?? []).join(" | ") || "none"}`,
      );
    expect(
      offenders,
      "A UTC calendar day rolls to tomorrow at 8 PM Eastern. Bind eventLocalFestivalToday() or eventLocalToday() " +
        'from functions/utils/eventDay.js instead (CLAUDE.md \'Server-side "today"/"now" is Toronto-local\').',
    ).toEqual([]);
  });

  it("every allowlist entry still matches, so a fixed file cannot stay exempt", () => {
    const results = scan();
    const stale = Object.keys(ALLOWED).filter((file) => !results.has(file));
    // An approved occurrence that disappeared while another remains is caught
    // by the exact-match test above, so this only needs whole-file staleness.
    expect(stale, "These files no longer contain a UTC calendar day. Remove them from ALLOWED.").toEqual([]);
  });
});
