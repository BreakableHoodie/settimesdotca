#!/usr/bin/env node
/**
 * check-coverage-floor — no request handler may be completely untested.
 *
 * Why this exists
 * ----------------
 * Coverage thresholds in vitest.config.js are GLOBAL AVERAGES. A brand-new
 * 200-line handler with no tests at all moves the global number by a rounding
 * error and passes: on 2026-08-31 the backend sat at 81.67% statements, well
 * over its 75% floor, while three files were at 0%. That is structural, not a
 * tuning problem — an average cannot see a file-shaped hole.
 *
 * This is the companion to frontend/src/__tests__/missingTestGate.test.js
 * (#919), which is frontend-only and keys on FILE EXISTENCE over 400 lines.
 * That approach does not transfer to the backend: its suites are feature-named
 * (api-key-auth.test.js covers _middleware.js), so matching test files by
 * basename flags 23 files here, 18 of them at 59-92% coverage. Measuring
 * EXECUTION instead has no false positives by construction.
 *
 * Vitest cannot express this natively — both options were measured:
 *   - a glob threshold group (`"**\/functions/api/**": { statements: 1 }`)
 *     aggregates, so five 0% files hid inside the group average and it exited 0
 *   - `perFile: true` applies the GLOBAL 75/68/84/76 to every file and produced
 *     113 errors, which is the "universal rule gets switched off within a day"
 *     failure the frontend ratchet's header warns about
 *
 * What this does NOT do
 * ----------------------
 * It proves a file was EXECUTED, not that it was tested well. A single test
 * that imports a handler and asserts nothing takes it off this list. That is
 * the same honest limit the frontend ratchet states, and the reason the
 * mutation gate (scripts/mutation-gate.mjs) exists alongside it: this one
 * catches "nobody started", that one catches "the test cannot fail".
 */

import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// realpathSync on both sides. The coverage map keys are absolute paths written
// by vitest, and on macOS a path reached through /tmp or /var resolves to
// /private/... — so an unresolved comparison makes EVERY file look "absent from
// the coverage map" and fails the run for a reason that has nothing to do with
// coverage. (Same symlink class that broke the mutation gate's self-test.) It
// fails loudly rather than silently, which is the right direction, but a
// confusing red build is still a cost worth removing.
const REPO_ROOT = realpathSync(join(dirname(fileURLToPath(import.meta.url)), ".."));
const COVERAGE_FILE = join(REPO_ROOT, "coverage", "coverage-final.json");
const SCAN_ROOT = join(REPO_ROOT, "functions", "api");

/**
 * Files under functions/api/ known to be at 0%, as of the date below. This is a
 * DEBT REGISTER, NOT A BYPASS: it can only shrink. Adding an entry to make a
 * build pass means shipping an untested handler, which is the thing being
 * prevented.
 *
 * Empty on landing (2026-08-31) — the three files that were dark were covered
 * first, deliberately, so this gate arrives with nothing owed.
 */
const ALLOWED = new Set([]);
const MAX_ALLOWED = 0;

const SKIP_DIRS = new Set(["__tests__", "node_modules"]);

function walk(dir, onFile) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, onFile);
      continue;
    }
    if (entry.name.endsWith(".js")) onFile(full);
  }
}

/**
 * Run the check.
 *
 * Exported and fully parameterised so the self-test can drive it against
 * fixtures rather than the real repository — the same shape as
 * scripts/mutation-gate.mjs. A guard that can only be exercised by breaking the
 * actual repo does not get exercised.
 *
 * @param {object} [options]
 * @param {string} [options.repoRoot=REPO_ROOT] - Root the report is relative to.
 * @param {string} [options.coverageFile=COVERAGE_FILE] - coverage-final.json path.
 * @param {string} [options.scanRoot=SCAN_ROOT] - Directory tree to scan.
 * @param {Set<string>} [options.allowed=ALLOWED] - Repo-relative paths permitted at 0%.
 * @param {number} [options.maxAllowed=MAX_ALLOWED] - Cap on the allowlist size.
 * @returns {{ok: boolean, message: string}} `ok` false for ANY problem found.
 */
