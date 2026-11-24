import { describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import { fileURLToPath } from "node:url";

const WORKFLOW = fileURLToPath(new URL("../../.github/workflows/site-health.yml", import.meta.url));
const source = readFileSync(WORKFLOW, "utf8");

describe("production site health workflow", () => {
  it("runs the read-only probes hourly and supports manual dispatch", () => {
    expect(source).toMatch(/on:\n {2}schedule:\n {4}- cron: "17 \* \* \* \*"\n {2}workflow_dispatch:/);
    expect(source).toContain('node scripts/smoke-probes.mjs "$SMOKE_URL"');
    expect(source).toContain("CF_PRODUCTION_SMOKE_URL || 'https://settimes.ca'");
    expect(source).not.toContain("/s/");
    expect(source).not.toContain("/api/metrics");
  });

  it("grants issue writes only to the reporting job", () => {
    expect(source).toContain("permissions:\n  contents: read");
    expect(source).toContain("permissions:\n      contents: read\n      issues: write");
    expect(source.slice(0, source.indexOf("jobs:"))).not.toContain("issues: write");
  });

  it("opens or updates the fixed failure issue and closes it on recovery", () => {
    expect(source).toContain('issue_title="Site down: production smoke probes failing"');
    expect(source).toContain('gh issue list --repo "$REPOSITORY" --state open --search "\\"$issue_title\\" in:title"');
    expect(source).toContain('gh issue comment "$issue_number" --repo "$REPOSITORY" --body "$body"');
    expect(source).toContain('gh issue create --repo "$REPOSITORY" --title "$issue_title" --label "bug,priority:p1"');
    expect(source).toContain("Recovered: production smoke probes passed.");
    expect(source).toContain('gh issue close "$issue_number" --repo "$REPOSITORY" --reason completed');
    expect(source).not.toContain("|| true");
  });
});

// Runs the real "Report probe status" script against a stub gh, because a
// text scan cannot tell "closes on recovery" from "closes whenever probes did
// not fail" (a skipped probe step once looked like a recovery).
describe("site health reporting, executed", () => {
  const step = loadYaml(source).jobs["smoke-probes"].steps.find((s) => s.name === "Report probe status");

  function report(outcome, openIssue) {
    const dir = mkdtempSync(path.join(tmpdir(), "site-health-"));
    try {
      const log = path.join(dir, "gh.log");
      const gh = path.join(dir, "gh");
      writeFileSync(
        gh,
        `#!/usr/bin/env bash\necho "$*" | tr "\\n" " " >> "${log}"\necho >> "${log}"\nif [ "$1 $2" = "issue list" ]; then echo "$OPEN_ISSUE"; fi\n`,
      );
      chmodSync(gh, 0o755);
      writeFileSync(path.join(dir, "smoke-probes.log"), "FAIL sitemap: expected HTTP 200, got 503\n");
      const result = spawnSync("bash", ["-e", "-c", step.run], {
        env: {
          PATH: `${dir}:${process.env.PATH}`,
          RUNNER_TEMP: dir,
          REPOSITORY: "o/r",
          RUN_URL: "https://example.test/run/1",
          PROBE_OUTCOME: outcome,
          OPEN_ISSUE: openIssue,
        },
        encoding: "utf8",
      });
      let calls = [];
      try {
        calls = readFileSync(log, "utf8").trim().split("\n");
      } catch {
        // gh was never called
      }
      return { status: result.status, writes: calls.filter((c) => !c.startsWith("issue list")) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("opens one issue on failure and fails the job", () => {
    const r = report("failure", "");
    expect(r.status).toBe(1);
    expect(r.writes).toHaveLength(1);
    expect(r.writes[0]).toMatch(/^issue create .*Site down: production smoke probes failing/);
    expect(r.writes[0]).toContain("got 503");
  });

  it("comments on the open issue on a repeat failure, never a second issue", () => {
    const r = report("failure", "42");
    expect(r.status).toBe(1);
    expect(r.writes.some((w) => w.startsWith("issue comment 42"))).toBe(true);
    expect(r.writes.some((w) => w.startsWith("issue create"))).toBe(false);
  });

  it("closes the open issue on a real recovery", () => {
    const r = report("success", "42");
    expect(r.status).toBe(0);
    expect(r.writes.some((w) => w.startsWith("issue comment 42"))).toBe(true);
    expect(r.writes.some((w) => w.startsWith("issue close 42"))).toBe(true);
    expect(r.writes.join("\n")).not.toContain("\\n");
  });

  it("does nothing on success with no open issue", () => {
    expect(report("success", "")).toEqual({ status: 0, writes: [] });
  });

  it.each(["skipped", "cancelled", ""])("never treats a probe step that did not run (%j) as a recovery", (outcome) => {
    const r = report(outcome, "42");
    expect(r.status).toBe(1);
    expect(r.writes).toEqual([]);
  });
});
