// A guard that has only been seen passing is not verified (CLAUDE.md
// "Verify guards against the failure they guard, not the success"). This
// proves scripts/mutation-gate.mjs's own failure modes against temp
// fixtures — never against the real MUTATIONS table, which would make the
// test's runtime and outcome depend on the current state of the whole repo.
//
// Each fixture is a throwaway git repo (mkdtemp'd, `git init`, committed)
// so `runOneMutation`'s restore-verification (`git diff --quiet`) is
// exercised for real, not skipped because the file happens to be untracked.
// vitest itself is launched from REPO_ROOT (so `npx vitest` resolves this
// repo's real, already-installed vitest binary) while `--root`/`--config`
// point it AT the fixture tree — see runOneMutation's `vitestCwd` doc.

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { REPO_ROOT, outputShowsFailingTest, runMutationGate, runOneMutation } from "../mutation-gate.mjs";

const FIXTURE_VITEST_CONFIG = `export default {
  test: { include: ["**/*.test.js"], globals: true, environment: "node" },
};
`;

let fixtureDirs = [];

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/**
 * Builds a throwaway repo: source.js + a __tests__/behavior.test.js + a
 * fixture vitest config, committed so restore-verification has something
 * real to diff against.
 */
function makeFixture({ sourceContent, testContent }) {
  // realpath: on macOS os.tmpdir() returns a path through the /var symlink
  // (canonical: /private/var/...). vitest resolves --root through
  // fs.realpath internally, so an un-resolved dir here makes the fixture
  // test file's absolute path fail to match anything under vitest's
  // resolved root -- "No test files found" (exit 1), which this script
  // would then misread as a CAUGHT mutation instead of a broken harness.
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "mutation-gate-fixture-")));
  fixtureDirs.push(dir);

  writeFileSync(path.join(dir, "vitest.config.mjs"), FIXTURE_VITEST_CONFIG);
  writeFileSync(path.join(dir, "source.js"), sourceContent);
  mkdirSync(path.join(dir, "__tests__"));
  writeFileSync(path.join(dir, "__tests__", "behavior.test.js"), testContent);

  git(["init", "-q"], dir);
  git(["add", "-A"], dir);
  git(
    [
      "-c",
      "user.email=mutation-gate-test@example.test",
      "-c",
      "user.name=mutation-gate-test",
      "commit",
      "-q",
      "-m",
      "init",
    ],
    dir,
  );

  return dir;
}

function runVitestOptions(dir) {
  return {
    cwd: dir,
    vitestCwd: REPO_ROOT,
    vitestExtraArgs: ["--root", dir, "--config", path.join(dir, "vitest.config.mjs")],
  };
}

const SOURCE = `export const THRESHOLD = 10;\n\nexport function isOverThreshold(n) {\n  return n > THRESHOLD;\n}\n`;

// Exercises the real behavior: fails when THRESHOLD is mutated down to 0
// (5 > 0 is true, but the test expects false).
const BEHAVIOR_TEST = `import { describe, expect, it } from "vitest";\nimport { isOverThreshold } from "../source.js";\n\ndescribe("isOverThreshold", () => {\n  it("returns false for a value under the threshold", () => {\n    expect(isOverThreshold(5)).toBe(false);\n  });\n});\n`;

// A real vacuous test in the CLAUDE.md sense: it exercises the module but
// asserts nothing that depends on THRESHOLD's value, so it passes identically
// whether THRESHOLD is 10 or 0.
const VACUOUS_TEST = `import { describe, expect, it } from "vitest";\nimport { isOverThreshold } from "../source.js";\n\ndescribe("isOverThreshold", () => {\n  it("is a function", () => {\n    expect(typeof isOverThreshold).toBe("function");\n  });\n});\n`;

