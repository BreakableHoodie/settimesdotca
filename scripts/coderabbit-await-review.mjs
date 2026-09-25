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
// A review superseded by a newer push never finishes: its commit keeps
// "Review in progress" forever (#1200's first commit still did hours later).
// Past this age an in-progress status is treated as abandoned, not running.
export const STALE_IN_PROGRESS_MS = 20 * 60_000;
// "Review skipped" is NOT final: on #1200 the head read skipped, then in
// progress 25 s later, then completed. Only a skip that persists this long is
// taken as CodeRabbit's answer.
export const SKIP_SETTLE_MS = 5 * 60_000;
// `gh` failures in a row before giving up. A single blip (a 502, a secondary
// rate limit) must not end a wait that may already be hours old.
export const MAX_CONSECUTIVE_GH_FAILURES = 5;

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

/**
 * Every page of a REST list, as one flat array. `--paginate` alone joins pages
 * as `[...][...]`, which JSON.parse rejects, and a `-q` filter runs once PER
 * PAGE -- so `last` would pick the last match of each page, not overall.
 */
function ghList(path) {
  return JSON.parse(gh(["api", path, "--paginate", "--slurp"])).flat();
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
      return ghList(`repos/{owner}/{repo}/commits/${sha}/statuses`).find((s) => s.context === "CodeRabbit") || null;
    },
    getLatestRateLimitComment() {
      // Oldest first, so the newest rate-limit comment is the last match.
      const hits = ghList(`repos/{owner}/{repo}/issues/${pr}/comments`).filter(
        (c) => c.user?.login === "coderabbitai[bot]" && /rate.?limit/i.test(c.body || ""),
      );
      const last = hits.at(-1);
      return last ? { body: last.body || "", at: last.updated_at } : null;
    },
    reviewInProgressElsewhere(head) {
      // A review still running on an EARLIER commit means the head's review is
      // queued behind it, not lost. Seen on #1200: the second push had no
      // status at all for minutes while the first review was still running.
      const shas = JSON.parse(gh(["pr", "view", String(pr), "--json", "commits", "-q", "[.commits[].oid]"]))
        .filter((s) => s !== head)
        .slice(-5);
      return shas.some((sha) => {
        const cr = ghList(`repos/{owner}/{repo}/commits/${sha}/statuses`).find((s) => s.context === "CodeRabbit");
        return classifyStatus(cr) === "in_progress" && Date.now() - Date.parse(cr.updated_at) < STALE_IN_PROGRESS_MS;
      });
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
    noStatusGraceMs = 30 * 60_000,
  } = opts;
  const start = deps.now();
  let pr;
  // Every PR re-read goes through here, so a PR merged, closed or drafted
  // mid-wait stops the monitor instead of it posting review requests on it.
  const refreshPr = () => {
    pr = deps.getPr();
    if (pr.state !== "OPEN") {
      deps.log(`PR is ${pr.state}; nothing to wait for.`);
      return 4;
    }
    if (pr.isDraft) {
      deps.log("PR is a draft (CodeRabbit skips drafts). Run `gh pr ready` first.");
      return 4;
    }
    return null;
  };
  const initial = refreshPr();
  if (initial !== null) return initial;

  let head = pr.head;
  let requests = 0;
  let headSeenAt = deps.now();
  let skippedSince = null;
  // Every piece of PER-HEAD state resets here and only here. The three
  // head-change paths each once reset it by hand, and one forgot the skip
  // timer (#1200 review), letting an old head's skip time shorten the new
  // head's settle period. Add new per-head state to this function.
  const switchHead = (newHead) => {
    head = newHead;
    headSeenAt = deps.now();
    skippedSince = null;
  };
  let lastReported = "";
  let ghFailures = 0;

  for (;;) {
    try {
      const code = await step();
      if (code !== undefined) return code;
    } catch (err) {
      ghFailures += 1;
      // --once is a quick read: retrying would turn it into a five-minute one.
      if (once || ghFailures >= MAX_CONSECUTIVE_GH_FAILURES) throw err;
      deps.log(`gh failed (${ghFailures}/${MAX_CONSECUTIVE_GH_FAILURES}): ${String(err.stderr || err.message).trim()}`);
      await deps.sleep(pollMs);
    }
  }

  /** One poll. Returns an exit code to stop, or undefined to poll again. */
  async function step() {
    const status = deps.getStatus(head);
    ghFailures = 0;
    let state = classifyStatus(status);
    if (state === "in_progress" && deps.now() - Date.parse(status.updated_at) > STALE_IN_PROGRESS_MS) {
      // The head's own review hung. Waiting on it only runs out the timeout.
      state = "stalled";
    } else if (state === "unknown") {
      // The rate-limited description has never been observed here. If a
      // rate-limit comment is at least as new as this status, trust it.
      const c = deps.getLatestRateLimitComment();
      if (c && Date.parse(c.at) >= Date.parse(status.updated_at)) state = "rate_limited";
    }
    const short = head.slice(0, 8);
    // Report each state change once, so a long wait is visibly alive rather
    // than indistinguishable from a hang, without a line per poll.
    const report = `${short}:${state}`;
    if (!once && report !== lastReported) {
      deps.log(`head ${short}: ${state}${status ? ` ("${status.description}")` : ""}`);
      lastReported = report;
    }

    if (state === "reviewed") {
      // A push during the last sleep leaves `head` stale: this review is of a
      // commit that is no longer the PR's head, so it proves nothing.
      const gone = refreshPr();
      if (gone !== null) return gone;
      if (pr.head !== head) {
        deps.log(`head moved ${short} -> ${pr.head.slice(0, 8)} before it could count; watching the new head.`);
        switchHead(pr.head);
        return undefined;
      }
      deps.log(`head ${short} reviewed ("${status.description}").`);
      return 0;
    }
    if (state === "skipped") {
      skippedSince ??= deps.now();
      if (once || deps.now() - skippedSince >= SKIP_SETTLE_MS) {
        deps.log(`head ${short} was SKIPPED by CodeRabbit ("${status.description}"). No review will come.`);
        return 3;
      }
    } else {
      skippedSince = null;
    }
    if (once) {
      deps.log(`head ${short} is NOT reviewed: ${state}${status ? ` ("${status.description}")` : ""}.`);
      return 2;
    }
    if (deps.now() - start > timeoutMs) {
      deps.log(`timed out; head ${short} still ${state}.`);
      return 1;
    }

    if (state === "rate_limited" || state === "failed" || state === "stalled") {
      if (requests >= maxRequests) {
        deps.log(`re-requested ${requests} times and head ${short} is still ${state}; giving up.`);
        return 1;
      }
      const wait =
        (state === "rate_limited" && parseCooldownMs(deps.getLatestRateLimitComment()?.body)) || DEFAULT_COOLDOWN_MS;
      deps.log(`head ${short} ${state}; waiting ${Math.round(wait / 60_000)} min for the cooldown.`);
      await deps.sleep(wait);
      // The author may have pushed during the wait; a review request then
      // targets the new head, which CodeRabbit is already reviewing on its own.
      const gone = refreshPr();
      if (gone !== null) return gone;
      if (pr.head !== head) {
        deps.log(`head moved ${short} -> ${pr.head.slice(0, 8)} during the wait; watching the new head.`);
        switchHead(pr.head);
        return undefined;
      }
      // Counted BEFORE the call: a request that posts and then throws must
      // still spend budget, or a flaky `gh` could exceed maxRequests.
      requests += 1;
      deps.requestReview();
      deps.log(`posted @coderabbitai review (${requests}/${maxRequests}).`);
      // Give CodeRabbit time to replace the rate-limited status before re-reading
      // it; otherwise the old status triggers a second request at once.
      await deps.sleep(Math.max(pollMs, 2 * 60_000));
      return undefined;
    }

    if (state === "none" && deps.reviewInProgressElsewhere(head)) {
      // Queued behind an earlier review: the grace clock only starts once
      // nothing else is running, or a slow review costs a wasted request.
      headSeenAt = deps.now();
    } else if (state === "none" && deps.now() - headSeenAt > noStatusGraceMs) {
      if (requests >= maxRequests) {
        deps.log(`no CodeRabbit status on ${short} and the re-request budget (${maxRequests}) is spent; giving up.`);
        return 1;
      }
      deps.log(
        `no CodeRabbit status on ${short} after ${Math.round(noStatusGraceMs / 60_000)} min; requesting a review.`,
      );
      requests += 1;
      deps.requestReview();
      headSeenAt = deps.now();
    } else if (state === "unknown") {
      deps.log(`unrecognised CodeRabbit status "${status.description}" on ${short}; still waiting.`);
    }

    await deps.sleep(pollMs);
    const gone = refreshPr();
    if (gone !== null) return gone;
    if (pr.head !== head) {
      deps.log(`head moved ${short} -> ${pr.head.slice(0, 8)}; watching the new head.`);
      switchHead(pr.head);
    }
    return undefined;
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
