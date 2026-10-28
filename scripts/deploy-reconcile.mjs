#!/usr/bin/env node
/**
 * deploy-reconcile — run edge E2E before dispatching the production deploy for
 * a main commit with no deploy run.
 *
 * Why this exists
 * ---------------
 * Dependabot auto-merges use GITHUB_TOKEN, and GitHub deliberately does not
 * start push-triggered workflows for those pushes. That leaves main merged
 * without the Cloudflare Pages deploy, D1 migration, or smoke checks. The
 * scheduled reconciler can use the same token to dispatch the workflows, while
 * the grace period avoids racing human-triggered workflows. Failed deploys and
 * edge runs are reported for human attention and are never retried automatically.
 */
import { execFileSync } from "node:child_process";

export const GRACE_MS = 10 * 60_000;
const REAL_FAILURES = new Set(["failure", "timed_out", "startup_failure"]);

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function realDeps(repository) {
  return {
    getHead() {
      const response = JSON.parse(gh(["api", `repos/${repository}/commits/main`]));
      const activity = JSON.parse(gh(["api", `repos/${repository}/activity?ref=refs/heads/main&per_page=10`]));
      return {
        sha: response.sha,
        updatedAt: headUpdatedAt(response.sha, response.commit.committer.date, activity),
      };
    },
    getRuns(headSha) {
      const response = JSON.parse(
        gh([
          "api",
          `repos/${repository}/actions/workflows/cloudflare-pages.yml/runs?branch=main&head_sha=${headSha}&per_page=50`,
        ]),
      );
      return response.workflow_runs;
    },
    getEdgeRuns(headSha) {
      const response = JSON.parse(
        gh([
          "api",
          `repos/${repository}/actions/workflows/edge-e2e.yml/runs?branch=main&head_sha=${headSha}&per_page=50`,
        ]),
      );
      return response.workflow_runs;
    },
    dispatch() {
      gh(["workflow", "run", "cloudflare-pages.yml", "--repo", repository, "--ref", "main"]);
    },
    dispatchEdge() {
      gh(["workflow", "run", "edge-e2e.yml", "--repo", repository, "--ref", "main"]);
    },
    log(message) {
      process.stderr.write(`[deploy-reconcile] ${message}\n`);
    },
  };
}

/**
 * When main moved to `sha`: the later of the commit date and the push that put
 * it on main. The commit date alone is wrong when main is moved to an existing,
 * older commit -- the grace would already be spent, and a dispatch could cancel
 * that push's own deploy (cancel-in-progress). Falls back to the commit date
 * when the activity feed has no entry for this sha.
 */
export function headUpdatedAt(sha, committedAt, activity = []) {
  const pushed = activity.find((entry) => entry.after === sha)?.timestamp;
  if (!pushed) return committedAt;
  return Date.parse(pushed) > Date.parse(committedAt) ? pushed : committedAt;
}

function latestRun(runs) {
  return [...runs].sort((left, right) => {
    if (left.run_number != null && right.run_number != null) return right.run_number - left.run_number;
    return Date.parse(right.created_at || 0) - Date.parse(left.created_at || 0);
  })[0];
}

export function decide({ headSha, headUpdatedAt: updatedAt, now, runs, edgeRuns = [], graceMs = GRACE_MS }) {
  const relevantRuns = runs.filter((run) => run.event !== "pull_request" && run.head_sha === headSha);

  if (relevantRuns.some((run) => run.status !== "completed")) {
    return { action: "skip", reason: "deploy in flight" };
  }

  if (relevantRuns.some((run) => run.conclusion === "success")) {
    return { action: "skip", reason: "deployed" };
  }

  const failedRun = relevantRuns.find((run) => REAL_FAILURES.has(run.conclusion));
  if (failedRun) {
    return { action: "warn", reason: `deploy failed: ${failedRun.html_url}` };
  }

  if (now - Date.parse(updatedAt) < graceMs) {
    return { action: "skip", reason: "too new; its own push deploy may not have started" };
  }

  const relevantEdgeRuns = edgeRuns.filter(
    (run) => run.head_sha === headSha && ["workflow_dispatch", "push"].includes(run.event),
  );
  if (relevantEdgeRuns.some((run) => run.status !== "completed")) {
    return { action: "skip", reason: "edge suite in flight" };
  }

  const latestEdgeRun = latestRun(relevantEdgeRuns.filter((run) => run.conclusion !== "cancelled"));
  if (!latestEdgeRun) {
    return { action: "dispatch-edge", reason: "no edge E2E run for main HEAD" };
  }
  if (latestEdgeRun.conclusion === "success") {
    return { action: "dispatch", reason: "edge suite passed; no deploy run for main HEAD" };
  }
  if (REAL_FAILURES.has(latestEdgeRun.conclusion)) {
    return { action: "warn", reason: `edge suite failed: ${latestEdgeRun.html_url}` };
  }

  return { action: "dispatch-edge", reason: "no completed edge E2E run for main HEAD" };
}

export function main(argv, deps) {
  const repository = process.env.GITHUB_REPOSITORY || "BreakableHoodie/settimesdotca";
  const dryRun = argv.includes("--dry-run");
  const runtime = deps || realDeps(repository);

  try {
    const head = runtime.getHead();
    const runs = runtime.getRuns(head.sha);
    const edgeRuns = runtime.getEdgeRuns(head.sha);
    const decision = decide({ headSha: head.sha, headUpdatedAt: head.updatedAt, now: Date.now(), runs, edgeRuns });
    runtime.log(`${decision.action}: ${decision.reason}`);

    if (["dispatch", "dispatch-edge"].includes(decision.action) && !dryRun) {
      // `--ref main` deploys whatever main is NOW. If main moved since the
      // decision, the new commit's own push deploy may be running, and a
      // dispatch would cancel it (cancel-in-progress). Leave it to the next run.
      const current = runtime.getHead().sha;
      if (current !== head.sha) {
        runtime.log(`skip: main moved ${head.sha.slice(0, 8)} -> ${current.slice(0, 8)} before dispatch`);
        return 0;
      }
      if (decision.action === "dispatch-edge") {
        runtime.dispatchEdge();
        runtime.log("dispatched edge-e2e.yml for main");
      } else {
        runtime.dispatch();
        runtime.log("dispatched cloudflare-pages.yml for main");
      }
    }
    if (decision.action === "warn") {
      process.stderr.write(`::warning::${decision.reason}\n`);
    }
    return 0;
  } catch (err) {
    process.stderr.write(`[deploy-reconcile] gh failed: ${err.stderr || err.message}\n`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("deploy-reconcile.mjs");
if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