afterEach(() => {
  for (const dir of fixtureDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  fixtureDirs = [];
});

// ESC as a code point: a literal escape byte in source is invisible in diffs
// and review, which is part of why this bug survived local verification.
const ESC = String.fromCharCode(27);
const colour = (code, text) => `${ESC}[${code}m${text}${ESC}[39m`;

describe("outputShowsFailingTest — the predicate that decides 'caught'", () => {
  it("sees a failing test in plain (uncoloured) vitest output", () => {
    expect(outputShowsFailingTest(" Test Files  1 failed (1)\n      Tests  1 failed | 6 passed (7)")).toBe(true);
  });

  // THE REGRESSION TEST. vitest colorizes in GitHub Actions but not through a
  // piped local run, so the summary line begins with an escape sequence rather
  // than whitespace. An `^\s*Tests` anchor does not match that, and the first
  // CI run turned all ten mutations into "inconclusive" gate failures while
  // every local run was green. Local verification could not have caught this:
  // the format differs by environment, not by code.
  it("sees a failing test when vitest colorizes its summary (CI)", () => {
    const coloured = `${ESC}[2m Test Files ${ESC}[22m ${colour(31, "1 failed")}\n${ESC}[2m Tests ${ESC}[22m ${colour(31, "1 failed")}${ESC}[2m | ${ESC}[22m${colour(32, "6 passed")}`;
    expect(outputShowsFailingTest(coloured)).toBe(true);
  });

  it("does NOT claim a failing test when everything passed", () => {
    expect(outputShowsFailingTest(" Test Files  1 passed (1)\n      Tests  7 passed (7)")).toBe(false);
    expect(outputShowsFailingTest(`${ESC}[2m Tests ${ESC}[22m ${colour(32, "7 passed")} (7)`)).toBe(false);
  });

  it("does NOT claim a failing test for a run that never got that far", () => {
    // Every one of these exits non-zero. None asserted anything.
    expect(outputShowsFailingTest("No test files found, exiting with code 1")).toBe(false);
    expect(outputShowsFailingTest("Error: Failed to load url ../source.js")).toBe(false);
    expect(outputShowsFailingTest("")).toBe(false);
    expect(outputShowsFailingTest(" Tests  0 failed | 0 passed (0)")).toBe(false);
  });
});

describe("mutation-gate — verified against its own failure modes", () => {
  it("FAILS (does not skip) when the find string is absent", () => {
    const dir = makeFixture({ sourceContent: SOURCE, testContent: BEHAVIOR_TEST });
    const original = readFileSync(path.join(dir, "source.js"), "utf8");

    const result = runOneMutation(
      {
        id: "absent-find",
        invariant: "test fixture",
        file: "source.js",
        find: "THRESHOLD = 999",
        replace: "THRESHOLD = 0",
        tests: ["__tests__/behavior.test.js"],
      },
      runVitestOptions(dir),
    );

    expect(result.status).toBe("gate-failure");
    expect(result.reason).toMatch(/not found/i);

    // #5: the source file must be byte-identical, including on this failing path.
    expect(readFileSync(path.join(dir, "source.js"), "utf8")).toBe(original);
  });

  it("FAILS (does not skip) when the find string occurs more than once", () => {
    const dupedSource = `export const THRESHOLD = 10; // THRESHOLD = 10\n\nexport function isOverThreshold(n) {\n  return n > THRESHOLD;\n}\n`;
    const dir = makeFixture({ sourceContent: dupedSource, testContent: BEHAVIOR_TEST });
    const original = readFileSync(path.join(dir, "source.js"), "utf8");

    const result = runOneMutation(
      {
        id: "duplicate-find",
        invariant: "test fixture",
        file: "source.js",
        find: "THRESHOLD = 10",
        replace: "THRESHOLD = 0",
        tests: ["__tests__/behavior.test.js"],
      },
      runVitestOptions(dir),
    );

    expect(result.status).toBe("gate-failure");
    expect(result.reason).toMatch(/occurs 2 times/i);

    // #5: never mutated in the first place, but still worth proving.
    expect(readFileSync(path.join(dir, "source.js"), "utf8")).toBe(original);
  });

  it("FAILS with the invariant named when a mutation survives (a vacuous test)", () => {
    const dir = makeFixture({ sourceContent: SOURCE, testContent: VACUOUS_TEST });
    const original = readFileSync(path.join(dir, "source.js"), "utf8");

    const mutation = {
      id: "surviving-mutant",
      invariant: "THRESHOLD must gate isOverThreshold — this fixture's test never checks it",
      file: "source.js",
      find: "THRESHOLD = 10",
      replace: "THRESHOLD = 0",
      tests: ["__tests__/behavior.test.js"],
    };

    const result = runOneMutation(mutation, runVitestOptions(dir));

    expect(result.status).toBe("surviving");
    expect(result.testExitCode).toBe(0); // the vacuous test kept passing against broken code

    // #5: restored even though the mutation survived.
    expect(readFileSync(path.join(dir, "source.js"), "utf8")).toBe(original);

    // The full-gate report names the invariant prominently, not just an id.
    const gateResult = runMutationGate({
      mutations: [mutation],
      knownSurviving: [],
      cwd: dir,
      vitestCwd: REPO_ROOT,
      vitestExtraArgs: runVitestOptions(dir).vitestExtraArgs,
    });
    expect(gateResult.ok).toBe(false);
    expect(gateResult.message).toContain("SURVIVING MUTANTS");
    expect(gateResult.message).toContain(mutation.invariant);
    expect(readFileSync(path.join(dir, "source.js"), "utf8")).toBe(original);
  });

  it("FAILS (never 'caught') when the mutation breaks parsing so no assertion runs", () => {
    const dir = makeFixture({ sourceContent: SOURCE, testContent: BEHAVIOR_TEST });
    const original = readFileSync(path.join(dir, "source.js"), "utf8");

    // Syntactically invalid. vitest exits NON-ZERO because the module fails to
    // load, without a single assertion ever running. Inferring "caught" from a
    // non-zero exit -- the intuitive reading, since "caught" is this gate's
    // PASSING direction -- would print PASS while proving nothing. Same class
    // as an OOM kill or a missing `npx`.
    const mutation = {
      id: "unparseable-mutation",
      invariant: "fixture: a run that asserted nothing must never be read as caught",
      file: "source.js",
      find: "THRESHOLD = 10",
      replace: "THRESHOLD = (((",
      tests: ["__tests__/behavior.test.js"],
    };

    const result = runOneMutation(mutation, runVitestOptions(dir));

    expect(result.status).toBe("gate-failure");
    expect(result.failureKind).toBe("inconclusive");
    expect(result.reason).toMatch(/no failing test/i);
    expect(result.testExitCode).not.toBe(0);

    // Restored, even though what was written to disk was not valid JavaScript.
    expect(readFileSync(path.join(dir, "source.js"), "utf8")).toBe(original);

    const gateResult = runMutationGate({
      mutations: [mutation],
      knownSurviving: [],
      cwd: dir,
      vitestCwd: REPO_ROOT,
      vitestExtraArgs: runVitestOptions(dir).vitestExtraArgs,
    });
    expect(gateResult.ok).toBe(false);
    // Reported as an inconclusive RUN, not as table drift -- the mutation applied
    // cleanly; it was the verification that failed. Sending someone to fix the
    // table would be sending them to the wrong place.
    expect(gateResult.message).toContain("Inconclusive runs");
    expect(gateResult.message).not.toContain("Table drift");
  });

  it("PASSES when the listed test actually catches the mutation", () => {
    const dir = makeFixture({ sourceContent: SOURCE, testContent: BEHAVIOR_TEST });
    const original = readFileSync(path.join(dir, "source.js"), "utf8");

    const mutation = {
      id: "caught-mutant",
      invariant: "THRESHOLD gates isOverThreshold",
      file: "source.js",
      find: "THRESHOLD = 10",
      replace: "THRESHOLD = 0",
      tests: ["__tests__/behavior.test.js"],
    };

    const result = runOneMutation(mutation, runVitestOptions(dir));

    expect(result.status).toBe("caught");
    expect(result.testExitCode).not.toBe(0);

    // #5: restored after a caught (test-failing) run too.
    expect(readFileSync(path.join(dir, "source.js"), "utf8")).toBe(original);

    const gateResult = runMutationGate({
      mutations: [mutation],
      knownSurviving: [],
      cwd: dir,
      vitestCwd: REPO_ROOT,
      vitestExtraArgs: runVitestOptions(dir).vitestExtraArgs,
    });
    expect(gateResult.ok).toBe(true);
    expect(gateResult.message).toContain("PASS");
  });

  it("refuses to run when a target file already has uncommitted changes", () => {
    const dir = makeFixture({ sourceContent: SOURCE, testContent: BEHAVIOR_TEST });
    // Dirty the file directly, bypassing the gate — simulating a real edit
    // already in progress when someone runs the gate.
    writeFileSync(path.join(dir, "source.js"), SOURCE + "\n// uncommitted edit\n");

    const mutation = {
      id: "dirty-tree",
      invariant: "test fixture",
      file: "source.js",
      find: "THRESHOLD = 10",
      replace: "THRESHOLD = 0",
      tests: ["__tests__/behavior.test.js"],
    };

    const gateResult = runMutationGate({
      mutations: [mutation],
      knownSurviving: [],
      cwd: dir,
      vitestCwd: REPO_ROOT,
      vitestExtraArgs: runVitestOptions(dir).vitestExtraArgs,
    });

    expect(gateResult.ok).toBe(false);
    expect(gateResult.reason).toBe("dirty-working-tree");
    expect(gateResult.results).toEqual([]); // never even attempted a mutation
    expect(readFileSync(path.join(dir, "source.js"), "utf8")).toBe(SOURCE + "\n// uncommitted edit\n");
  });
});
