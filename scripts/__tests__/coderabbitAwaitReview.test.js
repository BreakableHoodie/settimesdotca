import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  COOLDOWN_SLACK_MS,
  DEFAULT_COOLDOWN_MS,
  MAX_CONSECUTIVE_GH_FAILURES,
  MAX_COOLDOWN_MS,
  SKIP_SETTLE_MS,
  STALE_IN_PROGRESS_MS,
  UNKNOWN_SETTLE_MS,
  CONFIRM_SETTLE_MS,
  awaitReview,
  classifyStatus,
  confirmsCleanReview,
  countBodyFindings,
  ghDeps,
  parseCooldownMs,
} from "../coderabbit-await-review.mjs";

const RATE_LIMITED = { state: "success", description: "Review rate limited" };
const PAUSED = { state: "success", description: "Review paused" };
const COMPLETED = { state: "success", description: "Review completed" };
const IN_PROGRESS = { state: "pending", description: "Review in progress" };
// Seen on #1225 (2026-09-29): a PASSING status on a commit no one reviewed.
const INTERNAL_ERROR = { state: "success", description: "Internal error occurred during review" };
const NEW_WORDING = { state: "success", description: "Some future CodeRabbit wording" };
const RL_COMMENT = "Rate limit exceeded. Please wait **21 minutes and 50 seconds** before requesting another review.";

/**
 * Fake GitHub. `statuses` is consumed one entry per getStatus() call (the last
 * entry repeats), so a test scripts exactly what CodeRabbit reports over time.
 */
function fakeDeps({
  statuses,
  heads = ["aaaaaaaa1"],
  isDraft = false,
  prState = () => "OPEN",
  comment = RL_COMMENT,
  commentAt = "1970-01-01T00:00:00Z",
  busy = () => false,
  findings = () => ({ confirmed: true, outsideDiff: 0, nitpicks: 0, duplicates: 0, other: 0, url: null }),
}) {
  let t = 0;
  let si = 0;
  let hi = 0;
  const calls = { requests: 0, sleeps: [], statusShas: [], findingShas: [], logs: [] };
  return {
    calls,
    getPr: () => {
      const i = hi++;
      return { head: heads[Math.min(i, heads.length - 1)], isDraft, state: prState(i) };
    },
    getStatus: (sha) => {
      calls.statusShas.push(sha);
      const s = statuses[Math.min(si++, statuses.length - 1)];
      if (s instanceof Error) throw s;
      return s;
    },
    getLatestRateLimitComment: () => (comment === null ? null : { body: comment, at: commentAt }),
    reviewInProgressElsewhere: () => busy(),
    getHeadReviewFindings: (sha) => {
      calls.findingShas.push(sha);
      return findings(sha);
    },
    requestReview: () => {
      calls.requests += 1;
    },
    sleep: async (ms) => {
      calls.sleeps.push(ms);
      t += ms;
    },
    now: () => t,
    log: (m) => calls.logs.push(m),
  };
}

describe("classifyStatus: a passing check is not a review", () => {
  it("reads CodeRabbit's PASSING rate-limited status as rate_limited, never reviewed", () => {
    // The whole reason this script exists: the check is green either way.
    expect(classifyStatus(RATE_LIMITED)).toBe("rate_limited");
  });

  it("reads CodeRabbit's PASSING paused status as paused, never reviewed", () => {
    expect(classifyStatus(PAUSED)).toBe("paused");
  });

  it("reads CodeRabbit's PASSING internal-error status as failed, never reviewed (#1226)", () => {
    expect(classifyStatus(INTERNAL_ERROR)).toBe("failed");
  });

  it("reads 'Review completed' as reviewed", () => {
    expect(classifyStatus(COMPLETED)).toBe("reviewed");
  });

  it("reads an unrecognised description as unknown even when the state is success", () => {
    expect(classifyStatus({ state: "success", description: "Something new" })).toBe("unknown");
  });

  it("distinguishes in-progress, skipped, failed and absent", () => {
    expect(classifyStatus(IN_PROGRESS)).toBe("in_progress");
    expect(classifyStatus({ state: "success", description: "Review skipped" })).toBe("skipped");
    expect(classifyStatus({ state: "error", description: "Review failed" })).toBe("failed");
    expect(classifyStatus(null)).toBe("none");
  });
});

