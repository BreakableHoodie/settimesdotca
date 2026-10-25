import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import {
  breakLockIfStale,
  e2eTotpCode,
  markTotpStepSpent,
  msUntilNextTotpStep,
  nextE2eTotpCode,
  removeLockIfOwned,
  withFileLock,
} from "../e2e-totp.mjs";

// The server accepts each TOTP step once (#1333), so E2E must never present a
// step twice. It offers the current and next step only (see e2e-totp.mjs).
describe("nextE2eTotpCode", () => {
  const PASSWORD = "e2e-test-placeholder-fresh-step";
  const STEP = 30_000;
  const now = 1_900_000_000_000;
  const current = Math.floor(now / STEP);

  it("hands out the current then the next step once each, then null until the next window", async () => {
    const first = await nextE2eTotpCode(PASSWORD, now);
    const second = await nextE2eTotpCode(PASSWORD, now);
    expect([first.step, second.step]).toEqual([current, current + 1]);
    expect(first.code).toBe(await e2eTotpCode(PASSWORD, current * STEP));
    expect(await nextE2eTotpCode(PASSWORD, now)).toBeNull();

    // One window later, current+1 is now the current step and already spent.
    expect((await nextE2eTotpCode(PASSWORD, now + STEP)).step).toBe(current + 2);
  });

  it("skips a step another worker reported spent", async () => {
    const base = now + 100 * STEP;
    const at = Math.floor(base / STEP);
    markTotpStepSpent(at);
    expect((await nextE2eTotpCode(PASSWORD, base)).step).toBe(at + 1);
  });

  it("waits just past the next step boundary", () => {
    expect(msUntilNextTotpStep(current * STEP + 29_000)).toBe(1_250);
  });
});

// #1366: parallel workers, and the fresh process a retry starts, each kept
// their own `lastStep` and presented steps another process had spent. The
// server counts a reuse as a failure, and five lock the admin out. Real
// processes, because the bug was that memory is not shared between them.
describe("nextE2eTotpCode across processes (ledgerPath)", () => {
  const MODULE = fileURLToPath(new URL("../e2e-totp.mjs", import.meta.url));
  const run = promisify(execFile);
  const child = (ledgerPath, nowMs) =>
    run(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const { nextE2eTotpCode } = await import(${JSON.stringify(MODULE)});
       const next = await nextE2eTotpCode("e2e-test-placeholder-ledger", ${nowMs}, { ledgerPath: ${JSON.stringify(ledgerPath)} });
       process.stdout.write(JSON.stringify(next && next.step));`,
      ],
      // Bounded below the test's own 30 s: a lock regression must kill the
      // child, not leave it waiting after the test has failed.
      { timeout: 20_000, maxBuffer: 64 * 1024 },
    ).then(({ stdout }) => JSON.parse(stdout));

  it("never hands the same step to two processes asking at once", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "totp-ledger-"));
    const ledgerPath = path.join(dir, "ledger.json");
    const nowMs = 1_900_000_000_000;
    const current = Math.floor(nowMs / 30_000);

    const steps = await Promise.all(Array.from({ length: 6 }, () => child(ledgerPath, nowMs)));

    // Two steps exist in the window; exactly two processes get one each.
    expect(steps.filter((s) => s !== null).sort()).toEqual([current, current + 1]);
    expect(steps.filter((s) => s === null)).toHaveLength(4);
    expect(fs.existsSync(`${ledgerPath}.lock`)).toBe(false);
  }, 30_000);

  it("a later process (a retry) starts from the ledger, not from scratch", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "totp-ledger-"));
    const ledgerPath = path.join(dir, "ledger.json");
    const nowMs = 1_900_000_000_000;
    const current = Math.floor(nowMs / 30_000);

    expect(await child(ledgerPath, nowMs)).toBe(current);
    expect(await child(ledgerPath, nowMs)).toBe(current + 1);
    expect(await child(ledgerPath, nowMs)).toBeNull();
  }, 30_000);

  it("breaks a lock left by a killed holder instead of hanging", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "totp-ledger-"));
    const ledgerPath = path.join(dir, "ledger.json");
    fs.writeFileSync(`${ledgerPath}.lock`, "12345");
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(`${ledgerPath}.lock`, old, old);

    const nowMs = 1_900_000_000_000;
    expect(await child(ledgerPath, nowMs)).toBe(Math.floor(nowMs / 30_000));
  }, 30_000);
});

// The lock is only ever removed after checking whose it is (CodeRabbit, #1366).
describe("withFileLock ownership", () => {
  const tmpLock = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "totp-lock-")), "x.lock");
  const aged = (file) => {
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(file, old, old);
  };

  it("a second stale-breaker puts back the fresh lock the first one just took", () => {
    const lock = tmpLock();
    fs.writeFileSync(lock, "dead-holder");
    aged(lock);
    // Both breakers saw "dead-holder". The first removes it; a worker takes it.
    expect(breakLockIfStale(lock, 10_000)).toBe(true);
    fs.writeFileSync(lock, "fresh-holder", { flag: "wx" });
    aged(lock); // looks old to the second breaker's stat, but it is not what it saw
    // The second breaker acts on what it observed earlier: it must not remove it.
    expect(removeLockIfOwned(lock, "dead-holder")).toBe(false);
    expect(fs.readFileSync(lock, "utf8")).toBe("fresh-holder");
    expect(fs.readdirSync(path.dirname(lock))).toEqual(["x.lock"]);
  });

  it("never breaks a live lock retaken right after the age check", () => {
    const lock = tmpLock();
    fs.writeFileSync(lock, "dead-holder");
    aged(lock);
    // Another breaker removes the dead lock and a worker takes a fresh one in
    // the instant after OUR age check returns: the window the old
    // stat-then-read order lost the live lock in.
    const realStat = fs.statSync.bind(fs);
    const spy = vi.spyOn(fs, "statSync").mockImplementation((...args) => {
      const result = realStat(...args);
      spy.mockRestore();
      fs.rmSync(lock);
      fs.writeFileSync(lock, "fresh-holder", { flag: "wx" });
      return result;
    });
    breakLockIfStale(lock, 10_000);
    expect(fs.readFileSync(lock, "utf8")).toBe("fresh-holder");
  });

  it("does not break a lock younger than its stale age", () => {
    const lock = tmpLock();
    fs.writeFileSync(lock, "live-holder");
    expect(breakLockIfStale(lock, 10_000)).toBe(false);
    expect(fs.readFileSync(lock, "utf8")).toBe("live-holder");
  });

  it("a holder whose lock was broken and retaken does not delete the new holder's lock on release", async () => {
    const lock = tmpLock();
    await withFileLock(lock, () => {
      // While we ran, our lock was judged stale and someone else took it.
      fs.rmSync(lock);
      fs.writeFileSync(lock, "someone-else");
    });
    expect(fs.readFileSync(lock, "utf8")).toBe("someone-else");
  });

  it("releases its own lock", async () => {
    const lock = tmpLock();
    await withFileLock(lock, () => expect(fs.existsSync(lock)).toBe(true));
    expect(fs.existsSync(lock)).toBe(false);
  });
});
