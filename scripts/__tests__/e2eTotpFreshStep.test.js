import { describe, expect, it } from "vitest";
import { e2eTotpCode, markTotpStepSpent, msUntilNextTotpStep, nextE2eTotpCode } from "../e2e-totp.mjs";

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