describe("parseCooldownMs", () => {
  it("parses minutes and seconds out of the rate-limit comment, plus slack", () => {
    expect(parseCooldownMs(RL_COMMENT)).toBe((21 * 60 + 50) * 1000 + COOLDOWN_SLACK_MS);
  });

  it("returns null when the comment carries no duration", () => {
    expect(parseCooldownMs("Rate limit exceeded.")).toBeNull();
    expect(parseCooldownMs(null)).toBeNull();
  });

  it("caps an absurd wait so a misparse cannot park the monitor for hours", () => {
    expect(parseCooldownMs("Please wait 9 hours before requesting another review.")).toBe(MAX_COOLDOWN_MS);
  });
});

describe("awaitReview", () => {
  it("re-requests after CodeRabbit's internal error, then succeeds on the completed review (#1226)", async () => {
    const deps = fakeDeps({ statuses: [INTERNAL_ERROR, COMPLETED] });
    expect(await awaitReview(deps, { pollMs: 1000 })).toBe(0);
    expect(deps.calls.requests).toBe(1);
  });

  it("waits out an unrecognised status briefly without requesting", async () => {
    const deps = fakeDeps({ statuses: [NEW_WORDING, NEW_WORDING, COMPLETED] });
    expect(await awaitReview(deps, { pollMs: 60_000 })).toBe(0);
    expect(deps.calls.requests).toBe(0);
  });

  it("restarts the unknown clock when the wording changes, so it is not converted on the old deadline", async () => {
    const minutes = Math.ceil(UNKNOWN_SETTLE_MS / 60_000);
    const OTHER_WORDING = { state: "success", description: "Another future CodeRabbit wording" };
    // The first wording runs to just short of the deadline, then a new one
    // appears and the review completes well within ITS settle period.
    const deps = fakeDeps({
      statuses: [...Array(minutes - 1).fill(NEW_WORDING), ...Array(3).fill(OTHER_WORDING), COMPLETED],
    });
    expect(await awaitReview(deps, { pollMs: 60_000 })).toBe(0);
    expect(deps.calls.requests).toBe(0);
  });

  it("treats an unrecognised status unchanged past UNKNOWN_SETTLE_MS as failed and requests once", async () => {
    const polls = Math.ceil(UNKNOWN_SETTLE_MS / 60_000) + 2;
    const deps = fakeDeps({ statuses: [...Array(polls).fill(NEW_WORDING), COMPLETED] });
    expect(await awaitReview(deps, { pollMs: 60_000 })).toBe(0);
    expect(deps.calls.requests).toBe(1);
  });

  it("requests a paused head once, then succeeds on the completed review", async () => {
    const deps = fakeDeps({ statuses: [PAUSED, COMPLETED] });
    expect(await awaitReview(deps, { pollMs: 1000 })).toBe(0);
    expect(deps.calls.requests).toBe(1);
  });

  it("does not re-request a head that stays paused across polls", async () => {
    const deps = fakeDeps({ statuses: [PAUSED, PAUSED, PAUSED] });
    expect(await awaitReview(deps, { pollMs: 1000, timeoutMs: 4000 })).toBe(1);
    expect(deps.calls.requests).toBe(1);
  });

  it("--once reports a paused head as NOT reviewed and never posts a request", async () => {
    const deps = fakeDeps({ statuses: [PAUSED] });
    expect(await awaitReview(deps, { once: true })).toBe(2);
    expect(deps.calls.requests).toBe(0);
  });

  it("gives a moved paused head its own single request", async () => {
    const deps = fakeDeps({
      statuses: [PAUSED, PAUSED, COMPLETED],
      heads: ["old00000", "old00000", "new00000", "new00000", "new00000"],
    });
    expect(await awaitReview(deps, { pollMs: 1000 })).toBe(0);
    expect(deps.calls.requests).toBe(2);
    expect(deps.calls.statusShas).toEqual(["old00000", "new00000", "new00000"]);
  });

  it("waits out a rate limit, re-requests exactly once, then succeeds on the completed review", async () => {
    const deps = fakeDeps({ statuses: [RATE_LIMITED, IN_PROGRESS, COMPLETED] });
    const code = await awaitReview(deps, { pollMs: 1000 });
    expect(code).toBe(0);
    expect(deps.calls.requests).toBe(1);
    // The first sleep is the parsed cooldown, not the poll interval.
    expect(deps.calls.sleeps[0]).toBe(parseCooldownMs(RL_COMMENT));
  });

  it("falls back to the default cooldown when the comment has no duration", async () => {
    const deps = fakeDeps({ statuses: [RATE_LIMITED, COMPLETED], comment: null });
    await awaitReview(deps, { pollMs: 1000 });
    expect(deps.calls.sleeps[0]).toBe(DEFAULT_COOLDOWN_MS);
  });

  it("does not re-request when the head moved during the cooldown, and watches the new head", async () => {
    // getPr: initial read -> old head; after the cooldown -> new head.
    const deps = fakeDeps({ statuses: [RATE_LIMITED, COMPLETED], heads: ["old00000", "new00000"] });
    const code = await awaitReview(deps, { pollMs: 1000 });
    expect(code).toBe(0);
    expect(deps.calls.requests).toBe(0);
    expect(deps.calls.statusShas.at(-1)).toBe("new00000");
  });

  it("gives up with 1 after the re-request budget when every attempt is rate-limited", async () => {
    const deps = fakeDeps({ statuses: [RATE_LIMITED] });
    const code = await awaitReview(deps, { pollMs: 1000, maxRequests: 3 });
    expect(code).toBe(1);
    expect(deps.calls.requests).toBe(3);
  });

  it("--once reports a rate-limited head as NOT reviewed and never posts a request", async () => {
    const deps = fakeDeps({ statuses: [RATE_LIMITED] });
    expect(await awaitReview(deps, { once: true })).toBe(2);
    expect(deps.calls.requests).toBe(0);
  });

  it("returns 3 for a head that STAYS skipped, instead of waiting forever", async () => {
    const deps = fakeDeps({ statuses: [{ state: "success", description: "Review skipped" }] });
    expect(await awaitReview(deps, { pollMs: 60_000 })).toBe(3);
  });

  it("treats a skip as transient: #1200 went skipped -> in progress -> completed", async () => {
    const SKIPPED = { state: "success", description: "Review skipped" };
    const deps = fakeDeps({ statuses: [SKIPPED, IN_PROGRESS, COMPLETED] });
    expect(await awaitReview(deps, { pollMs: 25_000 })).toBe(0);
  });

  it("logs each state change once, so a long wait is visibly alive but not one line per poll", async () => {
    const deps = fakeDeps({ statuses: [IN_PROGRESS, IN_PROGRESS, IN_PROGRESS, COMPLETED] });
    await awaitReview(deps, { pollMs: 1000 });
    const progress = deps.calls.logs.filter((m) => m.includes("in_progress"));
    expect(progress).toHaveLength(1);
  });

  it("does not request while an earlier commit's review is still running, however long it takes", async () => {
    // #1200: the second push had no status for minutes because the first
    // review was still in progress. Requesting then wastes a review.
    let polls = 0;
    const deps = fakeDeps({
      statuses: [null, null, null, null, null, COMPLETED],
      busy: () => ++polls < 5,
    });
    const code = await awaitReview(deps, { pollMs: 60_000, noStatusGraceMs: 90_000 });
    expect(code).toBe(0);
    expect(deps.calls.requests).toBe(0);
  });

  it("does not report success for a head that moved after the status was read", async () => {
    // A push during the post-request sleep: the OLD head reads "Review
    // completed", but the PR's head is now a commit nobody has reviewed.
    const deps = fakeDeps({ statuses: [COMPLETED, IN_PROGRESS, COMPLETED], heads: ["old00000", "new00000"] });
    const code = await awaitReview(deps, { pollMs: 1000 });
    expect(code).toBe(0);
    expect(deps.calls.statusShas).toEqual(["old00000", "new00000", "new00000"]);
  });

  it("gives each new head its own skip settle period (#1200 review)", async () => {
    // Old head skipped for 4 min, then a new head is skipped too. Without a
    // per-head reset the new head inherits the old timer and returns 3 at
    // once; with it, the new head waits and then gets its review.
    const SKIPPED = { state: "success", description: "Review skipped" };
    const deps = fakeDeps({
      statuses: [SKIPPED, SKIPPED, SKIPPED, SKIPPED, SKIPPED, SKIPPED, COMPLETED],
      heads: ["old00000", "old00000", "old00000", "old00000", "old00000", "new00000"],
    });
    expect(await awaitReview(deps, { pollMs: 60_000 })).toBe(0);
    expect(deps.calls.statusShas.at(-1)).toBe("new00000");
  });

  it("refuses a draft PR, which CodeRabbit never reviews automatically", async () => {
    const deps = fakeDeps({ statuses: [COMPLETED], isDraft: true });
    expect(await awaitReview(deps)).toBe(4);
  });

  it("survives a transient gh failure mid-wait instead of exiting 4", async () => {
    const deps = fakeDeps({ statuses: [IN_PROGRESS, new Error("HTTP 502"), IN_PROGRESS, COMPLETED] });
    expect(await awaitReview(deps, { pollMs: 1000 })).toBe(0);
  });

  it("retries a transient gh failure during the initial PR read", async () => {
    const deps = fakeDeps({ statuses: [COMPLETED] });
    const getPr = deps.getPr;
    let failed = false;
    deps.getPr = () => {
      if (!failed) {
        failed = true;
        throw new Error("HTTP 502");
      }
      return getPr();
    };

    expect(await awaitReview(deps, { pollMs: 1000 })).toBe(0);
    expect(deps.calls.logs.filter((m) => m.includes("gh failed (1/")).length).toBe(1);
  });

  it("gives up (throws, so main exits 4) after consecutive gh failures", async () => {
    const deps = fakeDeps({ statuses: [new Error("HTTP 502")] });
    await expect(awaitReview(deps, { pollMs: 1000 })).rejects.toThrow("HTTP 502");
    expect(deps.calls.sleeps).toHaveLength(MAX_CONSECUTIVE_GH_FAILURES - 1);
  });

  it("gives up when a LATER call in the pass keeps failing, even though the status read succeeds", async () => {
    const deps = fakeDeps({ statuses: [IN_PROGRESS] });
    let n = 0;
    deps.getPr = () => {
      if (n++ === 0) return { head: "aaaaaaaa1", isDraft: false, state: "OPEN" };
      throw new Error("HTTP 502");
    };
    await expect(awaitReview(deps, { pollMs: 1000 })).rejects.toThrow("HTTP 502");
  });

  it("--once does not retry a gh failure", async () => {
    const deps = fakeDeps({ statuses: [new Error("HTTP 502")] });
    await expect(awaitReview(deps, { once: true })).rejects.toThrow();
    expect(deps.calls.sleeps).toHaveLength(0);
  });

  it("treats an unrecognised status as rate-limited when a rate-limit comment is at least as new", async () => {
    // The rate-limited description is unobserved here; a different wording
    // must still get the cooldown + re-request, not a silent 3h timeout.
    const NEW_WORDING = { state: "success", description: "Paused", updated_at: "1970-01-01T00:00:00Z" };
    const deps = fakeDeps({ statuses: [NEW_WORDING, COMPLETED], commentAt: "1970-01-01T00:00:05Z" });
    expect(await awaitReview(deps, { pollMs: 1000 })).toBe(0);
    expect(deps.calls.requests).toBe(1);
    expect(deps.calls.sleeps[0]).toBe(parseCooldownMs(RL_COMMENT));
  });

  it("does not read an unrecognised status as rate-limited on the strength of an OLDER comment", async () => {
    const NEW_WORDING = { state: "success", description: "Paused", updated_at: "1970-01-01T00:10:00Z" };
    const deps = fakeDeps({ statuses: [NEW_WORDING, COMPLETED], commentAt: "1970-01-01T00:00:00Z" });
    expect(await awaitReview(deps, { pollMs: 1000 })).toBe(0);
    expect(deps.calls.requests).toBe(0);
  });

  it("re-requests when the head's OWN review has been in progress past the stale limit", async () => {
    const STUCK = { ...IN_PROGRESS, updated_at: "1970-01-01T00:00:00Z" };
    const deps = fakeDeps({ statuses: [STUCK, STUCK, STUCK, IN_PROGRESS, COMPLETED] });
    expect(await awaitReview(deps, { pollMs: STALE_IN_PROGRESS_MS })).toBe(0);
    expect(deps.calls.requests).toBe(1);
  });

  it("stops with 4, posting nothing, when the PR is merged mid-wait", async () => {
    const deps = fakeDeps({ statuses: [RATE_LIMITED], prState: (i) => (i === 0 ? "OPEN" : "MERGED") });
    expect(await awaitReview(deps, { pollMs: 1000 })).toBe(4);
    expect(deps.calls.requests).toBe(0);
  });

  it("reports 4, not 1, when the PR closed during the post-request sleep and the budget is then spent", async () => {
    // The sleep after posting a request is not followed by refreshPr(), so
    // only the give-up path can notice the PR is gone.
    let reads = 0;
    const deps = fakeDeps({ statuses: [RATE_LIMITED], prState: () => (++reads > 2 ? "CLOSED" : "OPEN") });
    expect(await awaitReview(deps, { pollMs: 1000, maxRequests: 1 })).toBe(4);
    expect(deps.calls.requests).toBe(1);
  });

  it("follows a head that moved during the post-request sleep instead of failing on the budget", async () => {
    // getPr: initial, before the request (old head), then at the budget exit
    // the head has moved. The new head gets CodeRabbit's automatic review.
    const deps = fakeDeps({
      statuses: [RATE_LIMITED, RATE_LIMITED, COMPLETED],
      heads: ["old00000", "old00000", "new00000"],
    });
    expect(await awaitReview(deps, { pollMs: 1000, maxRequests: 1 })).toBe(0);
    expect(deps.calls.requests).toBe(1);
    expect(deps.calls.statusShas.at(-1)).toBe("new00000");
  });

  it("resets the request budget when a budget exit switches to a new head", async () => {
    const deps = fakeDeps({
      statuses: [RATE_LIMITED, RATE_LIMITED, RATE_LIMITED, COMPLETED],
      heads: ["old00000", "old00000", "new00000", "new00000"],
    });
    expect(await awaitReview(deps, { pollMs: 1000, maxRequests: 1 })).toBe(0);
    expect(deps.calls.requests).toBe(2);
    expect(deps.calls.statusShas.at(-1)).toBe("new00000");
  });

  it("rechecks a settled skip before returning when the head moved", async () => {
    const SKIPPED = { state: "success", description: "Review skipped" };
    const deps = fakeDeps({
      statuses: [SKIPPED, SKIPPED, COMPLETED],
      heads: ["old00000", "old00000", "new00000"],
    });
    expect(await awaitReview(deps, { pollMs: SKIP_SETTLE_MS })).toBe(0);
    expect(deps.calls.statusShas.at(-1)).toBe("new00000");
  });

  it("rechecks a settled skip before returning when the PR closed", async () => {
    const SKIPPED = { state: "success", description: "Review skipped" };
    const deps = fakeDeps({
      statuses: [SKIPPED, SKIPPED],
      prState: (i) => (i > 1 ? "CLOSED" : "OPEN"),
    });
    expect(await awaitReview(deps, { pollMs: SKIP_SETTLE_MS })).toBe(4);
  });

  it("gives up with a reason, not silently, when no status appears and the budget is spent", async () => {
    const deps = fakeDeps({ statuses: [null] });
    expect(await awaitReview(deps, { pollMs: 60_000, noStatusGraceMs: 90_000, maxRequests: 1 })).toBe(1);
    expect(deps.calls.requests).toBe(1);
    expect(deps.calls.logs.at(-1)).toMatch(/budget/);
  });

  it("requests a review when no CodeRabbit status appears within the grace period", async () => {
    const deps = fakeDeps({ statuses: [null, null, null, COMPLETED] });
    const code = await awaitReview(deps, { pollMs: 60_000, noStatusGraceMs: 90_000 });
    expect(code).toBe(0);
    expect(deps.calls.requests).toBe(1);
  });
});

