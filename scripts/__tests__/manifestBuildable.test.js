/**
 * Guard: every workspace must be installable from its own manifest.
 *
 * THE BUG THIS CATCHES (found 2026-09-04, workers-mcp-server):
 * `package.json` declared `"workers-mcp": "^0.1.0"`. No such version was ever
 * published -- npm has 0.0.10-0.0.13 and four 0.1.0-N PRERELEASES, and a caret
 * range does not match a prerelease. So `npm install` in that directory failed
 * outright with ETARGET, and there was no lockfile to fall back on.
 *
 * That directory holds a DEPLOYED Cloudflare Worker bound to the production D1
 * database. Its own wrangler.toml header records that the Worker once had to be
 * reconstructed from Cloudflare's stored settings because no source existed in
 * any repository. The unbuildable manifest was that same failure returning in a
 * new form: the source existed, and still could not produce the artifact.
 *
 * Nothing caught it because the machine that deployed it had a working
 * node_modules from an earlier, different install. A stale tree on one laptop
 * is not a build.
 *
 * Two properties, both offline (`make gate` must stay fast and network-free):
 *   1. every manifest declaring dependencies has a lockfile beside it, and
 *   2. the lockfile actually SATISFIES the manifest's ranges -- which is the
 *      half that fails on `^0.1.0` vs `0.0.13`.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import semver from "semver";

const repoRoot = resolve(import.meta.dirname, "..", "..");

function trackedManifests() {
  const out = execFileSync("git", ["ls-files", "*package.json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return out.split("\n").filter((p) => p && !p.includes("node_modules/"));
}

const manifests = trackedManifests();

describe("every workspace is installable from its own manifest", () => {
  // A scan that finds nothing reports "all clear" forever. The repo has three
  // workspaces; if that changes this number is meant to be updated deliberately,
  // not to silently shrink to zero.
  it("finds the workspaces it is meant to scan", () => {
    expect(manifests.length).toBeGreaterThanOrEqual(3);
    expect(manifests).toContain("workers-mcp-server/package.json");
  });

  it.each(manifests)("%s has a lockfile and the lockfile satisfies it", (relative) => {
    const manifestPath = join(repoRoot, relative);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const declared = {
      ...(manifest.dependencies ?? {}),
      ...(manifest.devDependencies ?? {}),
    };
    if (Object.keys(declared).length === 0) return;

    const lockPath = join(dirname(manifestPath), "package-lock.json");
    expect(existsSync(lockPath), `${relative} declares dependencies but has no package-lock.json`).toBe(true);

    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    const packages = lock.packages ?? {};

    for (const [name, range] of Object.entries(declared)) {
      // Only plain semver ranges are checkable offline. A git/file/npm-alias
      // spec is skipped deliberately rather than guessed at.
      if (!semver.validRange(range)) continue;

      const entry = packages[`node_modules/${name}`];
      expect(entry, `${relative}: ${name} is declared but absent from the lockfile`).toBeDefined();

      expect(
        semver.satisfies(entry.version, range, { includePrerelease: true }),
        `${relative}: declared ${name}@${range} but the lockfile pins ${entry.version} — ` +
          `a fresh 'npm install' cannot reproduce this tree`,
      ).toBe(true);
    }
  });
});
