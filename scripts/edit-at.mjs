#!/usr/bin/env node
/**
 * Locate a line by content, edit by index.
 *
 * Two mechanical failures kept recurring in scripted source edits, and both
 * are avoidable by construction rather than by care (#1069):
 *
 * 1. ANCHOR DRIFT ON WHITESPACE. A `find` string is written with guessed
 *    indentation, does not match, and the edit does nothing. When the tool
 *    checks its match count that is merely wasteful. When it does not -- and
 *    `String.prototype.replace` does not -- it is worse than wasteful: the
 *    edit silently no-ops and the run still looks successful. Twice in one
 *    session that produced a MUTATION THAT NEVER APPLIED, whose green test run
 *    read as proof the code was guarded. False evidence, not lost time.
 *
 * 2. `$` IN A REPLACEMENT. In JS, `$&` in a replacement expands to the whole
 *    match and `$$` to a literal `$`. A regex written as `\d` arrived as
 *    `\\d`; a Makefile recipe written `exit $$status` was stored `exit
 *    $status`, so make expanded `$s` and the recipe died.
 *
 * This module removes both: the anchor is matched against whole lines and the
 * indent is READ from the file, and replacement text is spliced into an array
 * -- never interpreted, so `$` has no meaning at all.
 *
 * Every operation fails loudly on zero or multiple matches, and refuses an
 * edit that would leave the file unchanged.
 */
import { readFileSync, writeFileSync } from "node:fs";

export class EditError extends Error {}

const indentOf = (line) => line.match(/^[ \t]*/)[0];

// Replacements are split the SAME way the source is (`/\r?\n/`). Splitting on
// "\n" alone leaves a trailing \r on every line of a CRLF replacement, and
// applyToSource then joins with \r\n -- writing \r\r\n into the file.
const splitLines = (text) => text.split(/\r?\n/);

const collapseSpace = (text) => text.trim().replace(/\s+/g, " ");

/**
 * Build a line predicate. Substring only -- deliberately NOT a regex.
 *
 * An earlier version accepted `/re/flags` and built a RegExp from it, which
 * CodeQL correctly flags as regex injection: a pattern arriving from argv
 * becomes an executable program, and a pathological one backtracks. This repo
 * fixes CodeQL findings rather than suppressing them (#629 did the same), and
 * on inspection the feature was not earning its risk.
 *
 * The one thing regex anchors were genuinely for is whitespace that varies --
 * `const  value` versus `const value`. `--normalize-space` covers exactly that
 * by collapsing runs of whitespace on BOTH sides before comparing, with no
 * pattern ever compiled. Everything else regex anchors could do was reachable
 * with a longer substring.
 */
export function toPredicate(pattern, { normalizeSpace = false } = {}) {
  if (!normalizeSpace) return (line) => line.includes(pattern);
  const wanted = collapseSpace(pattern);
  return (line) => collapseSpace(line).includes(wanted);
}

/**
 * The single line matching `predicate`.
 *
 * Zero and many are both errors, and the message shows what it DID find --
 * a near-miss list is what turns "my anchor was wrong" from a guess into a
 * two-second fix.
 */
export function findLine(lines, predicate, { label = "pattern" } = {}) {
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (predicate(lines[i])) hits.push(i);
  }

  if (hits.length === 1) {
    const index = hits[0];
    return { index, text: lines[index], indent: indentOf(lines[index]) };
  }

  if (hits.length === 0) {
    throw new EditError(`${label} matched no line.\nNothing was written.`);
  }

  const shown = hits
    .slice(0, 8)
    .map((i) => `  line ${i + 1}: ${lines[i].trim().slice(0, 90)}`)
    .join("\n");
  throw new EditError(
    `${label} matched ${hits.length} lines; it must match exactly one.\n${shown}\nNothing was written.`,
  );
}

/**
 * Re-indent `block` to sit at `indent`, preserving its own internal shape.
 *
 * The block's own minimum indent is stripped first, so a replacement written
 * flush-left and one written already-indented both land in the same place.
 * Blank lines stay blank rather than collecting trailing spaces.
 */
export function reindent(block, indent) {
  const lines = splitLines(block);
  const meaningful = lines.filter((l) => l.trim() !== "");
  if (meaningful.length === 0) return lines;
  const base = Math.min(...meaningful.map((l) => indentOf(l).length));
  return lines.map((l) => (l.trim() === "" ? "" : indent + l.slice(base)));
}

function applyToSource(source, mutate) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  const next = mutate(lines);
  const result = next.join(newline);
  if (result === source) {
    throw new EditError("The edit left the file byte-identical.\nNothing was written.");
  }
  return result;
}