// Shapes copied from real CodeRabbit review bodies on this repo: #1362's final
// review (two outside-diff findings and a nitpick, all body-only) and #1364's.
const BODY_1362 = [
  "> [!CAUTION]",
  "> Some comments are outside the diff and can\u2019t be posted inline due to GitHub limitations.",
  "> **\u26a0\ufe0f Outside diff range comments (2)**",
  "<summary>\ud83e\uddf9 Nitpick comments: 1</summary><blockquote>",
].join("\n");
const BODY_1364 = "<summary>\ud83e\uddf9 Nitpick comments: 1</summary><blockquote>";
const FOUND = {
  confirmed: true,
  outsideDiff: 2,
  nitpicks: 1,
  duplicates: 0,
  other: 0,
  url: "https://github.com/o/r/pull/1#pullrequestreview-1",
};

describe("countBodyFindings: findings no thread query can see (#1365)", () => {
  it("counts #1362's outside-diff and nitpick findings", () => {
    expect(countBodyFindings(BODY_1362)).toEqual({ outsideDiff: 2, nitpicks: 1, duplicates: 0, other: 0 });
  });

  it("counts a nitpick-only body (#1364)", () => {
    expect(countBodyFindings(BODY_1364)).toEqual({ outsideDiff: 0, nitpicks: 1, duplicates: 0, other: 0 });
  });

  it("accepts both '(N)' and ': N' for every section", () => {
    expect(countBodyFindings("Nitpick comments (3) / Outside diff range comments: 4 / Duplicate comments (1)")).toEqual(
      { outsideDiff: 4, nitpicks: 3, duplicates: 1, other: 0 },
    );
  });

  // Fail closed: a section wording CodeRabbit adds later must stop the merge,
  // not parse as zero (the CLI review's "Minor comments (N)" is one candidate).
  it("counts an unrecognised section as 'other' rather than zero", () => {
    expect(countBodyFindings("\ud83d\udfe1 Minor comments (1)")).toEqual({
      outsideDiff: 0,
      nitpicks: 0,
      duplicates: 0,
      other: 1,
    });
  });

  it("does not read prose about comments as a section", () => {
    expect(countBodyFindings("Some comments are outside the diff and can't be posted inline.")).toEqual({
      outsideDiff: 0,
      nitpicks: 0,
      duplicates: 0,
      other: 0,
    });
  });

  it("reads a clean or empty body as zero, and ignores the inline 'actionable' count", () => {
    expect(countBodyFindings("Actionable comments posted: 2")).toEqual({
      outsideDiff: 0,
      nitpicks: 0,
      duplicates: 0,
      other: 0,
    });
    expect(countBodyFindings(null)).toEqual({ outsideDiff: 0, nitpicks: 0, duplicates: 0, other: 0 });
  });
});

