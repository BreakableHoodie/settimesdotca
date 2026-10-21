import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  rmSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Runs the REAL .githooks/pre-push against a fake `gh`. The draft lookup may
 * only ever remove a push from the count on an explicit "true"; every way it
 * can fail must still count the push. Those failure paths are the point of
 * these tests (CLAUDE.md "Verify guards against the failure they guard").
 */
const HOOK = resolve(__dirname, "../../.githooks/pre-push");
// Read from the hook so a change to the allowance is a one-line edit there.
const LIMIT = Number(/^LIMIT=(\d+)$/m.exec(readFileSync(HOOK, "utf8"))?.[1]);
const SHA = "a".repeat(40);
const ZERO = "0".repeat(40);
// Everything the hook runs that is not a shell builtin. PATH is built from
// these alone, so a real `gh` in /usr/bin (standard on Ubuntu runners) can
// never answer a test that means "gh is not installed".
const TOOLS = ["awk", "cat", "cut", "date", "dirname", "head", "mkdir", "mktemp", "mv", "rm", "sleep", "tr", "wc"];

let dir;
let bin;
let tmp;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "prepush-"));
  bin = join(dir, "bin");
  tmp = join(dir, "tmp");
  mkdirSync(bin);
  mkdirSync(tmp);
  mkdirSync(join(dir, "tools"));
  for (const t of TOOLS) {
    const found = spawnSync("/bin/sh", ["-c", `command -v ${t}`], { encoding: "utf8" }).stdout.trim();
    if (!found) throw new Error(`test setup: ${t} not found on this host`);
    symlinkSync(found, join(dir, "tools", t));
  }
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function fakeGh(body) {
  const p = join(bin, "gh");
  writeFileSync(p, `#!/bin/sh\n${body}\n`);
  chmodSync(p, 0o755);
}

function logLines() {
  const p = join(dir, "coderabbit", "push-log");
  return existsSync(p) ? readFileSync(p, "utf8").split("\n").filter(Boolean) : [];
}

function seed(n) {
  mkdirSync(join(dir, "coderabbit"), { recursive: true });
  const now = Math.floor(Date.now() / 1000);
  writeFileSync(join(dir, "coderabbit", "push-log"), Array.from({ length: n }, () => `${now} other\n`).join(""));
}

// A gh that ANSWERS gets a budget far beyond any load spike: under a busy
// machine, spawning the stub alone once took over the old 1 s budget, the hook
// correctly counted the push, and the "draft" case failed on timing (#1358).
// Only the hang cases need a short budget, so they ask for one.
const ANSWER_BUDGET_SECONDS = "30";
const HANG_BUDGET_SECONDS = "1";

function push({ branch = "feat", lookupSeconds = ANSWER_BUDGET_SECONDS } = {}) {
  const t0 = Date.now();
  // HOOK_SHELL=dash reproduces Ubuntu CI, whose /bin/sh is dash, from a Mac.
  const r = spawnSync(process.env.HOOK_SHELL || "/bin/sh", [HOOK, "origin", "git@example:x.git"], {
    input: `refs/heads/${branch} ${SHA} refs/heads/${branch} ${ZERO}\n`,
    encoding: "utf8",
    // A broken watchdog leaves a stub that never exits; vitest cannot interrupt
    // a synchronous spawn, so without this a regression HANGS the suite instead
    // of failing it. Well past every budget the cases use.
    timeout: 45000,
    killSignal: "SIGKILL",
    // Only the fake bin and the TOOLS symlinks: "no gh" is the fake bin
    // being empty, whatever the host has installed.
    env: {
      PATH: `${bin}:${join(dir, "tools")}`,
      HOME: dir,
      XDG_CACHE_HOME: dir,
      TMPDIR: tmp,
      CODERABBIT_DRAFT_LOOKUP_SECONDS: lookupSeconds,
    },
  });
  return { status: r.status, stderr: r.stderr, ms: Date.now() - t0 };
}

describe("pre-push draft lookup", () => {
  it("does not count a push to a draft PR, and says so", () => {
    fakeGh("echo true");
    const r = push();
    expect(r.status).toBe(0);
    expect(logLines()).toHaveLength(0);
    expect(r.stderr).toMatch(/draft PR -- not counted/);
  });

  it("counts the push when gh prints true but then FAILS", () => {
    fakeGh("echo true; exit 1");
    expect(push().status).toBe(0);
    expect(logLines()).toHaveLength(1);
  });

  it("counts a push to a ready PR", () => {
    fakeGh("echo false");
    expect(push().status).toBe(0);
    expect(logLines()).toHaveLength(1);
  });

  it("counts the push when gh is not installed", () => {
    expect(push().status).toBe(0);
    expect(logLines()).toHaveLength(1);
  });

  it("counts the push, and does not block it, when gh errors (e.g. no PR yet)", () => {
    fakeGh("echo 'no pull requests found' >&2; exit 1");
    expect(push().status).toBe(0);
    expect(logLines()).toHaveLength(1);
  });

  it("cleans up its temp file when gh fails", () => {
    fakeGh("exit 1");
    push();
    expect(readdirSync(tmp)).toEqual([]);
  });

  it("counts the push when gh hangs, and gives up within the bound", () => {
    fakeGh("sleep 30; echo true");
    const r = push({ lookupSeconds: HANG_BUDGET_SECONDS });
    expect(r.status).toBe(0);
    expect(logLines()).toHaveLength(1);
    expect(r.ms).toBeLessThan(5000);
  });

  it("still gives up on a gh that IGNORES SIGTERM", () => {
    fakeGh("trap '' TERM; sleep 30; echo true");
    const r = push({ lookupSeconds: HANG_BUDGET_SECONDS });
    expect(logLines()).toHaveLength(1);
    expect(r.ms).toBeLessThan(6000);
  });

  it("returns promptly when gh answers fast: the watchdog must not hold the hook open", () => {
    fakeGh("echo true");
    // With a 30 s budget, a watchdog that held the hook open would take 30 s,
    // so a loose bound still separates the two and tolerates a busy machine.
    expect(push().ms).toBeLessThan(10000);
  });

  it("still counts an answer that arrives after the budget (the timeout path is live)", () => {
    // The same late "true" that #1358's flake produced, now on purpose: it must
    // count the push. Guards against the fix above hiding the timeout path.
    // The stub answers "true" only WHEN the watchdog kills it, so no scheduler
    // delay can let it answer in time (a plain `sleep 2; echo true` could). Never
    // killed, it gives a successful late "true" after 30 s, which is what a
    // broken watchdog would wrongly accept, so that break fails here rather
    // than hanging, and the stub cannot outlive the test.
    fakeGh("trap 'echo true; exit 1' TERM; i=0; while [ $i -lt 300 ]; do sleep 0.1; i=$((i + 1)); done; echo true");
    const r = push({ lookupSeconds: HANG_BUDGET_SECONDS });
    expect(logLines()).toHaveLength(1);
    expect(r.stderr).not.toMatch(/not counted/);
  });

  it("reads a numeric LIMIT from the hook", () => {
    expect(Number.isInteger(LIMIT) && LIMIT > 0).toBe(true);
  });

  it("lets a draft push through at the limit, and still blocks a ready one", () => {
    seed(LIMIT);
    fakeGh("echo true");
    expect(push().status).toBe(0);
    fakeGh("echo false");
    expect(push().status).toBe(1);
  });
});
