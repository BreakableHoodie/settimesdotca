import { describe, expect, it } from "vitest";
import { decide, GRACE_MS, headUpdatedAt, main } from "../deploy-reconcile.mjs";

const HEAD = "head-sha";
const OLD_COMMIT = "2026-01-01T00:00:00Z";
const NOW = Date.parse(OLD_COMMIT) + GRACE_MS + 1;

function run(overrides = {}) {
  return {
    event: "schedule",
    status: "completed",
    conclusion: "cancelled",
    head_sha: HEAD,
    html_url: "https://github.com/BreakableHoodie/settimesdotca/actions/runs/1",
    ...overrides,
  };
}

function choose(runs, overrides = {}) {
  return decide({ headSha: HEAD, headUpdatedAt: OLD_COMMIT, now: NOW, runs, ...overrides });
}

describe("decide", () => {
  it("dispatches with no runs and an old commit", () => {
    expect(choose([])).toEqual({ action: "dispatch", reason: "no deploy run for main HEAD" });
  });

  it("dispatches when only cancelled runs remain", () => {
    expect(choose([run()]).action).toBe("dispatch");
  });

  it("ignores pull request runs", () => {
    expect(choose([run({ event: "pull_request" })]).action).toBe("dispatch");
  });

  it("ignores runs for a different sha", () => {
    expect(choose([run({ head_sha: "other-sha" })]).action).toBe("dispatch");
  });

  it.each(["in_progress", "queued"])("skips a %s run", (status) => {
    expect(choose([run({ status })])).toEqual({ action: "skip", reason: "deploy in flight" });
  });

  it("skips after a successful deploy", () => {
    expect(choose([run({ conclusion: "success" })])).toEqual({ action: "skip", reason: "deployed" });
  });

  it("skips when success appears alongside a cancelled run", () => {
    expect(choose([run(), run({ conclusion: "success", html_url: "success-url" })]).action).toBe("skip");
  });

  it.each(["failure", "timed_out", "startup_failure"])("warns on a %s deploy", (conclusion) => {
    const result = choose([run({ conclusion })]);
    expect(result.action).toBe("warn");
    expect(result.reason).toContain("https://github.com/BreakableHoodie/settimesdotca/actions/runs/1");
  });

  it("skips when the commit is younger than the grace period", () => {
    expect(choose([], { now: Date.parse(OLD_COMMIT) + GRACE_MS - 1 })).toEqual({
      action: "skip",
      reason: "too new; its own push deploy may not have started",
    });
  });

  it("warns rather than dispatching after an old commit's failure", () => {
    expect(choose([run({ conclusion: "failure" })]).action).toBe("warn");
  });
});

describe("headUpdatedAt", () => {
  const PUSHED = "2026-09-28T19:28:20Z";

  it("uses the push time when main moved to an OLD commit", () => {
    // The commit is weeks old, but main only reached it now: the grace period
    // must run from the push, or a dispatch could cancel that push's deploy.
    expect(headUpdatedAt(HEAD, OLD_COMMIT, [{ after: HEAD, timestamp: PUSHED }])).toBe(PUSHED);
  });

  it("keeps the commit date when it is the later of the two", () => {
    expect(headUpdatedAt(HEAD, PUSHED, [{ after: HEAD, timestamp: OLD_COMMIT }])).toBe(PUSHED);
  });

  it("falls back to the commit date when no activity entry matches the sha", () => {
    expect(headUpdatedAt(HEAD, OLD_COMMIT, [{ after: "other-sha", timestamp: PUSHED }])).toBe(OLD_COMMIT);
    expect(headUpdatedAt(HEAD, OLD_COMMIT, [])).toBe(OLD_COMMIT);
  });

  it("an old commit pushed moments ago is inside the grace period", () => {
    const now = Date.parse(PUSHED) + 60_000;
    const updatedAt = headUpdatedAt(HEAD, OLD_COMMIT, [{ after: HEAD, timestamp: PUSHED }]);
    expect(decide({ headSha: HEAD, headUpdatedAt: updatedAt, now, runs: [] }).action).toBe("skip");
  });
});

describe("main", () => {
  it("dispatches through injected dependencies", () => {
    const calls = [];
    const code = main([], {
      getHead: () => ({ sha: HEAD, updatedAt: OLD_COMMIT }),
      getRuns: () => [],
      dispatch: () => calls.push("dispatch"),
      log: (message) => calls.push(message),
    });
    expect(code).toBe(0);
    expect(calls).toContain("dispatch");
  });

  it("--dry-run decides but never dispatches", () => {
    const calls = [];
    const code = main(["--dry-run"], {
      getHead: () => ({ sha: HEAD, updatedAt: OLD_COMMIT }),
      getRuns: () => [],
      dispatch: () => calls.push("dispatch"),
      log: (message) => calls.push(message),
    });
    expect(code).toBe(0);
    expect(calls).toContain("dispatch: no deploy run for main HEAD");
    expect(calls).not.toContain("dispatch");
  });

  // The failure path: a gh error must turn the scheduled run red, and must
  // never fall through to a dispatch decided on missing data.
  it("returns 1 and does not dispatch when gh fails", () => {
    const calls = [];
    const stderr = process.stderr.write;
    process.stderr.write = () => true;
    try {
      const code = main([], {
        getHead: () => ({ sha: HEAD, updatedAt: OLD_COMMIT }),
        getRuns: () => {
          throw Object.assign(new Error("HTTP 502"), { stderr: "HTTP 502" });
        },
        dispatch: () => calls.push("dispatch"),
        log: (message) => calls.push(message),
      });
      expect(code).toBe(1);
      expect(calls).not.toContain("dispatch");
    } finally {
      process.stderr.write = stderr;
    }
  });
});
