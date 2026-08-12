import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// --- Durable guard: AFTER_MIDNIGHT_THRESHOLD has exactly two canonical
// homes, one per side of the build boundary --------------------------------
//
// CLAUDE.md "After-midnight band sorting": Pages Functions cannot import from
// frontend/, so the threshold has ONE frontend home
// (frontend/src/utils/festivalDays.js) and ONE server home
// (functions/utils/eventDay.js, which exports both the numeric hour
// AFTER_MIDNIGHT_THRESHOLD_HOUR and the derived "HH:MM" string
// AFTER_MIDNIGHT_THRESHOLD_TIME). Until #746, `functions/` re-encoded the
// value privately in two more places, in two different shapes:
// functions/api/events/timeline.js (`const AFTER_MIDNIGHT_THRESHOLD =
// "06:00"`) and functions/event/[slug].js (`const
// AFTER_MIDNIGHT_THRESHOLD_HOUR = 6`). Both now import from eventDay.js
// instead. This guard is a source scan (same technique as
// functions/utils/__tests__/eventVisibility.test.js) that keeps a third
// private re-encoding from creeping back in.
//
// Module-level so both assertions below share one walker. .ts is scanned
// even though functions/ is currently JS-only, for the same reason
// eventVisibility.test.js scans it: a guard that silently stops covering a
// file type the day someone adds one is the exact failure mode guards exist
// to prevent.
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

// The one canonical server-side home. Its own declarations of
// AFTER_MIDNIGHT_THRESHOLD_HOUR (= 6) and AFTER_MIDNIGHT_THRESHOLD_TIME
// (derived from it) are the sanctioned copies both guards below must not
// flag.
const CANONICAL_HOME = "utils/eventDay.js";

function isExempt(relPath) {
  const normalized = relPath.split(path.sep).join("/");
  if (normalized === CANONICAL_HOME) return true;
  if (normalized.split("/").includes("__tests__")) return true;
  return false;
}

describe("no private re-encoding of the after-midnight threshold outside eventDay.js", () => {
  // Matches `const|let|var <NAME containing AFTER_MIDNIGHT> = <6 or
  // "06:00">` — a literal re-declaration, the exact defect #746 fixes.
  // Deliberately does NOT match a DERIVED declaration such as
  // `AFTER_MIDNIGHT_THRESHOLD_MINUTES = AFTER_MIDNIGHT_THRESHOLD_HOUR * 60`
  // (frontend/src/admin/utils/timeUtils.js's pattern) or
  // `` `${String(AFTER_MIDNIGHT_THRESHOLD_HOUR).padStart(2, "0")}:00` ``
  // (eventDay.js's own AFTER_MIDNIGHT_THRESHOLD_TIME) — deriving from the
  // imported/canonical constant is correct and is what this repo wants; only
  // a bare literal on the right-hand side is the defect.
  const LITERAL_DECLARATION_RE = /\b(?:const|let|var)\s+\w*AFTER_MIDNIGHT\w*\s*=\s*(?:6\b|["']06:00["'])/;

  it("has no file declaring the threshold from a literal outside utils/eventDay.js", () => {
    const offenders = [];
    for (const absPath of walk(functionsRoot)) {
      const relPath = path.relative(functionsRoot, absPath).split(path.sep).join("/");
      if (isExempt(relPath)) continue;

      const source = readFileSync(absPath, "utf8");
      if (LITERAL_DECLARATION_RE.test(source)) {
        offenders.push(relPath);
      }
    }

    expect(
      offenders,
      offenders.length > 0
        ? `These files re-declare the after-midnight threshold from a literal instead of importing it: ` +
            `${offenders.join(", ")}. Import AFTER_MIDNIGHT_THRESHOLD_HOUR / AFTER_MIDNIGHT_THRESHOLD_TIME from ` +
            `functions/utils/eventDay.js instead — there are exactly two canonical homes for this value (one per ` +
            `side of the build boundary), never three. See CLAUDE.md "After-midnight band sorting".`
        : undefined,
    ).toEqual([]);
  });
});

describe('no bare "06:00" literal outside utils/eventDay.js', () => {
  // Line-level heuristic, NOT a JS parser. It flags a line that contains the
  // literal text "06:00" and does not look like a comment (after trimming,
  // the line doesn't start with `//`, `*`, or `/*`). It WILL miss a "06:00"
  // literal embedded inside a string concatenation split across lines, a
  // template literal continued from a prior line, or a value assembled from
  // its digits rather than typed as one string ("0" + "6:00"). It WILL also
  // flag a non-comment line that merely mentions "06:00" in, say, a runtime
  // error message aimed at a human — there is no such string in functions/
  // today, and a real one appearing here would be worth a human's attention
  // regardless. As of #746, every remaining "06:00" in functions/ outside
  // eventDay.js lives inside a comment describing the convention in prose,
  // never in an actual literal driving comparison logic — this guard keeps
  // that true.
  const HHMM_LITERAL = "06:00";

  function isCommentLine(trimmed) {
    return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
  }

  it('has no non-comment line containing "06:00" outside utils/eventDay.js', () => {
    const offenders = [];
    for (const absPath of walk(functionsRoot)) {
      const relPath = path.relative(functionsRoot, absPath).split(path.sep).join("/");
      if (isExempt(relPath)) continue;

      const source = readFileSync(absPath, "utf8");
      const lines = source.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.includes(HHMM_LITERAL) && !isCommentLine(trimmed)) {
          offenders.push(`${relPath}:${i + 1}`);
        }
      }
    }

    expect(
      offenders,
      offenders.length > 0
        ? `These lines contain a bare "06:00" literal outside a comment and outside utils/eventDay.js: ` +
            `${offenders.join(", ")}. Import AFTER_MIDNIGHT_THRESHOLD_TIME from functions/utils/eventDay.js instead.`
        : undefined,
    ).toEqual([]);
  });
});
