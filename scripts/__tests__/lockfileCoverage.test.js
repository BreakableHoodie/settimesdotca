import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { LOCKFILES, lockfileDir } from "../lockfiles.mjs";

// Every npm lockfile gets every supply-chain control, and none is forgotten:
// the MCP Worker's was missed by its .npmrc, the override guard and the
// security digest in turn, each found only by accident. Checking the one list
// against git turns "a lockfile nobody told the rules about" into a failure.
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const trackedLockfiles = () =>
  execFileSync("git", ["ls-files", "*package-lock.json", "package-lock.json"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !f.includes("node_modules/"))
    .sort();

// The EFFECTIVE value npm uses in that directory, not the first line of the
// file: npm applies the last assignment, so `=7` then `=0` is no cooldown
// (CodeRabbit, #1373). The file must exist too, or a developer's ~/.npmrc
// would satisfy `npm config get` while CI has nothing.
const cooldownDays = (dir) => {
  if (!existsSync(join(REPO_ROOT, dir, ".npmrc"))) return null;
  const effective = execFileSync("npm", ["config", "get", "min-release-age"], {
    cwd: join(REPO_ROOT, dir),
    encoding: "utf8",
  }).trim();
  return /^\d+$/.test(effective) ? Number(effective) : null;
};

// Directory -> its npm entry's cooldown in days (0 when it sets none).
const dependabotNpmCooldowns = () => {
  const config = loadYaml(readFileSync(join(REPO_ROOT, ".github/dependabot.yml"), "utf8"));
  return new Map(
    (config.updates ?? [])
      .filter((u) => u["package-ecosystem"] === "npm")
      .map((u) => [(u.directory ?? "/").replace(/^\/+|\/+$/g, ""), Number(u.cooldown?.["default-days"] ?? 0)]),
  );
};

describe("every npm lockfile gets every supply-chain control", () => {
  it("LOCKFILES is exactly the tracked lockfiles (the digest and override guard read it)", () => {
    expect([...LOCKFILES].sort()).toEqual(trackedLockfiles());
  });

  it.each(LOCKFILES)("%s: its directory has a min-release-age of at least 7 days", (lockfile) => {
    expect(cooldownDays(lockfileDir(lockfile))).toBeGreaterThanOrEqual(7);
  });

  it.each(LOCKFILES)("%s: Dependabot has an npm entry for its directory, with a 7-day cooldown", (lockfile) => {
    expect(dependabotNpmCooldowns().get(lockfileDir(lockfile))).toBeGreaterThanOrEqual(7);
  });

  it("the checks can fail (a guard that cannot is checking nothing)", () => {
    expect(cooldownDays("no-such-directory")).toBeNull();
    expect(dependabotNpmCooldowns().get("no-such-directory")).toBeUndefined();
    expect(lockfileDir("a/b/package-lock.json")).toBe("a/b");
    expect(lockfileDir("package-lock.json")).toBe("");
  });
});
