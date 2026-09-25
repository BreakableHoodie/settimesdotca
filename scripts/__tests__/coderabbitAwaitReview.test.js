import { describe, it, expect } from "vitest";
import {
  COOLDOWN_SLACK_MS,
  DEFAULT_COOLDOWN_MS,
  MAX_COOLDOWN_MS,
  awaitReview,
  classifyStatus,
  parseCooldownMs,
} from "../coderabbit-await-review.mjs";

const RATE_LIMITED = { state: "success", description: "Review rate limited" };
const COMPLETED = { state: "success", description: "Review completed" };
const IN_PROGRESS = { state: "pending", description: "Review in progress" };
const RL_COMMENT = "Rate limit exceeded. Please wait **21 minutes and 50 seconds** before requesting another review.";

/**
 * Fake GitHub. `statuses` is consumed one entry per getStatus() call (the last
 * entry repeats), so a test scripts exactly what CodeRabbit reports over time.
 */
function fakeDeps({ statuses, heads = ["aaaaaaaa1"], isDraft = false, comment = RL_COMMENT, busy = () => false }) {
  let t = 0;
  let si = 0;
  let hi = 0;
  const calls = { requests: 0, sleeps: [], statusShas: [], logs: [] };
  return {
    calls,
    getPr: () => ({ head: heads[Math.min(hi++, heads.length - 1)], isDraft, state: "OPEN" }),
    getStatus: (sha) => {
      calls.statusShas.push(sha);
      return statuses[Math.min(si++, statuses.length - 1)];
    },
    getLatestRateLimitComment: () => comment,
    reviewInProgressElsewhere: () => busy(),
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

  it("requests a review when no CodeRabbit status appears within the grace period", async () => {
    const deps = fakeDeps({ statuses: [null, null, null, COMPLETED] });
    const code = await awaitReview(deps, { pollMs: 60_000, noStatusGraceMs: 90_000 });
    expect(code).toBe(0);
    expect(deps.calls.requests).toBe(1);
  });
});