describe("awaitReview: reviewed is not clean (#1365)", () => {
  it("exits 5, naming the counts and the review, when the head review has body-only findings", async () => {
    const deps = fakeDeps({ statuses: [COMPLETED], findings: () => FOUND });
    expect(await awaitReview(deps, { pollMs: 1000 })).toBe(5);
    expect(deps.calls.logs.at(-1)).toMatch(/2 outside-diff, 1 nitpick/);
    expect(deps.calls.logs.at(-1)).toContain(FOUND.url);
  });

  it("exits 5 on findings in an unrecognised section", async () => {
    const deps = fakeDeps({
      statuses: [COMPLETED],
      findings: () => ({ confirmed: true, outsideDiff: 0, nitpicks: 0, duplicates: 0, other: 1, url: null }),
    });
    expect(await awaitReview(deps, { pollMs: 1000 })).toBe(5);
    expect(deps.calls.logs.at(-1)).toMatch(/1 in an unrecognised section/);
  });

  it("--once also refuses a reviewed head with findings", async () => {
    const deps = fakeDeps({ statuses: [COMPLETED], findings: () => FOUND });
    expect(await awaitReview(deps, { once: true })).toBe(5);
  });

  it("--allow-findings accepts them once declined, and says so", async () => {
    const deps = fakeDeps({ statuses: [COMPLETED], findings: () => FOUND });
    expect(await awaitReview(deps, { pollMs: 1000, allowFindings: true })).toBe(0);
    expect(deps.calls.logs.at(-1)).toMatch(/3 body finding\(s\) allowed/);
  });

  it("exits 0 on a clean review", async () => {
    const deps = fakeDeps({ statuses: [COMPLETED] });
    expect(await awaitReview(deps, { pollMs: 1000 })).toBe(0);
  });

  it("judges the CURRENT head's review, not the one before a push", async () => {
    // The first status read is of the old head; the review that counts is the
    // new head's, which is clean even though the old head's had findings.
    const deps = fakeDeps({
      statuses: [IN_PROGRESS, COMPLETED],
      heads: ["aaaaaaaa1", "bbbbbbbb2"],
      findings: (sha) =>
        sha === "aaaaaaaa1"
          ? FOUND
          : { confirmed: true, outsideDiff: 0, nitpicks: 0, duplicates: 0, other: 0, url: null },
    });
    expect(await awaitReview(deps, { pollMs: 1000 })).toBe(0);
    expect(deps.calls.findingShas).toEqual(["bbbbbbbb2"]);
  });
});

