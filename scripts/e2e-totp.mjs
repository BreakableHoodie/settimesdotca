import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { base32Encode, generateTotpCode } from "../functions/utils/totp.js";

// The E2E admin is enrolled in 2FA like every real admin (#1253): admins and
// editors without it reach only the enrolment screen, so an unenrolled test
// account would exercise none of the admin surface.
//
// Its TOTP secret is DERIVED from E2E_ADMIN_PASSWORD rather than stored as a
// second secret or committed as a constant. The seeder and the browser tests
// both already hold the password, so they agree on the secret with no new CI
// secret to provision, and the second factor is never public. The derivation
// label is versioned so it can change without colliding with old seeds.
const DERIVATION_LABEL = "settimes-e2e-totp-v1";

export async function deriveE2eTotpSecret(password) {
  if (!password) throw new Error("E2E_ADMIN_PASSWORD is required to derive the E2E TOTP secret");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(DERIVATION_LABEL));
  return base32Encode(new Uint8Array(mac).slice(0, 20));
}

export async function e2eTotpCode(password, timeMs = Date.now()) {
  return generateTotpCode(await deriveE2eTotpSecret(password), timeMs);
}

// The server accepts each TOTP time-step once per user (#1333). Every E2E code
// goes through here, so two logins (or a login and a step-up) in the same 30 s
// never present the same step. Only the current and next step are offered:
// now-1 is valid too, but a code made for it in a step's last moments can fall
// outside the window by the time the server checks it, and a retry would then
// hide that refusal. `lastStep` is per process; `markTotpStepSpent` records a
// step another process spent.
//
// Per process is not enough (#1366): parallel Playwright workers, and the fresh
// process a retry starts, each began at -Infinity and presented a step another
// process had already spent. The server counts that reuse as a failed attempt,
// five failures in ten minutes lock the admin out (429), and every later login
// in the run failed. Pass `ledgerPath` and the spent step is shared through a
// file, read and written under a lock, by every process in the run.
const STEP_MS = 30_000;
let lastStep = -Infinity;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Cross-process mutual exclusion through an exclusive-create lock file. Also
// used by the E2E login helper, whose section (a whole 2FA login) is far
// longer than this ledger's, hence the per-caller stale age.
//
// Ownership is checked, never assumed. Each holder writes a unique token, and
// the lock is only ever removed by renaming it aside and reading what moved: a
// plain stat-then-delete let two workers that both saw an aged lock delete the
// FRESH lock one of them had just taken, and both entered (CodeRabbit, #1366).
export async function withFileLock(lockPath, fn, { staleMs = 10_000 } = {}) {
  const token = `${process.pid}-${crypto.randomUUID()}`;
  for (;;) {
    try {
      fs.writeFileSync(lockPath, token, { flag: "wx" });
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      breakLockIfStale(lockPath, staleMs);
      await sleep(20);
    }
  }
  try {
    return await fn();
  } finally {
    removeLockIfOwned(lockPath, token);
  }
}

// Moves the lock aside atomically and keeps it gone only if it is `expected`;
// anything else is somebody's live lock and goes back. `link` refuses to
// overwrite, so a lock created in the meantime is never clobbered.
function removeLockIf(lockPath, expected) {
  const aside = `${lockPath}.${crypto.randomUUID()}.aside`;
  try {
    fs.renameSync(lockPath, aside);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  const moved = fs.readFileSync(aside, "utf8");
  if (moved !== expected) {
    try {
      fs.linkSync(aside, lockPath);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  fs.rmSync(aside, { force: true });
  return moved === expected;
}

export function removeLockIfOwned(lockPath, token) {
  return removeLockIf(lockPath, token);
}

// A holder killed mid-section must not wedge the run; `staleMs` must be well
// above the longest section a live holder can take.
export function breakLockIfStale(lockPath, staleMs) {
  let observed;
  try {
    // Read, THEN check the age (CodeRabbit, #1366). The other order could read
    // the token of a lock retaken after the stat and "verify" that live lock
    // as the stale one. This way a lock replaced after the read is young at
    // the stat (nothing broken), and one replaced after the stat fails the
    // token check in removeLockIf and is put back.
    observed = fs.readFileSync(lockPath, "utf8");
    if (Date.now() - fs.statSync(lockPath).mtimeMs <= staleMs) return false;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  return removeLockIf(lockPath, observed);
}

function readLedgerStep(ledgerPath) {
  try {
    const step = Number(JSON.parse(fs.readFileSync(ledgerPath, "utf8")).lastStep);
    return Number.isFinite(step) ? step : -Infinity;
  } catch (error) {
    if (error.code === "ENOENT") return -Infinity;
    throw error;
  }
}

export function markTotpStepSpent(step) {
  if (step > lastStep) lastStep = step;
}

// { code, step } for the current or next step, whichever is unspent, or null
// when both are spent (wait for the next window).
export async function nextE2eTotpCode(password, nowMs = Date.now(), { ledgerPath } = {}) {
  const pick = () => {
    const current = Math.floor(nowMs / STEP_MS);
    for (const step of [current, current + 1]) {
      if (step > lastStep) {
        markTotpStepSpent(step);
        return step;
      }
    }
    return null;
  };
  let step;
  if (ledgerPath) {
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    step = await withFileLock(`${ledgerPath}.lock`, () => {
      markTotpStepSpent(readLedgerStep(ledgerPath));
      const chosen = pick();
      if (chosen !== null) {
        // Temp file and rename: a process killed mid-write must not leave a
        // truncated ledger, which persists and would fail every later run.
        const temp = `${ledgerPath}.${process.pid}.tmp`;
        fs.writeFileSync(temp, JSON.stringify({ lastStep: chosen }));
        fs.renameSync(temp, ledgerPath);
      }
      return chosen;
    });
  } else {
    step = pick();
  }
  return step === null ? null : { code: await e2eTotpCode(password, step * STEP_MS), step };
}

export function msUntilNextTotpStep(nowMs = Date.now()) {
  return STEP_MS - (nowMs % STEP_MS) + 250;
}
