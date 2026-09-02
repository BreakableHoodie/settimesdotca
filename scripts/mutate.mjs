#!/usr/bin/env node
/**
 * Verified source mutation for AD-HOC probes.
 *
 * WHY THIS EXISTS
 *
 * A mutation that fails to APPLY is indistinguishable from one that SURVIVES:
 * both run the suite against working code, both go green, and both print the
 * same thing. On 2026-09-02 that produced two wrong conclusions in one PR — a
 * probe using `/await env\.BAND_PHOTOS\.put\([^)]*\)/` matched only
 * `put(filename, file.stream()` because the call spans lines, wrote malformed
 * code, and was reported as "SURVIVED — vacuous". The test was fine; the
 * mutation had never landed.
 *
 * RELATIONSHIP TO scripts/mutation-gate.mjs
 *
 * That module is the CURATED gate: a fixed table of documented invariants, run
 * in CI. This one is for the throwaway probes that most PR verification
 * actually uses — "does a test exist that would catch this?" asked once, by
 * hand, about a line that is not in the table.
 *
 * It deliberately does NOT re-implement the gate's primitives. `stripAnsi`,
 * `outputShowsFailingTest`, `countOccurrences` and `applyReplacement` are
 * imported from it, because each already encodes a failure this repo paid for:
 * the ANSI strip alone turned ten healthy mutations into inconclusive failures
 * on the first CI run, and `applyReplacement` splices by index specifically so
 * a `$&` in a replacement is not interpreted. A second copy of those would be
 * the same drift class as `CACHE_BROWSE` — a constant exported and imported by
 * nothing while callers hardcode its value.
 *
 * WHAT THIS ADDS
 *
 * Three checks the gate does not need (its table is reviewed; an ad-hoc probe
 * is typed once and trusted immediately):
 *
 *   - the mutant must PARSE (`node --check`)
 *   - the replacement must be readable back FROM DISK after writing
 *   - the replacement must not be identical to the original
 *
 * THE CONTRACT
 *
 * Anything that cannot be verified as having taken reports BAD MUTATION, never
 * SURVIVED. Those two outcomes mean opposite things — "your test is vacuous"
 * versus "your probe is broken" — and only one of them is about the code under
 * test.
 *
 * USAGE
 *
 *   import { mutate } from "./scripts/mutate.mjs";
 *
 *   const result = mutate({
 *     file: "functions/utils/validation/urls.js",
 *     find: "const looksLikePath = trimmed.includes(",
 *     replace: "const looksLikePath = false && trimmed.includes(",
 *     run: () => runVitestFiles(["functions/utils/__tests__/urls.test.js"]).stdout,
 *   });
 *   // result.verdict is "CAUGHT" | "SURVIVED" | "BAD MUTATION"
 */
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { stripAnsi, outputShowsFailingTest, countOccurrences, applyReplacement } from "./mutation-gate.mjs";

// Re-exported so a probe needs only one import. The definitions live in
// mutation-gate.mjs; see the header for why they are not duplicated here.
export { stripAnsi, outputShowsFailingTest, countOccurrences, applyReplacement };

/**
 * Run a command and capture its output, whether it exits 0 or not.
 *
 * @param {string} command - Executable to run.
 * @param {string[]} args - Arguments passed to it.
 * @returns {{ok: boolean, output: string}} `ok` is whether the process exited 0;
 *   `output` is stdout+stderr combined. The two are returned SEPARATELY because
 *   collapsing them loses the difference between "the tool ran and disagreed"
 *   and "the tool never ran" — see syntaxCheckOf.
 */
export function runCommand(command, args) {
  try {
    const output = execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { ok: false, output: `${command} could not be executed: ${error.message}` };
    }
    return { ok: false, output: (error.stdout || "") + (error.stderr || "") };
  }
}

/** `node --check`, returning the SyntaxError line or null. Only meaningful for
 * files node can parse standalone, so callers gate on the extension. */
/**
 * Parse-check a mutant with `node --check`.
 *
 * Returns a VERDICT, not a boolean, because there are three outcomes and only
 * one of them is "fine":
 *
 *   ok       - node parsed the file
 *   syntax   - node reported a SyntaxError; the mutant is malformed
 *   unusable - node could not be run at all (missing, ENOENT, killed, OOM)
 *
 * The third case is the one that matters and the one the first draft got wrong.
 * It collapsed every failure into captured output and asked only whether the
 * text contained "SyntaxError"; a node that never ran produced no such text, so
 * the probe proceeded and reported CAUGHT or SURVIVED with NO parser validation
 * at all. That is the same sin this module exists to prevent — reading absence
 * of evidence as evidence of absence — applied to the checker instead of the
 * runner. Caught by CodeRabbit on #1071.
 *
 * @param {string} file - Path to parse-check.
 * @returns {{verdict: "ok"|"syntax"|"unusable", detail?: string}}
 */
function syntaxCheckOf(file) {
  const { ok, output } = runCommand("node", ["--check", file]);
  if (ok) return { verdict: "ok" };

  const clean = stripAnsi(output);
  if (!/SyntaxError/.test(clean)) {
    return { verdict: "unusable", detail: clean.trim().split("\n")[0] || "no output" };
  }
  // Report the SyntaxError LINE, not the first line of output -- the first line
  // is the `path:line` header, which names where but never what.
  const line = clean.split("\n").find((l) => l.includes("SyntaxError"));
  return { verdict: "syntax", detail: (line || "SyntaxError").trim() };
}