// #1367 review: a completed status with no review object is only clean when
// CodeRabbit's summary comment confirms it FOR THIS SHA.
const HEAD = "3e7522c8c7de4bf0b12b35e682ed03f9cc89ef55";
const CLEAN_1364 =
  "No actionable comments were generated in the recent review.\n" +
  "Reviewing files that changed from the base of the PR and between " +
  `2e95c3336de5f2611d6702264c6c29cc0e590226 and ${HEAD}.`;
const UNCONFIRMED = { confirmed: false, outsideDiff: 0, nitpicks: 0, duplicates: 0, other: 0, url: null };

describe("confirmsCleanReview", () => {
  it("accepts #1364's clean summary for the commit it names as reviewed up to", () => {
    expect(confirmsCleanReview(CLEAN_1364, HEAD)).toBe(true);
  });

  it("rejects the same summary for any other commit, including the range's base", () => {
    expect(confirmsCleanReview(CLEAN_1364, "2e95c3336de5f2611d6702264c6c29cc0e590226")).toBe(false);
    expect(confirmsCleanReview(CLEAN_1364, "ffffffffffffffffffffffffffffffffffffffff")).toBe(false);
  });

  it("rejects a comment naming the head that does not say the review was clean", () => {
    expect(confirmsCleanReview(`Reviewing files ... between abc and ${HEAD}.`, HEAD)).toBe(false);
  });
});

