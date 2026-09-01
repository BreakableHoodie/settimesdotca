import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkCoverageFloor } from "../check-coverage-floor.mjs";

/**
 * The gate verified against its own failure modes.
 *
 * A guard that has only ever been seen passing is not verified — and this one
 * decides whether an entirely untested handler can reach main, so its failure
 * paths matter more than its happy path.
 *
 * Fixtures rather than the real repo: driving it by deleting real tests would
 * be slow, destructive, and impossible to run in parallel.
 */

const fixtureDirs = [];
afterEach(() => {
  for (const dir of fixtureDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * Build a throwaway repo: source files under functions/api/ plus a
 * coverage-final.json describing them.
 *
 * realpathSync because on macOS os.tmpdir() resolves through /private, and the
 * gate realpaths both sides before comparing — an unresolved fixture path would
 * make every file look absent from the coverage map and fail for the wrong
 * reason.
 *
 * @param {Record<string, "covered"|"dark"|"absent">} files - repo-relative path → state.
 */
function makeFixture(files) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "coverage-floor-")));
  fixtureDirs.push(root);

  const coverage = {};
  for (const [rel, state] of Object.entries(files)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, "export function handler() {}\n");
    // "absent" = on disk but missing from the map, which is what a change to
    // vitest's coverage.include would produce.
    if (state === "absent") continue;
    coverage[abs] = { s: state === "dark" ? { 0: 0, 1: 0 } : { 0: 3, 1: 1 } };
  }

  mkdirSync(path.join(root, "coverage"), { recursive: true });
  writeFileSync(path.join(root, "coverage", "coverage-final.json"), JSON.stringify(coverage));

  return {
    repoRoot: root,
    coverageFile: path.join(root, "coverage", "coverage-final.json"),
    scanRoot: path.join(root, "functions", "api"),
  };
}

describe("check-coverage-floor — verified against its own failure modes", () => {
  it("FAILS and names the file when a handler has 0% coverage", () => {
    const fx = makeFixture({
      "functions/api/covered.js": "covered",
      "functions/api/admin/dark.js": "dark",
    });

    const result = checkCoverageFloor({ ...fx, allowed: new Set(), maxAllowed: 0 });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("functions/api/admin/dark.js");
    expect(result.message).toContain("0% statement coverage");
    // The covered file must not be dragged into the complaint.
    expect(result.message).not.toContain("functions/api/covered.js");
  });

  it("PASSES when the only 0% file is on the allowlist", () => {
    const fx = makeFixture({
      "functions/api/covered.js": "covered",
      "functions/api/admin/dark.js": "dark",
    });

    const result = checkCoverageFloor({
      ...fx,
      allowed: new Set(["functions/api/admin/dark.js"]),
      maxAllowed: 1,
    });

    expect(result.ok).toBe(true);
  });

  it("FAILS on a stale allowlist entry, so the list can only shrink", () => {
    const fx = makeFixture({ "functions/api/covered.js": "covered" });

    // Allowlisted, but the file now HAS coverage: the entry is a lie about the
    // repo's debt and must be deleted. This is what makes it a ratchet rather
    // than a TODO list that rots.
    const result = checkCoverageFloor({
      ...fx,
      allowed: new Set(["functions/api/covered.js"]),
      maxAllowed: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("no longer at 0%");
    expect(result.message).toContain("functions/api/covered.js");
  });

  it("FAILS when the allowlist grows past MAX_ALLOWED", () => {
    const fx = makeFixture({
      "functions/api/a.js": "dark",
      "functions/api/b.js": "dark",
    });

    const result = checkCoverageFloor({
      ...fx,
      allowed: new Set(["functions/api/a.js", "functions/api/b.js"]),
      maxAllowed: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("may only shrink");
  });

  it("FAILS — never silently passes — when the coverage file is missing", () => {
    const fx = makeFixture({ "functions/api/covered.js": "covered" });

    const result = checkCoverageFloor({
      ...fx,
      coverageFile: path.join(fx.repoRoot, "coverage", "nope.json"),
      allowed: new Set(),
      maxAllowed: 0,
    });

    expect(result.ok).toBe(false);
    // Must tell the reader how to produce the input, not just that it is absent.
    expect(result.message).toContain("npm run test:coverage");
  });

  it("FAILS when a file on disk is absent from the coverage map (the gate going blind)", () => {
    // The gate detects 0% files. A file MISSING from the map is invisible to
    // that check, so a change to vitest.config.js's coverage.include would
    // silently blind it. This is the guard-the-guard case.
    const fx = makeFixture({
      "functions/api/covered.js": "covered",
      "functions/api/ghost.js": "absent",
    });

    const result = checkCoverageFloor({ ...fx, allowed: new Set(), maxAllowed: 0 });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("absent from the coverage map");
    expect(result.message).toContain("functions/api/ghost.js");
  });

  it("PASSES when every handler has some coverage", () => {
    const fx = makeFixture({
      "functions/api/a.js": "covered",
      "functions/api/admin/b.js": "covered",
    });

    const result = checkCoverageFloor({ ...fx, allowed: new Set(), maxAllowed: 0 });

    expect(result.ok).toBe(true);
    expect(result.message).toContain("none at 0%");
  });
});
