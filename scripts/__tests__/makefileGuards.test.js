import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Two Makefile failure modes, each of which has bitten more than once, and both
 * of which are INVISIBLE when they happen (#1070).
 *
 * 1. A target missing from `.PHONY`. `lint-md` shipped that way, so a stray
 *    file of that name made `make` report "up to date" and lint NOTHING.
 * 2. An exit code masked by a pipeline. `cmd | sed` returns SED's status, so a
 *    failed command still exits 0. Three occurrences: `lint | tail -1` hiding a
 *    red lint (#609), `opencode stats | sed` in delegate-stats (caught in
 *    review on #1066), and the FIX for that one recreating it a level down.
 *
 * Both are silent, which is the profile CLAUDE.md says deserves a durable guard
 * over a repeat audit: a target that does nothing, and a recipe that succeeds
 * while failing, both look exactly like a green run.
 *
 * Deliberately narrow -- a lint for two known shapes, not a shell analyser. A
 * guard that flagged every pipeline would be disabled within a week.
 */
const MAKEFILE = fileURLToPath(new URL("../../Makefile", import.meta.url));
const source = readFileSync(MAKEFILE, "utf8");
const TAB = "\t";

/** Targets: `name:` at column 0. Excludes `.PHONY`, variables and comments. */
function declaredTargets(src = source) {
  const targets = [];
  for (const line of src.split("\n")) {
    const match = /^([a-zA-Z][a-zA-Z0-9_-]*)\s*:(?!=)/.exec(line);
    if (match) targets.push(match[1]);
  }
  return [...new Set(targets)];
}

/** The `.PHONY` list, following backslash continuations. */
function phonyTargets(src = source) {
  const names = [];
  let collecting = false;
  for (const line of src.split("\n")) {
    if (!collecting && !line.startsWith(".PHONY:")) continue;
    const body = collecting ? line : line.slice(".PHONY:".length);
    collecting = body.trimEnd().endsWith("\\");
    names.push(...body.replace(/\\$/, "").trim().split(/\s+/).filter(Boolean));
  }
  return new Set(names);
}

// Genuine file targets would belong here. There are none today, and an empty
// allowlist is strictly stronger than a seeded one: adding an entry means
// shipping the thing being prevented.
const NON_PHONY_ALLOWED = new Set();

// `help` pipes grep into awk to render its own menu. A failure there prints an
// empty list and nothing else -- it gates no build, writes no file, and feeds
// no other target. Named with the reason rather than silently skipped, the way
// cacheHeaders.test.js exempts its three routes.
const PIPELINE_ALLOWED_TARGETS = new Set(["help"]);

const FILTERS = ["sed", "grep", "head", "tail", "awk", "cut", "sort", "uniq"];

/** Recipe lines (tab-indented), continuations joined, tagged by target. */
function recipeLines(src = source) {
  const out = [];
  const lines = src.split("\n");
  let target;
  for (let i = 0; i < lines.length; i += 1) {
    const targetMatch = /^([a-zA-Z][a-zA-Z0-9_-]*)\s*:(?!=)/.exec(lines[i]);
    if (targetMatch) {
      target = targetMatch[1];
      continue;
    }
    if (!lines[i].startsWith(TAB)) continue;

    let text = lines[i];
    const lineNumber = i + 1;
    while (text.trimEnd().endsWith("\\") && i + 1 < lines.length) {
      i += 1;
      text = text.trimEnd().slice(0, -1) + " " + lines[i].trim();
    }
    out.push({ target, lineNumber, text });
  }
  return out;
}

/**
 * Does this recipe end in a filter whose status would mask the real one?
 *
 * Only the LAST segment matters: `a | grep b > file` still returns grep's
 * status. `pipefail` or an explicit capture makes it safe, and both are how the
 * existing recipes already handle it.
 */
export function masksExitCode(text) {
  // `set -o pipefail` (or -eo/-euo), not the mere WORD: `echo pipefail; cmd |
  // tail` enables nothing, and matching loosely would wave through exactly the
  // masking pipeline this scan exists to catch.
  //
  // Worth knowing before reaching for it: this Makefile sets `SHELL := /bin/sh`,
  // and /bin/sh is dash on most Linux CI images, where pipefail does not exist.
  // The portable fix here is capturing the status before filtering, which is
  // what delegate-stats already does.
  if (/\bset\s+-[a-z]*o\s+pipefail\b/.test(text)) return false;
  if (text.trimStart().startsWith("@#")) return false; // a comment ABOUT pipes
  if (!text.includes("|")) return false;

  // `||` is control flow, not a pipeline.
  const withoutOr = text.replace(/\|\|/g, " ");
  const segments = withoutOr.split("|");
  if (segments.length < 2) return false;

  const last = segments[segments.length - 1].trim();
  const command = last.split(/\s+/)[0]?.replace(/^@/, "");
  return FILTERS.includes(command);
}

describe("Makefile: every target is .PHONY (#1070)", () => {
  it("declares every target in .PHONY", () => {
    const phony = phonyTargets();
    const missing = declaredTargets().filter((t) => !phony.has(t) && !NON_PHONY_ALLOWED.has(t));

    expect(
      missing,
      "These targets are missing from .PHONY. A file of the same name would make\n" +
        'make report "up to date" and run NOTHING -- silently, which is how lint-md\n' +
        "once linted nothing at all:\n" +
        missing.map((t) => "  - " + t).join("\n"),
    ).toEqual([]);
  });

  it("finds the targets at all, so an empty scan cannot pass", () => {
    // A parser matching nothing would report "no missing targets" forever.
    const targets = declaredTargets();
    expect(targets.length).toBeGreaterThan(15);
    expect(targets).toContain("gate");
    expect(targets).toContain("lint-md");
    expect(phonyTargets().size).toBeGreaterThan(15);
  });
});

describe("Makefile: no recipe hides its exit code behind a filter (#1070)", () => {
  it("has no recipe ending in an unguarded filter pipeline", () => {
    const offenders = recipeLines()
      .filter(({ target }) => !PIPELINE_ALLOWED_TARGETS.has(target))
      .filter(({ text }) => masksExitCode(text));

    expect(
      offenders,
      "These recipes end in a filter, so they return the FILTER's status and a\n" +
        "failed command still exits 0 (the trap from #609 and #1066).\n" +
        "Capture the status before filtering (see delegate-stats), or enable\n" +
        "`set -o pipefail` -- but note SHELL is /bin/sh, which is dash on most\n" +
        "Linux CI images and has no pipefail:\n" +
        offenders
          .map((o) => "  Makefile:" + o.lineNumber + " (" + o.target + "): " + o.text.trim().slice(0, 100))
          .join("\n"),
    ).toEqual([]);
  });

  it("detects the shape it is looking for, and not every pipe", () => {
    // Guards the guard: a matcher that has drifted passes while checking
    // nothing, which is the silent-no-op class this whole file exists for.
    expect(masksExitCode(TAB + "npm run lint | tail -1")).toBe(true);
    expect(masksExitCode(TAB + "opencode stats | sed 's/x/y/'")).toBe(true);
    expect(masksExitCode(TAB + "cmd | grep foo > out.txt")).toBe(true);

    expect(masksExitCode(TAB + "set -o pipefail; npm run lint | tail -1")).toBe(false);
    expect(masksExitCode(TAB + "set -euo pipefail; npm run lint | tail -1")).toBe(false);
    // The WORD is not the option. This recipe still masks its exit code.
    expect(masksExitCode(TAB + "echo pipefail; npm run lint | tail -1")).toBe(true);
    expect(masksExitCode(TAB + "npm run lint")).toBe(false);
    expect(masksExitCode(TAB + "command -v opencode || { echo missing; exit 1; }")).toBe(false);
    // A filter mid-pipeline feeding a real command is not the shape.
    expect(masksExitCode(TAB + "grep foo file | xargs rm")).toBe(false);
  });

  it("reads real recipes, so the scan cannot pass by finding none", () => {
    const recipes = recipeLines();
    expect(recipes.length).toBeGreaterThan(30);
    expect(recipes.some((r) => r.target === "gate" || r.target === "lint-md")).toBe(true);
  });
});

describe("Makefile guards: proven against the REAL Makefile, mutated (#1070)", () => {
  // The assertions above only ever see a compliant file, so they prove the
  // guards do not false-positive -- not that they catch anything. Verifying
  // that by hand-editing the Makefile is a one-time check that leaves nothing
  // behind. These mutate a COPY of the real source, so the proof runs in CI on
  // every commit and survives whatever the Makefile becomes.

  it("reports a target removed from .PHONY", () => {
    // The lint-md failure exactly: present as a target, absent from .PHONY.
    const mutated = source.replace(/(\.PHONY:[^\n]*(?:\\\n[^\n]*)*)/, (block) => block.replace(/\blint-md\b\s*/, ""));
    expect(mutated).not.toBe(source);

    const phony = phonyTargets(mutated);
    const missing = declaredTargets(mutated).filter((t) => !phony.has(t));
    expect(missing).toContain("lint-md");

    // And the unmutated source still reports none, so this is the mutation
    // talking rather than a parser that flags everything.
    const clean = declaredTargets().filter((t) => !phonyTargets().has(t));
    expect(clean).toEqual([]);
  });

  it("reports a recipe that ends in a filter", () => {
    // `false | tail -1` exits 0 -- the whole defect, in one line.
    const mutated = source.replace(
      /^test-backend:.*$/m,
      "leaky-demo: ## demo\n\t@false | tail -1\n\ntest-backend: ## Backend unit tests",
    );
    expect(mutated).not.toBe(source);

    const offenders = recipeLines(mutated)
      .filter(({ target }) => !PIPELINE_ALLOWED_TARGETS.has(target))
      .filter(({ text }) => masksExitCode(text));

    expect(offenders.map((o) => o.target)).toContain("leaky-demo");
    expect(offenders.find((o) => o.target === "leaky-demo").text).toContain("false | tail -1");

    // The real Makefile still reports none.
    const clean = recipeLines()
      .filter(({ target }) => !PIPELINE_ALLOWED_TARGETS.has(target))
      .filter(({ text }) => masksExitCode(text));
    expect(clean).toEqual([]);
  });
});