export function replaceLine(source, pattern, replacement, { verbatim = false, normalizeSpace = false } = {}) {
  return applyToSource(source, (lines) => {
    const { index, indent } = findLine(lines, toPredicate(pattern, { normalizeSpace }), { label: `replace pattern` });
    const block = verbatim ? splitLines(replacement) : reindent(replacement, indent);
    lines.splice(index, 1, ...block);
    return lines;
  });
}

export function insertAfter(source, pattern, addition, { verbatim = false, normalizeSpace = false } = {}) {
  return applyToSource(source, (lines) => {
    const { index, indent } = findLine(lines, toPredicate(pattern, { normalizeSpace }), {
      label: `insert-after pattern`,
    });
    const block = verbatim ? splitLines(addition) : reindent(addition, indent);
    lines.splice(index + 1, 0, ...block);
    return lines;
  });
}

export function insertBefore(source, pattern, addition, { verbatim = false, normalizeSpace = false } = {}) {
  return applyToSource(source, (lines) => {
    const { index, indent } = findLine(lines, toPredicate(pattern, { normalizeSpace }), {
      label: `insert-before pattern`,
    });
    const block = verbatim ? splitLines(addition) : reindent(addition, indent);
    lines.splice(index, 0, ...block);
    return lines;
  });
}

export function deleteLine(source, pattern, { normalizeSpace = false } = {}) {
  return applyToSource(source, (lines) => {
    const { index } = findLine(lines, toPredicate(pattern, { normalizeSpace }), { label: `delete pattern` });
    lines.splice(index, 1);
    return lines;
  });
}

const OPERATIONS = { replace: replaceLine, "insert-after": insertAfter, "insert-before": insertBefore };

function parseArgs(argv) {
  const [op, file, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (!rest[i].startsWith("--")) continue;
    const key = rest[i].slice(2);
    const value = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[(i += 1)] : true;
    flags[key] = value;
  }
  return { op, file, flags };
}

const USAGE = `Usage:
  node scripts/edit-at.mjs replace       <file> --match <pattern> --with-file <path> [--verbatim]
  node scripts/edit-at.mjs insert-after  <file> --match <pattern> --with-file <path> [--verbatim]
  node scripts/edit-at.mjs insert-before <file> --match <pattern> --with-file <path> [--verbatim]
  node scripts/edit-at.mjs delete        <file> --match <pattern>

  <pattern> is a SUBSTRING. --normalize-space collapses runs of whitespace on
  both sides before comparing, for anchors whose internal spacing may differ.

  The replacement comes from a FILE, never from argv: that is the point. Shell
  quoting, $-expansion and backslash escaping never touch it, and it is spliced
  in as lines rather than interpreted, so $& and $$ mean nothing special.

  By default the replacement is re-indented to the matched line's own indent,
  which is READ from the file rather than guessed. --verbatim inserts as-is.

  Exits non-zero when the pattern matches zero or many lines, or when the edit
  would leave the file unchanged.`;

export function main(argv) {
  const { op, file, flags } = parseArgs(argv);
  if (!op || !file || flags.help) {
    process.stdout.write(`${USAGE}\n`);
    return op ? 0 : 4;
  }
  if (op !== "delete" && !OPERATIONS[op]) {
    process.stderr.write(`Unknown operation "${op}".\n\n${USAGE}\n`);
    return 4;
  }
  if (typeof flags.match !== "string") {
    process.stderr.write(`--match <pattern> is required.\n`);
    return 4;
  }

  const source = readFileSync(file, "utf8");
  let result;
  try {
    if (op === "delete") {
      result = deleteLine(source, flags.match, { normalizeSpace: Boolean(flags["normalize-space"]) });
    } else {
      if (typeof flags["with-file"] !== "string") {
        process.stderr.write(`--with-file <path> is required for "${op}".\n`);
        return 4;
      }
      const replacement = readFileSync(flags["with-file"], "utf8").replace(/\r?\n$/, "");
      result = OPERATIONS[op](source, flags.match, replacement, {
        verbatim: Boolean(flags.verbatim),
        normalizeSpace: Boolean(flags["normalize-space"]),
      });
    }
  } catch (error) {
    if (error instanceof EditError) {
      process.stderr.write(`${file}: ${error.message}\n`);
      return 1;
    }
    throw error;
  }

  writeFileSync(file, result);
  process.stdout.write(`${file}: ${op} applied\n`);
  return 0;
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("edit-at.mjs");
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
