import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCEPTED_NPM_AUDIT,
  buildDigest,
  collectSecurityData,
  defaultRunner,
  main,
  RUNNER_LIMITS,
} from "../security-digest.mjs";
import { LOCKFILES } from "../lockfiles.mjs";

const NOW = new Date("2026-10-10T12:00:00Z");

function dependabotAlert(createdAt) {
  return {
    number: 12,
    created_at: createdAt,
    security_vulnerability: { severity: "high" },
    dependency: { package: { name: "brace-expansion" }, manifest_path: "/package.json" },
  };
}

function analysis(tool, createdAt) {
  return { tool: { name: tool }, created_at: createdAt };
}

// Both required scanners uploading recently: the baseline for tests about
// OTHER behaviour, so "no analysis at all" does not open the digest for them.
const HEALTHY_SCANNERS = [analysis("CodeQL", "2026-10-09T12:00:00Z"), analysis("Semgrep PRO", "2026-10-09T12:00:00Z")];

describe("security digest", () => {
  it("opens for an old Dependabot alert and lists it", () => {
    const digest = buildDigest({ now: NOW, dependabot: [dependabotAlert("2026-09-30T12:00:00Z")] });
    expect(digest.shouldOpen).toBe(true);
    expect(digest.body).toContain("[#12](https://github.com/BreakableHoodie/settimesdotca/security/dependabot/12)");
  });

  it("does not open for a fresh alert with no other problems", () => {
    expect(
      buildDigest({ now: NOW, analyses: HEALTHY_SCANNERS, dependabot: [dependabotAlert("2026-10-07T12:00:00Z")] })
        .shouldOpen,
    ).toBe(false);
  });

  it("opens when Semgrep analyses are stale even with no alerts", () => {
    const digest = buildDigest({
      now: NOW,
      analyses: [analysis("Semgrep", "2026-09-20T12:00:00Z"), analysis("CodeQL", "2026-10-09T12:00:00Z")],
    });
    expect(digest.shouldOpen).toBe(true);
    expect(digest.problems.join(" ")).toContain("Semgrep");
    expect(digest.problems.join(" ")).toContain("2026-09-20T12:00:00Z");
  });

  // A scanner that has stopped uploading entirely must be FLAGGED, not skipped.
  // The first draft skipped tools with no analyses, so a fully dead scanner
  // produced no problem at all: the same silent failure this guards against.
  it("opens when a required scanner has no analysis at all", () => {
    const digest = buildDigest({ now: NOW, analyses: [analysis("CodeQL", "2026-10-09T12:00:00Z")] });
    expect(digest.shouldOpen).toBe(true);
    expect(digest.problems.join(" ")).toContain("Semgrep has no code-scanning analysis at all");
  });

  it("treats the API's 404 'no analysis found' for one tool as none, but still fails closed on other errors", () => {
    const runner = (file, args) => {
      if (file === "gh" && args.at(-1).includes("tool_name=Semgrep%20OSS")) {
        return { status: 1, stdout: "", stderr: "gh: no analysis found (HTTP 404)" };
      }
      if (file === "gh") return { status: 0, stdout: "[]" };
      return { status: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: {} }, vulnerabilities: {} }) };
    };
    expect(() => collectSecurityData({ runner, root: "/tmp" })).not.toThrow();
    const failing = (file, args) =>
      file === "gh" && args.at(-1).includes("tool_name=CodeQL")
        ? { status: 1, stdout: "", stderr: "gh: Resource not accessible by integration (HTTP 403)" }
        : runner(file, args);
    expect(() => collectSecurityData({ runner: failing, root: "/tmp" })).toThrow(/CodeQL/);
  });

  it("stays clear with empty inputs and fresh analyses", () => {
    const digest = buildDigest({
      now: NOW,
      analyses: [analysis("Semgrep", "2026-10-09T12:00:00Z"), analysis("CodeQL", "2026-10-09T12:00:00Z")],
    });
    expect(digest.shouldOpen).toBe(false);
    expect(digest.problems).toEqual([]);
  });

  it("fails closed when a GitHub fetch returns a 403", () => {
    expect(() => main({ runner: () => ({ status: 403, stdout: "", stderr: "forbidden" }), now: NOW })).toThrow(
      /failed with exit code 403/,
    );
  });

  // The accepted list is what keeps the digest meaningful: without it, known
  // and deliberately accepted advisories would hold the issue open forever.
  // Both directions are asserted, so neither "accept everything" nor
  // "accept nothing" can pass.
  const ACCEPTED = { name: "postcss-selector-parser", advisory: "GHSA-rj75-hqrm-r3gf", severity: "moderate" };

  it("does not open for npm audit advisories that are all on the accepted list", () => {
    const digest = buildDigest({
      now: NOW,
      analyses: HEALTHY_SCANNERS,
      npmAudit: [{ lockfile: "frontend/package-lock.json", findings: [ACCEPTED], moderate: 1 }],
    });
    expect(digest.problems).toEqual([]);
    expect(digest.shouldOpen).toBe(false);
    expect(digest.body).toContain("moderate 1");
  });

  it("opens for an npm audit advisory that is not on the accepted list, and names it", () => {
    const digest = buildDigest({
      now: NOW,
      npmAudit: [
        {
          lockfile: "frontend/package-lock.json",
          findings: [ACCEPTED, { name: "undici", advisory: "GHSA-aaaa-bbbb-cccc", severity: "high" }],
          high: 1,
          moderate: 1,
        },
      ],
    });
    expect(digest.shouldOpen).toBe(true);
    expect(digest.problems.join("\n")).toContain("undici GHSA-aaaa-bbbb-cccc (high)");
    expect(digest.problems.join("\n")).not.toContain("postcss-selector-parser");
  });

  // The reason acceptance is keyed by advisory: a package-level entry would
  // silently accept the NEXT advisory published against the same package.
  it("a new advisory on an accepted package is NOT accepted", () => {
    const digest = buildDigest({
      now: NOW,
      analyses: HEALTHY_SCANNERS,
      npmAudit: [
        {
          lockfile: "frontend/package-lock.json",
          findings: [ACCEPTED, { ...ACCEPTED, advisory: "GHSA-new0-advi-sory", severity: "high" }],
          high: 1,
          moderate: 1,
        },
      ],
    });
    expect(digest.shouldOpen).toBe(true);
    expect(digest.problems.join("\n")).toContain("GHSA-new0-advi-sory");
  });

  it("a finding with no advisory id is never accepted", () => {
    const digest = buildDigest({
      now: NOW,
      analyses: HEALTHY_SCANNERS,
      npmAudit: [{ lockfile: "frontend/package-lock.json", findings: [{ ...ACCEPTED, advisory: "" }], moderate: 1 }],
    });
    expect(digest.shouldOpen).toBe(true);
    expect(digest.problems.join("\n")).toContain("(no advisory id)");
  });

  it("an accepted entry only covers its own lockfile", () => {
    const digest = buildDigest({
      now: NOW,
      npmAudit: [{ lockfile: "package-lock.json", findings: [ACCEPTED], moderate: 1 }],
    });
    expect(digest.shouldOpen).toBe(true);
  });

  it("lists accepted entries that are no longer flagged, so the list can shrink", () => {
    const digest = buildDigest({
      now: NOW,
      analyses: HEALTHY_SCANNERS,
      npmAudit: [{ lockfile: "frontend/package-lock.json", findings: [], critical: 0 }],
    });
    expect(Object.keys(ACCEPTED_NPM_AUDIT).length).toBeGreaterThan(0);
    expect(digest.body).toContain("`frontend/package-lock.json|postcss-selector-parser|GHSA-rj75-hqrm-r3gf`");
    expect(digest.shouldOpen).toBe(false);
  });

  it("reads one finding per advisory from npm audit JSON, skipping transitive pointers", () => {
    const audit = {
      metadata: { vulnerabilities: { high: 1, moderate: 0 } },
      vulnerabilities: {
        "basic-ftp": {
          severity: "high",
          via: [{ source: 1, url: "https://github.com/advisories/GHSA-c475-qrg2-pj4r", severity: "high" }],
        },
        "get-uri": { severity: "high", via: ["basic-ftp"] },
      },
    };
    const runner = (file) =>
      file === "npm" ? { status: 1, stdout: JSON.stringify(audit) } : { status: 0, stdout: "[]" };
    const { npmAudit } = collectSecurityData({ runner, root: "/tmp" });
    expect(npmAudit[0].findings).toEqual([{ name: "basic-ftp", advisory: "GHSA-c475-qrg2-pj4r", severity: "high" }]);
  });

  // GitHub rejects an issue body over 65,536 characters; ~400 alert lines
  // would fail the digest exactly when the backlog is largest.
  it("caps the listed alerts, keeping the counts exact", () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ ...dependabotAlert("2026-09-01T00:00:00Z"), number: i + 1 }));
    const digest = buildDigest({ now: NOW, analyses: HEALTHY_SCANNERS, dependabot: many });
    expect(digest.body.length).toBeLessThan(65_536);
    expect(digest.body).toContain("Dependabot: 600 open");
    expect(digest.body).toContain("…and 550 more");
  });

  it("lists overdue alerts within the cap even when newer alerts outnumber it", () => {
    const fresh = Array.from({ length: 60 }, (_, i) => ({ ...dependabotAlert("2026-10-09T00:00:00Z"), number: i + 1 }));
    const overdue = { ...dependabotAlert("2026-09-01T00:00:00Z"), number: 999 };
    const digest = buildDigest({ now: NOW, analyses: HEALTHY_SCANNERS, dependabot: [...fresh, overdue] });
    expect(digest.shouldOpen).toBe(true);
    expect(digest.body).toContain("dependabot/999)");
  });

  // import.meta.url is percent-encoded; comparing it with a raw path never
  // matched a checkout containing a space, and the job exited 0 doing nothing.
  it("runs main() when invoked from a path containing a space", () => {
    const dir = mkdtempSync(join(tmpdir(), "digest entry "));
    try {
      const script = join(dir, "security-digest.mjs");
      copyFileSync(new URL("../security-digest.mjs", import.meta.url), script);
      // Its one local import travels with it, as it does in the repo.
      copyFileSync(new URL("../lockfiles.mjs", import.meta.url), join(dir, "lockfiles.mjs"));
      // No gh on PATH: main() must RUN and fail loudly, not be skipped.
      const result = spawnSync(process.execPath, [script], { env: { PATH: dir }, encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Security digest failed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Contract test: the unit tests inject a runner, so nothing else checks the
  // REAL arguments. The first draft called "BreakableHoodie/..." without the
  // `repos/` prefix and 404'd on the live API; only a dry run caught it.
  it("calls the GitHub REST endpoints with the repos/ prefix, and does not paginate analyses", () => {
    const ghCalls = [];
    const runner = (file, args) => {
      if (file === "gh") {
        ghCalls.push(args);
        return { status: 0, stdout: "[]" };
      }
      return { status: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: {} }, vulnerabilities: {} }) };
    };
    collectSecurityData({ runner, root: "/tmp" });
    const endpoints = ghCalls.map((args) => args.at(-1));
    expect(endpoints).toEqual([
      "repos/BreakableHoodie/settimesdotca/dependabot/alerts?state=open&per_page=100",
      "repos/BreakableHoodie/settimesdotca/code-scanning/alerts?state=open&per_page=100",
      "repos/BreakableHoodie/settimesdotca/code-scanning/analyses?tool_name=CodeQL&per_page=1",
      "repos/BreakableHoodie/settimesdotca/code-scanning/analyses?tool_name=Semgrep%20OSS&per_page=1",
      "repos/BreakableHoodie/settimesdotca/code-scanning/analyses?tool_name=Semgrep%20PRO&per_page=1",
      "repos/BreakableHoodie/settimesdotca/code-scanning/analyses?tool_name=Semgrep&per_page=1",
    ]);
    expect(ghCalls.at(-1)).not.toContain("--paginate");
    expect(ghCalls[0]).toContain("--paginate");
  });

  it("audits every lockfile in its own directory, the MCP Worker's included", () => {
    const npmCwds = [];
    const runner = (file, args, options = {}) => {
      if (file === "npm") {
        npmCwds.push(options.cwd);
        return { status: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: {} }, vulnerabilities: {} }) };
      }
      return { status: 0, stdout: "[]" };
    };
    collectSecurityData({ runner, root: "/repo" });
    expect(npmCwds).toEqual(["/repo", "/repo/frontend", "/repo/workers-mcp-server"]);
  });

  it("parses npm audit JSON even when npm audit exits non-zero", () => {
    const calls = [];
    const runner = (file, args) => {
      calls.push([file, args]);
      if (file === "gh" && args[0] === "api") return { status: 0, stdout: "[]" };
      if (file === "gh") return { status: 0, stdout: "[]" };
      return {
        status: 1,
        stdout: JSON.stringify({ metadata: { vulnerabilities: { critical: 1 } } }),
        stderr: "audit found vulnerabilities",
      };
    };
    const digest = main({ runner, now: NOW });
    expect(digest.body).toContain("critical 1");
    expect(digest.shouldOpen).toBe(true);
    // One audit per lockfile, in that lockfile's own directory.
    expect(calls.filter(([file]) => file === "npm")).toHaveLength(LOCKFILES.length);
  });

  it("creates its label before opening the first digest issue", () => {
    const ghCalls = [];
    const runner = (file, args) => {
      if (file === "gh") {
        ghCalls.push(args);
        return { status: 0, stdout: "[]" };
      }
      return { status: 1, stdout: JSON.stringify({ metadata: { vulnerabilities: { critical: 1 } } }) };
    };
    main({ runner, now: NOW });
    const labelAt = ghCalls.findIndex((args) => args[0] === "label" && args[1] === "create");
    const createAt = ghCalls.findIndex((args) => args[0] === "issue" && args[1] === "create");
    expect(labelAt).toBeGreaterThanOrEqual(0);
    expect(ghCalls[labelAt]).toContain("--force");
    expect(labelAt).toBeLessThan(createAt);
  });

  it("the default runner reads more than execFileSync's 1 MiB default", () => {
    const result = defaultRunner(process.execPath, ["-e", "process.stdout.write('x'.repeat(2 * 1024 * 1024))"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toHaveLength(2 * 1024 * 1024);
  });

  it("the default runner is bounded, and a timed-out command fails with a reason", () => {
    expect(Number.isFinite(RUNNER_LIMITS.timeout)).toBe(true);
    const result = defaultRunner(process.execPath, ["-e", "setTimeout(() => {}, 10_000)"], { timeout: 200 });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/ETIMEDOUT|timed out/i);
  });

  it("fails closed when npm audit returns JSON without a report", () => {
    const runner = (file, args) => {
      if (file === "gh" && args[0] === "api") return { status: 0, stdout: "[]" };
      if (file === "gh") return { status: 0, stdout: "[]" };
      return { status: 1, stdout: JSON.stringify({ error: "service unavailable" }), stderr: "audit failed" };
    };
    expect(() => main({ runner, now: NOW })).toThrow(/invalid JSON report/);
  });
});
