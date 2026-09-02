/**
 * Guards scripts/mutate.mjs — the helper that stops a probe reporting
 * "SURVIVED" when the mutation never applied.
 *
 * Every case here is a failure that actually occurred while verifying PRs in
 * this repo, not a hypothetical. The BAD MUTATION cases matter most: they are
 * the ones that previously printed green and were read as findings about the
 * code under test.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mutate, outputShowsFailingTest, stripAnsi } from "../../../scripts/mutate.mjs";

const SOURCE = ["export function greet(name) {", '  return "hello " + name;', "}", ""].join("\n");

let dir;
let file;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mutate-test-"));
  file = join(dir, "subject.mjs");
  writeFileSync(file, SOURCE);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const redRun = () => " Tests  1 failed | 4 passed (5)";
const greenRun = () => " Tests  5 passed (5)";

describe("mutate() — verdicts", () => {
  test("reports CAUGHT when the suite goes red", () => {
    const result = mutate({ file, find: '"hello "', replace: '"goodbye "', run: redRun });
    expect(result.verdict).toBe("CAUGHT");
  });

  test("reports SURVIVED when the suite stays green", () => {
    const result = mutate({ file, find: '"hello "', replace: '"goodbye "', run: greenRun });
    expect(result.verdict).toBe("SURVIVED");
  });
});

describe("mutate() — a mutation that never applied is NOT a survivor", () => {
  // The exact failure from #1062: a `find` that matched nothing, reported as
  // "SURVIVED — vacuous". The test was fine; the probe was broken.
  test("a find that matches nothing is BAD MUTATION, not SURVIVED", () => {
    const result = mutate({ file, find: "notPresentAnywhere", replace: "x", run: greenRun });
    expect(result.verdict).toBe("BAD MUTATION");
    expect(result.reason).toMatch(/matched 0 times/);
  });

  test("an ambiguous find is BAD MUTATION, not SURVIVED", () => {
    writeFileSync(file, SOURCE + "export const other = " + '"hello ";\n');
    const result = mutate({ file, find: '"hello "', replace: '"x"', run: greenRun });
    expect(result.verdict).toBe("BAD MUTATION");
    expect(result.reason).toMatch(/matched 2 times/);
  });

  // A mutant that does not parse fails every test, which reads as a
  // triumphantly caught mutation while proving nothing.
  test("a mutant that does not parse is BAD MUTATION, not CAUGHT", () => {
    const result = mutate({ file, find: "return", replace: "return return", run: redRun });
    expect(result.verdict).toBe("BAD MUTATION");
    expect(result.reason).toMatch(/does not parse/);
  });

  test("a replacement identical to the original is BAD MUTATION", () => {
    const result = mutate({ file, find: '"hello "', replace: '"hello "', run: greenRun });
    expect(result.verdict).toBe("BAD MUTATION");
    expect(result.reason).toMatch(/identical/);
  });
});

describe("mutate() — restoration", () => {
  test("restores the file after a verdict", () => {
    mutate({ file, find: '"hello "', replace: '"goodbye "', run: redRun });
    expect(readFileSync(file, "utf8")).toBe(SOURCE);
  });

  test("restores the file even when the runner throws", () => {
    expect(() =>
      mutate({
        file,
        find: '"hello "',
        replace: '"goodbye "',
        run: () => {
          throw new Error("runner exploded");
        },
      }),
    ).toThrow(/runner exploded/);
    expect(readFileSync(file, "utf8")).toBe(SOURCE);
  });
});

describe("mutate() — a failed restore is never swallowed", () => {
  // CodeRabbit finding on this PR. The first draft's catch block ignored a
  // false return from restore() AND caught any throw from it, so a probe whose
  // runner failed and whose restore also failed left the file mutated with no
  // signal — and every later probe then tested corrupt source. That is the
  // silent-unverified-state class this module exists to prevent, reintroduced
  // by the fix for an unrelated eslint error.
  test("reports BOTH failures when the runner throws and restore fails", () => {
    let thrown;
    try {
      mutate({
        file,
        find: '"hello "',
        replace: '"goodbye "',
        run: () => {
          // Make the restore impossible while the runner is failing: the file
          // is gone, so copyFileSync back over it cannot reproduce `original`.
          rmSync(dir, { recursive: true, force: true });
          throw new Error("runner exploded");
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeDefined();
    // The runner error must survive -- it explains the run.
    const messages = [thrown.message, ...(thrown.errors ?? []).map((e) => e.message)].join(" | ");
    expect(messages).toMatch(/runner exploded/);
    // ...and the restore failure must be reported, not swallowed.
    expect(messages).toMatch(/restor/i);
    // ...naming the backup, or the mutated file is unrecoverable.
    expect(messages).toMatch(/backup kept at/);
  });
});

describe("mutate() — $ in a replacement is literal", () => {
  // `$&` and `$$` are interpreted by String.replace and have silently corrupted
  // three edits in this repo, including one that spliced a function inside
  // itself. split/join gives them no meaning.
  test("inserts $& and $$ verbatim", () => {
    const result = mutate({
      file,
      find: '"hello "',
      replace: '"$& and $$ literal"',
      run: () => {
        expect(readFileSync(file, "utf8")).toContain('"$& and $$ literal"');
        return greenRun();
      },
    });
    expect(result.verdict).toBe("SURVIVED");
  });
});

describe("outputShowsFailingTest", () => {
  // Deriving "caught" from a non-zero exit treats a crashed runner or a missing
  // browser as a passing guard. Positive evidence only.
  test("requires a failing-test summary, not merely error output", () => {
    expect(outputShowsFailingTest(" Tests  1 failed | 4 passed (5)")).toBe(true);
    expect(outputShowsFailingTest(" Tests  5 passed (5)")).toBe(false);
    expect(outputShowsFailingTest("Error: browserType.launch: Executable doesn't exist")).toBe(false);
    expect(outputShowsFailingTest("")).toBe(false);
  });

  test("sees through ANSI colour codes", () => {
    const esc = String.fromCharCode(27);
    expect(outputShowsFailingTest(` ${esc}[31mTests${esc}[0m  2 failed | 1 passed (3)`)).toBe(true);
    expect(stripAnsi(`${esc}[31mred${esc}[0m`)).toBe("red");
  });
});