export function checkCoverageFloor({
  repoRoot = REPO_ROOT,
  coverageFile = COVERAGE_FILE,
  scanRoot = SCAN_ROOT,
  allowed = ALLOWED,
  maxAllowed = MAX_ALLOWED,
} = {}) {
  const problems = [];
  const fail = (msg) => problems.push(msg);

  // A gate that passes because its input is missing is worse than no gate. The
  // coverage file is produced by `npm run test:coverage`; if it is absent this
  // script has measured nothing and must say so rather than exit 0.
  if (!existsSync(coverageFile)) {
    return {
      ok: false,
      message:
        `check-coverage-floor: ${relative(repoRoot, coverageFile)} not found.\n` +
        `  This gate reads the coverage map and cannot run without it.\n` +
        `  Run:  npm run test:coverage\n` +
        `  (In CI this step must come AFTER the coverage run, in the same job.)`,
    };
  }

  const coverage = JSON.parse(readFileSync(coverageFile, "utf8"));
  const covered = new Map();
  for (const [absPath, entry] of Object.entries(coverage)) {
    // A file recorded in coverage may since have been deleted, so resolve
    // defensively and fall back to the raw path rather than throwing.
    let resolved = absPath;
    try {
      resolved = realpathSync(absPath);
    } catch {
      /* keep the raw path; it simply will not match anything on disk */
    }
    covered.set(relative(repoRoot, resolved), entry);
  }

  const onDisk = [];
  walk(scanRoot, (full) => onDisk.push(relative(repoRoot, realpathSync(full))));

  if (onDisk.length === 0) {
    fail(`scanned ${relative(repoRoot, scanRoot)} and found no .js files — the scan root is wrong`);
  }

  // Guard the guard. vitest reports untested files only because coverage.include
  // is set in vitest.config.js; if that changes, dark files vanish from the map
  // entirely and this gate would report "all clear" while blind. Comparing the
  // two inventories makes that failure loud instead of silent.
  const missingFromMap = onDisk.filter((f) => !covered.has(f));
  if (missingFromMap.length > 0) {
    fail(
      `${missingFromMap.length} file(s) under ${relative(repoRoot, scanRoot)} are absent from the coverage map.\n` +
        `    This gate detects 0% files; a file MISSING from the map is invisible to it.\n` +
        `    Usually means vitest.config.js's coverage.include no longer covers functions/**.\n` +
        missingFromMap
          .slice(0, 10)
          .map((f) => `      ${f}`)
          .join("\n") +
        (missingFromMap.length > 10 ? `\n      …and ${missingFromMap.length - 10} more` : ""),
    );
  }

  const dark = [];
  for (const file of onDisk) {
    const entry = covered.get(file);
    if (!entry) continue; // already reported above
    const statements = Object.values(entry.s ?? {});
    if (statements.length > 0 && statements.every((n) => n === 0)) dark.push(file);
  }

  const unexpectedlyDark = dark.filter((f) => !allowed.has(f));
  if (unexpectedlyDark.length > 0) {
    fail(
      `${unexpectedlyDark.length} file(s) have 0% statement coverage:\n` +
        unexpectedlyDark.map((f) => `      ${f}`).join("\n") +
        `\n    Every line is unexecuted — no test imports these files at all.\n` +
        `    Add a test. Do NOT add them to ALLOWED to go green; that list can only shrink.`,
    );
  }

  // A stale allowlist entry is a silent lie about the repo's debt, so removing
  // it is mandatory rather than tidy. This is what makes it a ratchet.
  const staleAllowed = [...allowed].filter((f) => !dark.includes(f));
  if (staleAllowed.length > 0) {
    fail(
      `${staleAllowed.length} ALLOWED entr(ies) are no longer at 0% — delete them:\n` +
        staleAllowed.map((f) => `      ${f}`).join("\n"),
    );
  }

  // EQUALITY, not <=. A cap alone leaks: remove an entry without lowering
  // MAX_ALLOWED and the headroom survives, so a later change can silently grow
  // the list back into it without failing anything. "Can only shrink" is then
  // false, which is exactly what the header claims it is not. Requiring the two
  // to match forces every removal to lower the cap in the same commit, and
  // makes any regrowth a visible, deliberate edit to both.
  if (allowed.size !== maxAllowed) {
    fail(
      `ALLOWED has ${allowed.size} entries but MAX_ALLOWED is ${maxAllowed} — they must match.\n` +
        `    Removed an entry? Lower MAX_ALLOWED in the same commit.\n` +
        `    Adding one? Don't — write a test instead.`,
    );
  }

  if (problems.length > 0) {
    return {
      ok: false,
      message: "check-coverage-floor: FAIL\n\n" + problems.map((p) => `  - ${p}`).join("\n\n"),
    };
  }

  return {
    ok: true,
    message:
      `check-coverage-floor: PASS — ${onDisk.length} files under ` +
      `${relative(repoRoot, scanRoot)}, none at 0% (allowlist: ${allowed.size}/${maxAllowed}).`,
  };
}

// CLI entry. Only runs when executed directly, so importing this module from a
// test does not exit the test process.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkCoverageFloor();
  if (result.ok) {
    console.log(result.message);
  } else {
    console.error(`\n${result.message}\n`);
    process.exit(1);
  }
}
