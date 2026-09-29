import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const LOCKFILES = ["package-lock.json", "frontend/package-lock.json"];

// These two plugins have not declared support for eslint 10 yet. They are the
// only intentional peer-range exceptions in the two lockfiles.
const ESLINT_10_PEER_ALLOWLIST = new Set(["eslint-plugin-jsx-a11y", "eslint-plugin-react"]);

// A RATCHET, not a ban (#1208). Every entry below is an `overrides` entry that
// forces a version outside what its dependent declares, and every one was
// added on purpose to clear a security advisory, all in the Lighthouse CI dev
// toolchain (`npm audit --omit=dev` is clean). Forcing them back into range
// made the audit WORSE (3 moderate -> 1 high, 4 moderate, 3 low), so they are
// recorded, not fixed.
//
// What the guard enforces:
//   - any conflict NOT listed here fails: a new override, or a Dependabot bump
//     that pushes an existing override out of a dependent's range, is exactly
//     the #1205 failure (a root js-yaml override crashed validate:openapi);
//   - any entry that no longer conflicts fails too, so the list only shrinks.
//     Delete the entry when its override is removed or its dependent catches up.
//
// Keyed on lockfile + dependent + dependency, NOT versions, so a patch bump
// inside the same conflict does not churn this list.
const KNOWN_OVERRIDE_CONFLICTS = {
  "frontend/package-lock.json|node_modules/@lhci/cli|chrome-launcher": "January 2026 release (#21)",
  "frontend/package-lock.json|node_modules/@lhci/cli|tmp": "January 2026 release (#21)",
  "frontend/package-lock.json|node_modules/@lhci/cli|uuid": "GHSA-w5hq-g745-h8pq (#226)",
  "frontend/package-lock.json|node_modules/@lhci/utils|js-yaml":
    "audit alerts (#327); @lhci 0.15.1 is the latest and still declares ^3 (#1208)",
  "frontend/package-lock.json|node_modules/body-parser|qs": "Dependabot alerts (#1182)",
  "frontend/package-lock.json|node_modules/external-editor|tmp": "January 2026 release (#21)",
  "frontend/package-lock.json|node_modules/node-gyp|undici": "audit alerts (#327)",
  "frontend/package-lock.json|node_modules/puppeteer-core|@puppeteer/browsers":
    "drops extract-zip (#819); puppeteer-core 24.43.1 pins 2.13.2 exactly (#1208)",
  "frontend/package-lock.json|node_modules/puppeteer-core|ws": "audit alerts (#327), via the lighthouse ws override",
};

const conflictKey = (v) => `${v.lockfile}|${v.dependent}|${v.dependency}`;

function isSemverRange(range) {
  if (typeof range !== "string") return false;
  if (/^(?:file:|git(?:\+|:)|https?:|npm:|workspace:)/.test(range)) return false;
  return semver.validRange(range) !== null;
}

function resolvePackage(packages, dependentPath, dependencyName) {
  let current = dependentPath;
  while (true) {
    const candidate = current
      ? posix.join(current, "node_modules", dependencyName)
      : posix.join("node_modules", dependencyName);
    if (packages[candidate]) return { path: candidate, entry: packages[candidate] };
    if (!current) return undefined;
    current = posix.dirname(current);
    if (current === ".") current = "";
  }
}

function scanLockfile(lock, lockfile) {
  const packages = lock.packages ?? {};
  const violations = [];
  let examinedEdges = 0;

  for (const [dependentPath, dependent] of Object.entries(packages)) {
    for (const [kind, dependencies] of Object.entries({
      dependencies: dependent?.dependencies,
      peerDependencies: dependent?.peerDependencies,
    })) {
      for (const [dependencyName, declaredRange] of Object.entries(dependencies ?? {})) {
        if (kind === "peerDependencies" && dependent.peerDependenciesMeta?.[dependencyName]?.optional) continue;
        if (!isSemverRange(declaredRange)) continue;

        const resolved = resolvePackage(packages, dependentPath, dependencyName);
        if (!resolved || typeof resolved.entry.version !== "string") continue;
        examinedEdges += 1;

        if (dependencyName === "eslint" && ESLINT_10_PEER_ALLOWLIST.has(posix.basename(dependentPath))) {
          continue;
        }
        if (!semver.satisfies(resolved.entry.version, declaredRange, { includePrerelease: true })) {
          violations.push({
            lockfile,
            dependent: dependentPath || ".",
            dependency: dependencyName,
            declaredRange,
            resolvedVersion: resolved.entry.version,
          });
        }
      }
    }
  }

  return { examinedEdges, violations };
}

function readLockfile(lockfile) {
  return JSON.parse(readFileSync(`${REPO_ROOT}/${lockfile}`, "utf8"));
}

function formatViolation(violation) {
  return (
    `  ${violation.lockfile}: ${violation.dependent} -> ${violation.dependency} ` +
    `(declared ${violation.declaredRange}, resolved ${violation.resolvedVersion})`
  );
}

describe("dependency overrides stay within dependent ranges", () => {
  const violations = () => LOCKFILES.flatMap((lockfile) => scanLockfile(readLockfile(lockfile), lockfile).violations);

  it("has no installed dependency outside its declared range, except the recorded ones", () => {
    const unexpected = violations().filter((v) => !(conflictKey(v) in KNOWN_OVERRIDE_CONFLICTS));
    expect(
      unexpected,
      `Installed dependency edges outside their declared ranges (not in KNOWN_OVERRIDE_CONFLICTS):\n` +
        `${unexpected.map(formatViolation).join("\n")}\n` +
        `Fix the override, or record it with the advisory that justifies it.`,
    ).toEqual([]);
  });

  it("records no conflict that has already been resolved (the list only shrinks)", () => {
    const live = new Set(violations().map(conflictKey));
    const stale = Object.keys(KNOWN_OVERRIDE_CONFLICTS).filter((key) => !live.has(key));
    expect(stale, `No longer out of range; delete from KNOWN_OVERRIDE_CONFLICTS:\n  ${stale.join("\n  ")}`).toEqual([]);
  });

  it("examines both lockfiles and rejects a synthetic mismatch", () => {
    const results = LOCKFILES.map((lockfile) => scanLockfile(readLockfile(lockfile), lockfile));
    expect(results[0].examinedEdges).toBeGreaterThan(500);
    expect(results[1].examinedEdges).toBeGreaterThan(1000);

    const synthetic = scanLockfile(
      {
        packages: {
          "": { dependencies: { parent: "1.0.0" } },
          "node_modules/parent": { version: "1.0.0", dependencies: { child: "^2.0.0" } },
          "node_modules/child": { version: "1.0.0" },
        },
      },
      "synthetic/package-lock.json",
    );
    expect(synthetic.violations).toEqual([
      expect.objectContaining({
        dependent: "node_modules/parent",
        dependency: "child",
        declaredRange: "^2.0.0",
        resolvedVersion: "1.0.0",
      }),
    ]);
  });
});
