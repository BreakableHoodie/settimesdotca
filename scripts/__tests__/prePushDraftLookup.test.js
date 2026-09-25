import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
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
const SHA = "a".repeat(40);
const ZERO = "0".repeat(40);

let dir;
let bin;
let tmp;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "prepush-"));
  bin = join(dir, "bin");
  tmp = join(dir, "tmp");
  mkdirSync(bin);
  mkdirSync(tmp);
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

function push(branch = "feat") {
  const t0 = Date.now();
  // HOOK_SHELL=dash reproduces Ubuntu CI, whose /bin/sh is dash, from a Mac.
  const r = spawnSync(process.env.HOOK_SHELL || "sh", [HOOK, "origin", "git@example:x.git"], {
    input: `refs/heads/${branch} ${SHA} refs/heads/${branch} ${ZERO}\n`,
    encoding: "utf8",
    // /usr/bin:/bin carries the POSIX tools but no real gh, so "no gh" is
    // simply the fake bin being empty.
    env: {
      PATH: `${bin}:/usr/bin:/bin`,
      HOME: dir,
      XDG_CACHE_HOME: dir,
      TMPDIR: tmp,
      CODERABBIT_DRAFT_LOOKUP_SECONDS: "1",
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
    const r = push();
    expect(r.status).toBe(0);
    expect(logLines()).toHaveLength(1);
    expect(r.ms).toBeLessThan(5000);
  });

  it("still gives up on a gh that IGNORES SIGTERM", () => {
    fakeGh("trap '' TERM; sleep 30; echo true");
    const r = push();
    expect(logLines()).toHaveLength(1);
    expect(r.ms).toBeLessThan(6000);
  });

  it("returns promptly when gh answers fast: the watchdog must not hold the hook open", () => {
    fakeGh("echo true");
    expect(push().ms).toBeLessThan(900);
  });

  it("lets a draft push through at the limit, and still blocks a ready one", () => {
    seed(2); // LIMIT=2
    fakeGh("echo true");
    expect(push().status).toBe(0);
    fakeGh("echo false");
    expect(push().status).toBe(1);
  });
});
