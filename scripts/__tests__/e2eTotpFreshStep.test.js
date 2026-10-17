import { describe, expect, it } from "vitest";
import { e2eTotpCode, markTotpStepSpent, msUntilNextTotpStep, nextE2eTotpCode } from "../e2e-totp.mjs";

// The server accepts each TOTP step once (#1333), so E2E must never present a
// step twice. Steps now-1, now and now+1 are valid at any instant.
describe("nextE2eTotpCode", () => {
  const PASSWORD = "e2e-test-placeholder-fresh-step";
  const STEP = 30_000;
  const now = 1_900_000_000_000;
  const current = Math.floor(now / STEP);

  it("hands out each valid step once, earliest first, then null until the next window", async () => {
    const first = await nextE2eTotpCode(PASSWORD, now);
    const second = await nextE2eTotpCode(PASSWORD, now);
    const third = await nextE2eTotpCode(PASSWORD, now);
    expect([first.step, second.step, third.step]).toEqual([current - 1, current, current + 1]);
    expect(first.code).toBe(await e2eTotpCode(PASSWORD, (current - 1) * STEP));
    expect(await nextE2eTotpCode(PASSWORD, now)).toBeNull();

    // Two windows later, now+1 is the previous step and already spent.
    const later = await nextE2eTotpCode(PASSWORD, now + 2 * STEP);
    expect(later.step).toBe(current + 2);
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
