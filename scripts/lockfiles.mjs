// Every npm lockfile in the repository, the one list the security digest and
// the override-range guard both read. scripts/__tests__/lockfileCoverage.test.js
// checks it against `git ls-files`, and that each one's directory has the
// min-release-age cooldown and a Dependabot npm entry.
//
// Why one list: the MCP Worker's lockfile was missed three separate times
// (its .npmrc, the override guard, the digest), and no rule could see it,
// because a rule can flag a file with a bad value, never a file it was not
// told about.
export const LOCKFILES = ["package-lock.json", "frontend/package-lock.json", "workers-mcp-server/package-lock.json"];

/** The directory a lockfile lives in, relative to the repo root ("" for the root). */
export const lockfileDir = (lockfile) => (lockfile.includes("/") ? lockfile.slice(0, lockfile.lastIndexOf("/")) : "");