/**
 * Apply one mutation, run the test suite, restore the file, and report a verdict.
 *
 * The verdict is derived from `run()`'s OUTPUT, never from an exit code. A
 * crashed runner, a missing browser binary and a syntax error all exit non-zero,
 * and reading those as "caught" is how a broken probe masquerades as a working
 * guard.
 *
 * @param {object} options
 * @param {string} options.file - Path to the source file to mutate. Restored
 *   before returning; a restore that cannot be verified throws rather than
 *   returning a verdict.
 * @param {string} options.find - Literal substring to replace. Must occur
 *   EXACTLY once; zero or many is a BAD MUTATION, not a skip.
 * @param {string} options.replace - Literal replacement, inserted verbatim — a
 *   `$&` or `$$` in it is NOT interpreted. May be "" for a delete-mutation.
 * @param {() => string} options.run - Runs the tests and returns the runner's
 *   combined stdout+stderr. Anything it throws propagates unmasked.
 * @param {boolean} [options.syntaxCheck=true] - Parse-check the mutant with
 *   `node --check` before running. Applies only to `.js`/`.mjs`/`.cjs`; any
 *   other extension skips the check regardless of this flag.
 * @returns {{verdict: "CAUGHT"|"SURVIVED"|"BAD MUTATION", reason?: string, output?: string}}
 *   `reason` is present only on BAD MUTATION, `output` only on CAUGHT/SURVIVED.
 * @throws {Error} If the file cannot be restored, or (as an AggregateError) if
 *   both `run()` and the restore fail.
 */
export function mutate({ file, find, replace, run, syntaxCheck = true }) {
  if (!existsSync(file)) {
    return { verdict: "BAD MUTATION", reason: `file does not exist: ${file}` };
  }

  const original = readFileSync(file, "utf8");
  const occurrences = countOccurrences(original, find);

  // Same rule as mutation-gate.mjs: zero means the pattern drifted, more than
  // one means the probe is ambiguous about what it is testing. Neither is a
  // result about the code under test.
  if (occurrences !== 1) {
    return {
      verdict: "BAD MUTATION",
      reason: `find matched ${occurrences} times, expected exactly 1`,
    };
  }

  const backup = join(tmpdir(), `mutate-${randomUUID()}.bak`);
  copyFileSync(file, backup);

  // Restore is a plain function, NOT a `finally` that throws. A throw inside
  // finally REPLACES an in-flight exception (eslint no-unsafe-finally), so a
  // failed restore would hide the runner error that actually explains the run.
  const restore = () => {
    copyFileSync(backup, file);
    const restored = readFileSync(file, "utf8") === original;
    if (restored) unlinkSync(backup);
    return restored;
  };

  let outcome;
  try {
    // applyReplacement splices by index rather than String.replace, so `$&` and
    // `$$` in a replacement are inserted verbatim.
    const mutated = applyReplacement(original, find, replace);

    if (mutated === original) {
      outcome = { verdict: "BAD MUTATION", reason: "replacement produced identical content" };
    } else {
      writeFileSync(file, mutated);

      // The mutant must be readable back from disk EXACTLY as computed.
      //
      // Compare full content, never `onDisk.includes(replace)`. That earlier
      // check could not fail for a DELETE mutation: `replace` is "" and every
      // string includes "". Deleting a clause is not an edge case here -- it is
      // the canonical mutation of this repo (dropping `AND verified = 1` from
      // the announce query), so the check was vacuous for exactly the shape it
      // most needed to verify. It also passed when `replace` happened to occur
      // elsewhere in the file already. Caught by Copilot on #1071.
      const onDisk = readFileSync(file, "utf8");

      if (onDisk !== mutated) {
        outcome = {
          verdict: "BAD MUTATION",
          reason: "file content after writing does not match the computed mutant",
        };
      } else {
        const parse = syntaxCheck && /\.(js|mjs|cjs)$/.test(file) ? syntaxCheckOf(file) : { verdict: "ok" };

        if (parse.verdict === "syntax") {
          // A mutant that does not parse tests nothing: it fails every test and
          // reads as a triumphantly caught mutation.
          outcome = { verdict: "BAD MUTATION", reason: `mutant does not parse: ${parse.detail}` };
        } else if (parse.verdict === "unusable") {
          outcome = {
            verdict: "BAD MUTATION",
            reason: `could not parse-check the mutant: ${parse.detail}`,
          };
        } else {
          const output = run();
          outcome = { verdict: outputShowsFailingTest(output) ? "CAUGHT" : "SURVIVED", output };
        }
      }
    }
  } catch (error) {
    // Restore, then rethrow the ORIGINAL error unmasked (a throw from `finally`
    // would REPLACE it — eslint no-unsafe-finally).
    //
    // A failed restore must NOT be swallowed here. The first draft did exactly
    // that: it ignored a false return AND caught any throw, so a probe whose
    // runner failed and whose restore also failed left the file mutated with no
    // signal at all, and every later probe then tested corrupt source. That is
    // the silent-unverified-state class this whole module exists to prevent.
    // AggregateError keeps both: the runner error explains the run, the restore
    // error explains why the tree is dirty.
    try {
      if (!restore()) {
        throw new Error(`could not verify restore of ${file} — backup kept at ${backup}`, {
          cause: error,
        });
      }
    } catch (restoreError) {
      throw new AggregateError(
        [error, restoreError],
        `mutate: runner failed AND restoration failed for ${file} — backup kept at ${backup}`,
        { cause: restoreError },
      );
    }
    throw error;
  }

  if (!restore()) {
    throw new Error(`mutate: FAILED TO RESTORE ${file} — backup kept at ${backup}`);
  }
  return outcome;
}
