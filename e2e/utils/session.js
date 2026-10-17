import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../credentials";
import { msUntilNextTotpStep, nextE2eTotpCode } from "../../scripts/e2e-totp.mjs";

// The storageState saved by auth.setup.js cannot be trusted to still be valid.
// `lucia.invalidateUserSessions()` runs on every re-authentication (see
// functions/utils/auth.js and CLAUDE.md), so login.spec.js logging in KILLS the
// session auth.setup.js saved. A spec running afterwards then lands on the login
// form, where there are no tabs and every `getByRole("tab")` times out.
//
// The failure is order-dependent, which is what makes it expensive: running an
// affected spec on its own passes and hides the problem completely. That is how
// #885's CI failure started its diagnosis in the wrong place.
//
// This is the single home for that behaviour -- eight specs each carried their
// own copy before #888. Do not reintroduce a local one.
export const loginAsAdmin = async (page) => {
  await page.goto("/admin");
  // Wait for either admin tab buttons (valid session) or login form (session expired/invalidated)
  await page.waitForSelector('button[role="tab"], input[type="email"]', { state: "visible", timeout: 15000 });
  if (await page.locator('input[type="email"]').isVisible()) {
    await submitAdminLogin(page);
    await page.waitForSelector('button[role="tab"]', { state: "visible", timeout: 15000 });
  }
};

// A TOTP code the server has not seen yet (#1333: each time-step is accepted
// once). Waits for the next 30 s window only when all three valid steps are
// spent, extending the test's timeout by the wait so it cannot time out.
const freshTotpCode = async () => {
  for (;;) {
    const next = await nextE2eTotpCode(ADMIN_PASSWORD);
    if (next) return next.code;
    const wait = msUntilNextTotpStep();
    test.info().setTimeout(test.info().timeout + wait);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
};

// Types codes into `input` and submits until `accepted` shows. A refusal means
// another worker spent that step; the next call moves past it. Five tries
// covers every valid step in two windows.
const submitTotpUntilAccepted = async (input, submit, accepted, refused) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await input.fill(await freshTotpCode());
    await submit.click();
    await expect(accepted.or(refused).first()).toBeVisible({ timeout: 15000 });
    if (await accepted.first().isVisible()) return;
  }
  throw new Error("TOTP code refused five times in a row");
};

// Password, then the 2FA code: the E2E admin is enrolled like every real admin
// (#1253; see scripts/e2e-totp.mjs). The code is generated at the moment it is
// typed, so it cannot go stale between the two steps. Every spec that logs in
// through the form goes through here -- do not add a password-only copy.
export const submitAdminLogin = async (page) => {
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  const codeInput = page.locator("#mfa-code");
  await codeInput.waitFor({ state: "visible", timeout: 15000 });
  await submitTotpUntilAccepted(
    codeInput,
    page.getByRole("button", { name: "Verify Code" }),
    page.locator('button[role="tab"]'),
    page.getByRole("alert").filter({ hasText: /invalid authentication code/i }),
  );
};

// Identity changes ask for a fresh 2FA code (#1324): the first one in a
// 5-minute window opens the "Confirm it's you" dialog, later ones do not. Call
// this right after the click that starts such a change, passing a locator for
// the change's own success signal (a toast, or a result dialog). It waits until
// either that or the step-up dialog shows, and answers the dialog only if it
// appeared. Pass an element, never a page-text pattern: the table's own copy
// can match a loose pattern and end the wait before the dialog opens, which is
// how the first version skipped the prompt in CI.
export const successToast = (page, matcher) => page.getByRole("alert").filter({ hasText: matcher });

export const confirmStepUpIfPrompted = async (page, succeeded) => {
  const stepUpDialog = page.getByRole("dialog", { name: "Confirm it's you" });
  await expect(stepUpDialog.or(succeeded).first()).toBeVisible({ timeout: 10000 });
  if (await stepUpDialog.isVisible()) {
    await submitTotpUntilAccepted(
      stepUpDialog.locator("#step-up-code"),
      stepUpDialog.getByRole("button", { name: "Confirm" }),
      succeeded,
      stepUpDialog.getByRole("alert").filter({ hasText: /invalid authentication code/i }),
    );
  }
  await expect(succeeded.first()).toBeVisible({ timeout: 10000 });
};
