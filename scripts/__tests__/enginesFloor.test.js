/**
 * Guard: the declared Node floor must actually cover the APIs the code uses.
 *
 * THE GAP (#1121). Four test files use `import.meta.dirname`, which landed in
 * Node 20.11.0, while `package.json` declared no `engines` at all. A contributor
 * on 20.0-20.10 got a module-load failure rather than a clear version error, and
 * CI runs 22 — so nothing in CI could ever surface it.
 *
 * Declaring the floor documents the constraint. This test stops the two halves
 * drifting: adding an API with a higher requirement, or lowering the floor
 * below what the code already needs, fails here rather than on someone's laptop.
 *
 * Scope, honestly: it knows about the version-gated APIs listed in
 * `VERSION_GATED_APIS`. It cannot discover a new one on its own — that list is
 * maintained by hand, and this is a backstop against the case that has actually
 * happened, not proof no other exists.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// API -> the first Node version that provides it.
const VERSION_GATED_APIS = [
  { pattern: /\bimport\.meta\.dirname\b/, since: "20.11.0", name: "import.meta.dirname" },
  { pattern: /\bimport\.meta\.filename\b/, since: "20.11.0", name: "import.meta.filename" },
];

function trackedJsFiles() {
  // The WHOLE JS/TS family, not just the extensions in use today. `.cjs` was
  // missing and is currently unused, so that gap was latent -- but `.ts` was
  // missing too and there IS one tracked (workers-mcp-server/src/index.ts), so
  // a version-gated API added there would not have raised the floor.
  //
  // Listing extensions that do not exist yet costs nothing and removes the
  // failure mode where adding the first file of a type silently drops it out of
  // the scan.
  return (
    execFileSync("git", ["ls-files", "*.js", "*.mjs", "*.cjs", "*.jsx", "*.ts", "*.tsx", "*.mts", "*.cts"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .filter((p) => p && !p.includes("node_modules/"))
      // `git ls-files` lists TRACKED files, which includes ones deleted from the
      // working tree but not yet staged -- a legitimate mid-refactor state. Without
      // this the scan hands a missing path to readFileSync and the gate fails for a
      // reason unrelated to what it checks. CLAUDE.md records the same trap for the
      // Makefile lint recipes, which guard it with `[ -f "$f" ]`; this is the JS
      // equivalent, and it was found by hitting it.
      .filter((p) => existsSync(join(repoRoot, p)))
  );
}

const declared = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).engines?.node;

describe("engines.node covers the APIs the code actually uses", () => {
  it("declares a floor at all", () => {
    expect(declared, "package.json must declare engines.node").toBeTruthy();
    expect(semver.validRange(declared), `engines.node ${declared} is not a valid range`).toBeTruthy();
  });

  // A scan that reads no files reports all-clear forever. `> 0` is the honest
  // assertion for that -- an earlier `> 100` coupled the guard to repository
  // SIZE, so shrinking the repo would fail it for a reason unrelated to whether
  // the scan works.
  //
  // But `> 0` alone would not notice the glob being NARROWED to one directory,
  // which is the realistic way this rots. So it also asserts a known file is in
  // the list. This file is the one used, because it is guaranteed to exist
  // whenever the assertion runs.
  it("finds files to scan, including a known one", () => {
    const files = trackedJsFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(files, "the scan should reach this very test file -- if not, the glob has narrowed").toContain(
      "scripts/__tests__/enginesFloor.test.js",
    );
  });

  it.each(VERSION_GATED_APIS)("floor covers $name (since $since)", ({ pattern, since, name }) => {
    const users = trackedJsFiles().filter((rel) => pattern.test(readFileSync(join(repoRoot, rel), "utf8")));
    if (users.length === 0) return; // nothing uses it; nothing to require

    // The lowest version the declared range admits must still provide the API.
    const lowest = semver.minVersion(declared);
    expect(
      semver.gte(lowest, since),
      `${users.length} file(s) use ${name}, which needs Node >= ${since}, but engines.node ` +
        `"${declared}" admits ${lowest.version}. Either raise the floor or stop using ${name}.\n` +
        users
          .slice(0, 6)
          .map((u) => `  ${u}`)
          .join("\n"),
    ).toBe(true);
  });

  // The floor must also fit the TEST RUNNER, not just the code (#1176 review).
  // vitest 5 requires ^22.12 || ^24 || >=26 while engines still said >=20.11:
  // on Node 20 or 23 the suite failed to start, with no version error, and CI
  // (Node 22) could never surface it -- the same shape as #1121. Read from the
  // INSTALLED manifests, so a future bump that narrows support fails here.
  // Prerequisite lines in the docs drifted the moment engines changed (#1176
  // review: four docs still said "Node.js 20+"). Each stated minimum must equal
  // the floor engines.node actually admits.
  const PREREQ_DOCS = ["README.md", "CONTRIBUTING.md", "docs/D1_SETUP.md", "docs/DEPLOYMENT.md"];
  it.each(PREREQ_DOCS)("%s states the same Node minimum as engines.node", (doc) => {
    const text = readFileSync(join(repoRoot, doc), "utf8");
    const stated = [...text.matchAll(/Node\.js (\d+(?:\.\d+)?)\+/g)].map((m) => m[1]);
    expect(stated.length, `${doc} should state a Node.js minimum ("Node.js X.Y+")`).toBeGreaterThan(0);
    const floor = semver.minVersion(declared);
    for (const s of stated) {
      expect(semver.coerce(s).version, `${doc} says "Node.js ${s}+" but engines.node admits ${floor.version}`).toBe(
        floor.version,
      );
    }
  });

  it.each(["vitest", "@vitest/coverage-v8"])("engines.node fits what %s supports", (pkg) => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, "node_modules", pkg, "package.json"), "utf8"));
    const supported = manifest.engines?.node;
    if (!supported) return; // the package states no requirement
    expect(
      semver.subset(declared, supported),
      `engines.node "${declared}" admits Node versions ${pkg}@${manifest.version} does not support ` +
        `("${supported}"). Narrow engines.node to fit.`,
    ).toBe(true);
  });
});
