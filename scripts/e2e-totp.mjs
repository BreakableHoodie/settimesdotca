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
const STEP_MS = 30_000;
let lastStep = -Infinity;

export function markTotpStepSpent(step) {
  if (step > lastStep) lastStep = step;
}

// { code, step } for the current or next step, whichever is unspent, or null
// when both are spent (wait for the next window).
export async function nextE2eTotpCode(password, nowMs = Date.now()) {
  const current = Math.floor(nowMs / STEP_MS);
  for (const step of [current, current + 1]) {
    if (step > lastStep) {
      markTotpStepSpent(step);
      return { code: await e2eTotpCode(password, step * STEP_MS), step };
    }
  }
  return null;
}

export function msUntilNextTotpStep(nowMs = Date.now()) {
  return STEP_MS - (nowMs % STEP_MS) + 250;
}
