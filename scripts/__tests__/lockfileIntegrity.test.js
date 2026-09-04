import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { URL as NodeURL } from "node:url";

/**
 * A lockfile says WHERE each package comes from and WHAT it must hash to.
 * Nothing in this repo checked either, and CLAUDE.md said so in as many words:
 * "That gap is real and currently unguarded here."
 *
 * `dependency-review` compares dependency CHANGES against advisory databases
 * and fails on a package with a KNOWN vulnerability. That is a real control and
 * it covers the common case. It does not verify that a `resolved` URL still
 * points at the expected registry, nor re-check `integrity`.
 *
 * The attack it misses is quiet: edit one entry's `resolved` to an
 * attacker-controlled host, leave `version` untouched, and `npm ci` fetches
 * whatever that host serves. No advisory fires, because the package name and
 * version are unchanged. The diff is one URL in a file reviewers skim -- and
 * CodeRabbit is configured to ignore lockfiles entirely (`!**\/package-lock.json`),
 * correctly, because line-level review of generated hashes is noise.
 *
 * So this is the guard for the shape no other gate here watches.
 */
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

// Where packages are allowed to come from. Deliberately one entry: this project
// installs from the public npm registry and nowhere else. A private registry or
// a git dependency is a decision worth making explicitly, in a diff that
// changes this line and says why.
const ALLOWED_REGISTRY_HOSTS = new Set(["registry.npmjs.org"]);

function findLockfiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === ".wrangler") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findLockfiles(full, found);
    } else if (entry === "package-lock.json") {
      found.push(full);
    }
  }
  return found;
}

/**
 * Every entry with a `resolved` URL, flattened across all lockfiles.
 *
 * DISCOVERED rather than hardcoded: a lockfile added later (a new workspace, a
 * second service) is covered the day it appears, instead of the day someone
 * remembers to add it here.
 */
function resolvedEntries() {
  const entries = [];
  for (const file of findLockfiles(REPO_ROOT)) {
    const lock = JSON.parse(readFileSync(file, "utf8"));
    for (const [path, meta] of Object.entries(lock.packages || {})) {
      if (!meta?.resolved) continue;
      entries.push({ lockfile: relative(REPO_ROOT, file), path, ...meta });
    }
  }
  return entries;
}

describe("supply chain: lockfiles resolve only to the expected registry", () => {
  it("has no package resolved from an unexpected host", () => {
    const offenders = resolvedEntries()
      .filter((e) => /^https?:/.test(e.resolved))
      .filter((e) => !ALLOWED_REGISTRY_HOSTS.has(new NodeURL(e.resolved).host))
      .map((e) => `  ${e.lockfile} :: ${e.path}\n    -> ${e.resolved}`);

    expect(
      offenders,
      "These lockfile entries fetch from a host that is not the public npm registry.\n" +
        "An edit repointing `resolved` while leaving `version` alone raises no advisory,\n" +
        "so dependency-review will not catch it and CodeRabbit skips lockfiles by design.\n" +
        "If a new registry is genuinely intended, add it to ALLOWED_REGISTRY_HOSTS in a\n" +
        "diff that explains why:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("has no remote package without an integrity hash", () => {
    // Without `integrity` npm cannot verify what it downloaded, so a compromised
    // or swapped tarball installs silently. Local `file:` entries legitimately
    // have none.
    const offenders = resolvedEntries()
      .filter((e) => /^https?:/.test(e.resolved))
      .filter((e) => !e.integrity)
      .map((e) => `  ${e.lockfile} :: ${e.path}`);

    expect(offenders, `These entries download without an integrity hash:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("actually reads the lockfiles, so an empty scan cannot pass", () => {
    // The failure this prevents: a parser that finds nothing reports "no
    // offenders" forever. Both assertions above are satisfied by an empty list,
    // so without this the guard could rot into a no-op and stay green.
    const lockfiles = findLockfiles(REPO_ROOT).map((f) => relative(REPO_ROOT, f));
    expect(lockfiles).toContain("package-lock.json");
    expect(lockfiles).toContain(join("frontend", "package-lock.json"));

    const entries = resolvedEntries();
    expect(entries.length).toBeGreaterThan(1000);
    expect(entries.every((e) => typeof e.resolved === "string")).toBe(true);
  });
});