describe("awaitReview: an absent review object needs confirmation", () => {
  it("waits while unconfirmed, then succeeds once the confirmation lands", async () => {
    let n = 0;
    const deps = fakeDeps({
      statuses: [COMPLETED],
      findings: () => (n++ < 2 ? UNCONFIRMED : { ...UNCONFIRMED, confirmed: true }),
    });
    expect(await awaitReview(deps, { pollMs: 60_000 })).toBe(0);
    expect(deps.calls.findingShas).toHaveLength(3);
  });

  it("--once reports an unconfirmed head as NOT reviewed", async () => {
    const deps = fakeDeps({ statuses: [COMPLETED], findings: () => UNCONFIRMED });
    expect(await awaitReview(deps, { once: true })).toBe(2);
  });

  it("gives up with a reason, not success, when confirmation never comes", async () => {
    const deps = fakeDeps({ statuses: [COMPLETED], findings: () => UNCONFIRMED });
    expect(await awaitReview(deps, { pollMs: 60_000 })).toBe(1);
    expect(deps.calls.logs.at(-1)).toMatch(/no review object or clean-review comment/);
    // Bounded by the settle period, not the three-hour overall timeout.
    expect(deps.calls.sleeps.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(CONFIRM_SETTLE_MS);
  });
});

// The REAL getHeadReviewFindings, through a fake `gh` first on PATH (#1367
// review). The fakeDeps tests above replace this dep wholesale, so its head
// and author filters, ghList's page joining, and the no-review-object path
// would otherwise run only against live GitHub.
describe("ghDeps.getHeadReviewFindings against a stubbed gh", () => {
  const HEAD_SHA = "3e7522c8c7de4bf0b12b35e682ed03f9cc89ef55";
  const OLD_SHA = "2e95c3336de5f2611d6702264c6c29cc0e590226";
  const BOT = { login: "coderabbitai[bot]" };
  let dir;
  let savedPath;

  // `fixtures` maps a REST path, placeholders unexpanded as ghList sends it,
  // to that endpoint's items. The fake prints them as ONE page, the shape
  // `gh api --paginate --slurp` returns, and logs every argv it receives.
  function stubGh(fixtures) {
    writeFileSync(join(dir, "fixtures.json"), JSON.stringify(fixtures));
    const fake = join(dir, "gh");
    writeFileSync(
      fake,
      `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(join(dir, "calls.log"))}, JSON.stringify(args) + "\\n");
const fixtures = JSON.parse(fs.readFileSync(${JSON.stringify(join(dir, "fixtures.json"))}, "utf8"));
process.stdout.write(JSON.stringify([fixtures[args[1]] ?? []]));
`,
    );
    chmodSync(fake, 0o755);
  }

  const calls = () =>
    readFileSync(join(dir, "calls.log"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "await-review-gh-"));
    savedPath = process.env.PATH;
    process.env.PATH = `${dir}:${savedPath}`;
  });

  afterEach(() => {
    process.env.PATH = savedPath;
    rmSync(dir, { recursive: true, force: true });
  });

  it("counts body findings only from CodeRabbit's reviews OF THE HEAD", () => {
    stubGh({
      "repos/{owner}/{repo}/pulls/7/reviews": [
        { user: BOT, commit_id: OLD_SHA, body: "Outside diff range comments (5)", html_url: "u-old" },
        { user: { login: "someone" }, commit_id: HEAD_SHA, body: "Nitpick comments: 9", html_url: "u-human" },
        { user: BOT, commit_id: HEAD_SHA, body: BODY_1362, html_url: "u-head" },
      ],
    });
    expect(ghDeps(7).getHeadReviewFindings(HEAD_SHA)).toEqual({
      confirmed: true,
      outsideDiff: 2,
      nitpicks: 1,
      duplicates: 0,
      other: 0,
      url: "u-head",
    });
    // Read through the paginated, slurped list, never a single page.
    expect(calls()[0]).toEqual(["api", "repos/{owner}/{repo}/pulls/7/reviews", "--paginate", "--slurp"]);
  });

  it("confirms a head with no review object through the summary comment that names it", () => {
    stubGh({
      "repos/{owner}/{repo}/pulls/7/reviews": [],
      "repos/{owner}/{repo}/issues/7/comments": [{ user: BOT, body: CLEAN_1364 }],
    });
    expect(ghDeps(7).getHeadReviewFindings(HEAD_SHA)).toMatchObject({ confirmed: true, nitpicks: 0, url: null });
  });

  it("leaves a head unconfirmed when the clean summary names another commit, or is not CodeRabbit's", () => {
    stubGh({
      "repos/{owner}/{repo}/pulls/7/reviews": [],
      "repos/{owner}/{repo}/issues/7/comments": [
        { user: BOT, body: CLEAN_1364.replace(HEAD_SHA, "f".repeat(40)) },
        { user: { login: "someone" }, body: CLEAN_1364 },
      ],
    });
    expect(ghDeps(7).getHeadReviewFindings(HEAD_SHA).confirmed).toBe(false);
  });
});
