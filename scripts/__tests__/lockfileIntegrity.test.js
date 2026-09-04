import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
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
    // lstatSync, not statSync: statSync FOLLOWS symlinks, so a link pointing at
    // an ancestor makes this recurse forever, and a link to somewhere outside
    // the repo would silently pull a foreign lockfile into the scan. Skip links
    // entirely rather than resolve them -- nothing here needs to follow one.
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      findLockfiles(full, found);
    } else if (entry === "package-lock.json") {
      found.push(full);
    }
  }
  return found;
}

/**
 * Valid Subresource Integrity: one or more `<algo>-<base64>` values.
 *
 * Truthiness is NOT enough. `integrity: true` and `integrity: "yes"` are both
 * truthy and neither verifies anything -- an entry hand-edited to either would
 * have passed the earlier check while npm rejected or ignored it.
 */
const SRI_RE = /^(?:sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2})(?:\s+sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2})*$/;

function isValidIntegrity(value) {
  return typeof value === "string" && SRI_RE.test(value);
}

/**
 * Schemes a `resolved` value may legitimately use.
 *
 * `https:` only for anything remote. The host allow-list alone is NOT
 * sufficient: `http://registry.npmjs.org/...` matches the allowed HOST while
 * fetching in plaintext, which is precisely the tamper-in-transit case this
 * guard exists to prevent. `git+https:`, `git+ssh:` and `ftp:` are refused
 * outright -- a git dependency bypasses the registry entirely and is a decision
 * that belongs in a diff, not a silent lockfile entry.
 */
const LOCAL_SCHEMES = new Set(["file:"]);

/**
 * Is this `resolved` value one we are willing to install from?
 *
 * ONE implementation, used by the scan below AND by the direct cases. When the
 * two were written separately the cases restated the logic, so they would have
 * stayed green while the real filter drifted -- a test that cannot fail for the
 * reason it claims.
 */
function isAllowedResolved(resolved) {
  let url;
  try {
    url = new NodeURL(resolved);
  } catch {
    return false;
  }
  if (LOCAL_SCHEMES.has(url.protocol)) return true;
  return url.protocol === "https:" && ALLOWED_REGISTRY_HOSTS.has(url.host);
}

/** Is this a remote entry, i.e. one that must carry an integrity hash? */
function isRemote(resolved) {
  try {
    return !LOCAL_SCHEMES.has(new NodeURL(resolved).protocol);
  } catch {
    return false;
  }
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
      .filter((e) => !isAllowedResolved(e.resolved))
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
      .filter((e) => isRemote(e.resolved))
      .filter((e) => !isValidIntegrity(e.integrity))
      .map((e) => `  ${e.lockfile} :: ${e.path} (integrity: ${JSON.stringify(e.integrity)})`);

    expect(offenders, `These entries download without an integrity hash:\n${offenders.join("\n")}`).toEqual([]);
  });

  // Direct cases for the two predicates. The scans above are satisfied by an
  // empty offender list, so on a clean tree they pass whether or not the
  // predicates are correct -- these are what make them non-vacuous. Each value
  // here is one that the ORIGINAL truthiness/regex checks accepted.
  describe("the predicates reject what the earlier checks let through", () => {
    it.each([
      ["plaintext to an allowed host", "http://registry.npmjs.org/x/-/x-1.0.0.tgz"],
      ["git dependency", "git+https://github.com/a/b.git#abc123"],
      ["git over ssh", "git+ssh://git@github.com/a/b.git"],
      ["ftp", "ftp://registry.npmjs.org/x.tgz"],
      ["a lookalike host", "https://registry.npmjs.org.evil.test/x.tgz"],
    ])("rejects %s", (_label, resolved) => {
      expect(isAllowedResolved(resolved)).toBe(false);
    });

    it("accepts a genuine registry URL", () => {
      expect(isAllowedResolved("https://registry.npmjs.org/vitest/-/vitest-4.1.11.tgz")).toBe(true);
    });

    it.each([
      ["boolean true", true],
      ["arbitrary string", "yes"],
      ["empty string", ""],
      ["undefined", undefined],
      ["wrong algorithm", "md5-abc123"],
      ["missing digest", "sha512-"],
    ])("rejects integrity: %s", (_label, value) => {
      expect(isValidIntegrity(value)).toBe(false);
    });

    it("accepts real SRI hashes, including multiple space-separated", () => {
      expect(isValidIntegrity("sha512-abcDEF123+/==")).toBe(true);
      expect(isValidIntegrity("sha256-abc123")).toBe(true);
      expect(isValidIntegrity("sha512-abc123 sha256-def456")).toBe(true);
    });
  });

  it("actually reads the lockfiles, so an empty scan cannot pass", () => {
    // The failure this prevents: a parser that finds nothing reports "no
    // offenders" forever. Both assertions above are satisfied by an empty list,
    // so without this the guard could rot into a no-op and stay green.
    const lockfiles = findLockfiles(REPO_ROOT).map((f) => relative(REPO_ROOT, f));
    expect(lockfiles).toContain("package-lock.json");
    expect(lockfiles).toContain(join("frontend", "package-lock.json"));

    // PER-LOCKFILE, not a global total. A single `entries.length > 1000` is
    // satisfied by one big lockfile while another contributes ZERO -- exactly
    // the file-shaped hole a global average cannot see, which is the same
    // reasoning behind the repo's coverage floor. It also breaks on a
    // legitimate dependency reduction, which trains people to lower it.
    const entries = resolvedEntries();
    const byLockfile = new Map(lockfiles.map((f) => [f, 0]));
    for (const e of entries) byLockfile.set(e.lockfile, (byLockfile.get(e.lockfile) ?? 0) + 1);

    const empty = [...byLockfile].filter(([, n]) => n === 0).map(([f]) => f);
    expect(empty, `These lockfiles yielded no entries -- the parser is not reading them:\n${empty.join("\n")}`).toEqual(
      [],
    );
    expect(entries.every((e) => typeof e.resolved === "string")).toBe(true);
  });
});
