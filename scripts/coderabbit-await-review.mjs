#!/usr/bin/env node
/**
 * coderabbit-await-review — wait until CodeRabbit has actually reviewed a PR's
 * CURRENT head commit, re-requesting the review after a rate-limit cooldown.
 *
 * Why this exists
 * ---------------
 * Usage-based CodeRabbit billing was switched off on 2026-09-24, so a push past
 * the hourly allowance is RATE-LIMITED instead of billed. CodeRabbit then posts
 * a comment and a PASSING status ("Review rate limited") — passing by design,
 * so it never blocks a merge — and does not re-run when capacity returns
 * (docs.coderabbit.ai/management/rate-limits). A PR in that state is green
 * everywhere while its head commit has never been reviewed.
 *
 * So "is the CodeRabbit check green?" is the wrong question: it is green either
 * way. The only signal that means "a review ran on this commit" is the
 * `CodeRabbit` commit status on the head SHA reading "Review completed".
 * A review OBJECT is not usable either: across 32 merged PRs checked on
 * 2026-09-24, 13 had a completed review with no review object on the head
 * (a clean review posts only the summary comment).
 *
 * Usage
 * -----
 *   node scripts/coderabbit-await-review.mjs <pr-number>          # wait, re-request, wait
 *   node scripts/coderabbit-await-review.mjs <pr-number> --once   # classify now, never act
 *   make await-review PR=<n>
 *
 * Exit codes:
 *   0  the current head commit has a completed CodeRabbit review
 *   1  gave up: timeout or the re-request budget ran out (reason printed)
 *   2  --once: the head is NOT reviewed yet (state printed)
 *   3  CodeRabbit skipped the head (e.g. every file path-filtered) — no review
 *      will come; a human decides whether that is acceptable
 *   4  usage error, draft PR, or `gh` failure
 */
import { execFileSync } from "node:child_process";

export const DEFAULT_COOLDOWN_MS = 10 * 60_000;
// Slack added to a parsed wait: CodeRabbit's figure is when capacity frees up,
// and a request landing a few seconds early is rate-limited all over again.
export const COOLDOWN_SLACK_MS = 60_000;
export const MAX_COOLDOWN_MS = 65 * 60_000;

/**
 * Map the latest `CodeRabbit` commit status on a SHA to a state.
 * Descriptions seen on this repo: "Review in progress", "Review completed".
 * "Review rate limited" is from CodeRabbit's docs, not yet observed here —
 * hence the loose /rate.?limit/ match rather than an exact string.
 */
export function classifyStatus(status) {
  if (!status) return "none";
  const d = String(status.description || "");
  if (/rate.?limit/i.test(d)) return "rate_limited";
  if (/review completed/i.test(d)) return "reviewed";
  if (/skip/i.test(d)) return "skipped";
  if (status.state === "error" || status.state === "failure") return "failed";
  if (status.state === "pending" || /in progress/i.test(d)) return "in_progress";
  // An unrecognised description must never read as reviewed.
  return "unknown";
}

/**
 * Pull a wait time out of a CodeRabbit rate-limit comment, e.g.
 * "Please wait **21 minutes and 50 seconds** before requesting another review."
 * Returns milliseconds INCLUDING slack, or null when no duration is found.
 */
