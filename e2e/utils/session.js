import { expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../credentials";
import { e2eTotpCode } from "../../scripts/e2e-totp.mjs";

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
  await codeInput.fill(await e2eTotpCode(ADMIN_PASSWORD));
  await page.getByRole("button", { name: "Verify Code" }).click();
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
    await stepUpDialog.locator("#step-up-code").fill(await e2eTotpCode(ADMIN_PASSWORD));
    await stepUpDialog.getByRole("button", { name: "Confirm" }).click();
    await expect(stepUpDialog).not.toBeVisible();
  }
  await expect(succeeded.first()).toBeVisible({ timeout: 10000 });
};
