import { describe, expect, it } from "vitest";
import {
  ACCEPTED_NPM_AUDIT,
  buildDigest,
  collectSecurityData,
  defaultRunner,
  main,
  RUNNER_LIMITS,
} from "../security-digest.mjs";

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
  it("does not open for npm audit advisories that are all on the accepted list", () => {
    const digest = buildDigest({
      now: NOW,
      analyses: HEALTHY_SCANNERS,
      npmAudit: [
        {
          lockfile: "frontend/package-lock.json",
          packages: [
            { name: "@lhci/cli", severity: "high" },
            { name: "proxy-addr", severity: "critical" },
          ],
          critical: 1,
          high: 1,
        },
      ],
    });
    expect(digest.problems).toEqual([]);
    expect(digest.shouldOpen).toBe(false);
    expect(digest.body).toContain("critical 1");
  });

  it("opens for an npm audit advisory that is not on the accepted list, and names it", () => {
    const digest = buildDigest({
      now: NOW,
      npmAudit: [
        {
          lockfile: "frontend/package-lock.json",
          packages: [
            { name: "@lhci/cli", severity: "high" },
            { name: "undici", severity: "high" },
          ],
          high: 2,
        },
      ],
    });
    expect(digest.shouldOpen).toBe(true);
    expect(digest.problems.join("\n")).toContain("undici (high)");
    expect(digest.problems.join("\n")).not.toContain("@lhci/cli");
  });

  it("an accepted entry only covers its own lockfile", () => {
    const digest = buildDigest({
      now: NOW,
      npmAudit: [{ lockfile: "package-lock.json", packages: [{ name: "@lhci/cli", severity: "high" }], high: 1 }],
    });
    expect(digest.shouldOpen).toBe(true);
  });

  it("lists accepted entries that are no longer flagged, so the list can shrink", () => {
    const digest = buildDigest({
      now: NOW,
      analyses: HEALTHY_SCANNERS,
      npmAudit: [{ lockfile: "frontend/package-lock.json", packages: [], critical: 0 }],
    });
    expect(Object.keys(ACCEPTED_NPM_AUDIT).length).toBeGreaterThan(0);
    expect(digest.body).toContain("`frontend/package-lock.json|@lhci/cli`");
    expect(digest.shouldOpen).toBe(false);
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
    expect(calls.filter(([file]) => file === "npm")).toHaveLength(2);
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