export function parseCooldownMs(text) {
  if (!text) return null;
  const sentence = String(text)
    .replace(/\*/g, "")
    .split(/(?<=[.!\n])/)
    .find((s) => /\bwait\b/i.test(s) && /\d+\s*(hour|minute|second)/i.test(s));
  if (!sentence) return null;
  let ms = 0;
  for (const [, n, unit] of sentence.matchAll(/(\d+)\s*(hours?|minutes?|seconds?)/gi)) {
    const u = unit.toLowerCase();
    ms += Number(n) * (u.startsWith("hour") ? 3_600_000 : u.startsWith("minute") ? 60_000 : 1000);
  }
  return Math.min(ms + COOLDOWN_SLACK_MS, MAX_COOLDOWN_MS);
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Real GitHub access through `gh`. Tests inject fakes with the same shape. */
export function ghDeps(pr) {
  return {
    getPr() {
      const j = JSON.parse(gh(["pr", "view", String(pr), "--json", "headRefOid,isDraft,state"]));
      return { head: j.headRefOid, isDraft: j.isDraft, state: j.state };
    },
    getStatus(sha) {
      // Newest first; the first CodeRabbit entry is the current one.
      const list = JSON.parse(gh(["api", `repos/{owner}/{repo}/commits/${sha}/statuses`, "--paginate"]));
      return list.find((s) => s.context === "CodeRabbit") || null;
    },
    getLatestRateLimitComment() {
      const out = gh([
        "api",
        `repos/{owner}/{repo}/issues/${pr}/comments`,
        "--paginate",
        "-q",
        '[.[] | select(.user.login=="coderabbitai[bot]") | select(.body|test("rate.?limit";"i")) | .body] | last // ""',
      ]);
      return out.trim() || null;
    },
    requestReview() {
      gh(["pr", "comment", String(pr), "--body", "@coderabbitai review"]);
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    log: (msg) => process.stderr.write(`[await-review #${pr}] ${msg}\n`),
  };
}

/**
 * The monitor. Returns an exit code. Polls the head's CodeRabbit status;
 * on a rate limit it waits out the cooldown, posts one `@coderabbitai review`,
 * and keeps watching. A new head commit resets everything, because a review of
 * the old head says nothing about the new one.
 */
export async function awaitReview(deps, opts = {}) {
  const {
    once = false,
    pollMs = 60_000,
    timeoutMs = 3 * 3_600_000,
    maxRequests = 6,
    noStatusGraceMs = 10 * 60_000,
  } = opts;
  const start = deps.now();
  let pr = deps.getPr();
  if (pr.state !== "OPEN") {
    deps.log(`PR is ${pr.state}; nothing to wait for.`);
    return 4;
  }
  if (pr.isDraft) {
    deps.log("PR is a draft (CodeRabbit skips drafts). Run `gh pr ready` first.");
    return 4;
  }

  let head = pr.head;
  let requests = 0;
  let headSeenAt = deps.now();
  let lastReported = "";

  for (;;) {
    const status = deps.getStatus(head);
    const state = classifyStatus(status);
    const short = head.slice(0, 8);
    // Report each state change once, so a long wait is visibly alive rather
    // than indistinguishable from a hang, without a line per poll.
    const report = `${short}:${state}`;
    if (!once && report !== lastReported) {
      deps.log(`head ${short}: ${state}${status ? ` ("${status.description}")` : ""}`);
      lastReported = report;
    }

    if (state === "reviewed") {
      deps.log(`head ${short} reviewed ("${status.description}").`);
      return 0;
    }
    if (state === "skipped") {
      deps.log(`head ${short} was SKIPPED by CodeRabbit ("${status.description}"). No review will come.`);
      return 3;
    }
    if (once) {
      deps.log(`head ${short} is NOT reviewed: ${state}${status ? ` ("${status.description}")` : ""}.`);
      return 2;
    }
    if (deps.now() - start > timeoutMs) {
      deps.log(`timed out; head ${short} still ${state}.`);
      return 1;
    }

    if (state === "rate_limited" || state === "failed") {
      if (requests >= maxRequests) {
        deps.log(`re-requested ${requests} times and head ${short} is still ${state}; giving up.`);
        return 1;
      }
      const wait =
        (state === "rate_limited" && parseCooldownMs(deps.getLatestRateLimitComment())) || DEFAULT_COOLDOWN_MS;
      deps.log(`head ${short} ${state}; waiting ${Math.round(wait / 60_000)} min for the cooldown.`);
      await deps.sleep(wait);
      // The author may have pushed during the wait; a review request then
      // targets the new head, which CodeRabbit is already reviewing on its own.
      pr = deps.getPr();
      if (pr.head !== head) {
        deps.log(`head moved ${short} -> ${pr.head.slice(0, 8)} during the wait; watching the new head.`);
        head = pr.head;
        headSeenAt = deps.now();
        continue;
      }
      deps.requestReview();
      requests += 1;
      deps.log(`posted @coderabbitai review (${requests}/${maxRequests}).`);
      // Give CodeRabbit time to replace the rate-limited status before re-reading
      // it; otherwise the old status triggers a second request at once.
      await deps.sleep(Math.max(pollMs, 2 * 60_000));
      continue;
    }

    if (state === "none" && deps.now() - headSeenAt > noStatusGraceMs) {
      deps.log(
        `no CodeRabbit status on ${short} after ${Math.round(noStatusGraceMs / 60_000)} min; requesting a review.`,
      );
      if (requests >= maxRequests) return 1;
      deps.requestReview();
      requests += 1;
      headSeenAt = deps.now();
    } else if (state === "unknown") {
      deps.log(`unrecognised CodeRabbit status "${status.description}" on ${short}; still waiting.`);
    }

    await deps.sleep(pollMs);
    pr = deps.getPr();
    if (pr.head !== head) {
      deps.log(`head moved ${short} -> ${pr.head.slice(0, 8)}; watching the new head.`);
      head = pr.head;
      headSeenAt = deps.now();
    }
  }
}

export async function main(argv) {
  const pr = argv.find((a) => /^\d+$/.test(a));
  if (!pr) {
    process.stderr.write("usage: coderabbit-await-review.mjs <pr-number> [--once]\n");
    return 4;
  }
  try {
    return await awaitReview(ghDeps(pr), { once: argv.includes("--once") });
  } catch (err) {
    process.stderr.write(`[await-review #${pr}] gh failed: ${err.stderr || err.message}\n`);
    return 4;
  }
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("coderabbit-await-review.mjs");
if (invokedDirectly) {
  process.exitCode = await main(process.argv.slice(2));
}
