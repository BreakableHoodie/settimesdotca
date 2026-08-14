import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// #818 — `opencode.json` is committed, but the `instructions/` tree it used to
// point at is gitignored (`.gitignore: /instructions/`). So the config shipped
// to every contributor referenced three files that existed on exactly one
// machine. A fresh clone, CI, or a clean Otto checkout resolved none of them,
// and OpenCode reports nothing when an instruction file is missing — the run
// just proceeds with less context than the author believed it had.
//
// This scans for the class rather than the three paths that happened to be
// wrong: EVERY path the config declares must be tracked in git.
const REPO_ROOT = resolve(import.meta.dirname, "../..");

function trackedFiles() {
  const out = execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf8" });
  return new Set(out.split("\n").filter(Boolean));
}

describe("opencode.json instruction paths (#818)", () => {
  const config = JSON.parse(readFileSync(resolve(REPO_ROOT, "opencode.json"), "utf8"));

  it("declares at least one instruction file", () => {
    // Guards the guard: an empty array would make every assertion below vacuous.
    expect(Array.isArray(config.instructions)).toBe(true);
    expect(config.instructions.length).toBeGreaterThan(0);
  });

  it("references only files tracked in git", () => {
    const tracked = trackedFiles();
    const untracked = config.instructions.filter((p) => !tracked.has(p));

    expect(
      untracked,
      `opencode.json references file(s) not tracked in git: ${untracked.join(", ")}. ` +
        "A gitignored or missing path resolves to nothing on a fresh clone, and OpenCode " +
        "does not report the gap — the run proceeds with less context than intended.",
    ).toEqual([]);
  });

  it("does not reference the gitignored instructions/ tree", () => {
    const offenders = config.instructions.filter((p) => p.startsWith("instructions/"));

    expect(
      offenders,
      `opencode.json references the gitignored instructions/ tree: ${offenders.join(", ")}. ` +
        "Use the tracked .github/instructions/ tree instead.",
    ).toEqual([]);
  });
});
