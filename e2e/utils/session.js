import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../credentials";
import fs from "fs";
import path from "path";
import { msUntilNextTotpStep, nextE2eTotpCode, withFileLock } from "../../scripts/e2e-totp.mjs";
import { ADMIN_LOGIN_LOCK, ADMIN_STORAGE_STATE, TOTP_LEDGER } from "./paths";

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
// Longer than any live login (a 2FA login can wait out a 30 s step window),
// so only a holder that died mid-login has its lock broken.
const ADMIN_LOGIN_LOCK_STALE_MS = 120_000;

export const loginAsAdmin = async (page) => {
  await page.goto("/admin");
  // Wait for either admin tab buttons (valid session) or login form (session expired/invalidated)
  await page.waitForSelector('button[role="tab"], input[type="email"]', { state: "visible", timeout: 15000 });
  if (await page.locator('input[type="email"]').isVisible()) {
    // One form login at a time across every worker. While this one waited,
    // another may have logged in and saved its session: try that first, and
    // log in (revoking it) only if it does not work either.
    // Time spent queued behind other workers' logins is not this test's work.
    // Allow for it BEFORE queueing (a test that times out in the queue can no
    // longer be extended), then charge only the wait that actually happened.
    const ownTimeout = test.info().timeout;
    test.info().setTimeout(ownTimeout + ADMIN_LOGIN_LOCK_STALE_MS);
    const queuedAt = Date.now();
    await withFileLock(
      ADMIN_LOGIN_LOCK,
      async () => {
        test.info().setTimeout(ownTimeout + (Date.now() - queuedAt));
        if (await adoptSavedAdminSession(page)) return;
        await submitAdminLogin(page);
        await page.waitForSelector('button[role="tab"]', { state: "visible", timeout: 15000 });
        await saveAdminSession(page);
      },
      { staleMs: ADMIN_LOGIN_LOCK_STALE_MS },
    );
  }
};

const adoptSavedAdminSession = async (page) => {
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(ADMIN_STORAGE_STATE, "utf8"));
  } catch {
    return false;
  }
  await page.context().addCookies(saved.cookies ?? []);
  await page.goto("/admin");
  await page.waitForSelector('button[role="tab"], input[type="email"]', { state: "visible", timeout: 15000 });
  return page.locator('button[role="tab"]').first().isVisible();
};

// That login just revoked the session every later test would load (#1366), so
// each of them logged in again: one 2FA code per test, a 30 s wait whenever the
// window's two codes were spent, and most of CI's ~18 minutes. Saving the new
// session lets the next test's fresh context start signed in. Written to a temp
// file and renamed, so a parallel worker never reads half a file.
const saveAdminSession = async (page) => {
  const state = await page.context().storageState();
  fs.mkdirSync(path.dirname(ADMIN_STORAGE_STATE), { recursive: true });
  const temp = `${ADMIN_STORAGE_STATE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state));
  fs.renameSync(temp, ADMIN_STORAGE_STATE);
};

// A TOTP code the server has not seen yet (#1333: each time-step is accepted
// once). Waits for the next 30 s window only when all three valid steps are
// spent, extending the test's timeout by the wait so it cannot time out.
const freshTotpCode = async () => {
  for (;;) {
    const next = await nextE2eTotpCode(ADMIN_PASSWORD, Date.now(), { ledgerPath: TOTP_LEDGER });
    if (next) return next.code;
    const wait = msUntilNextTotpStep();
    test.info().setTimeout(test.info().timeout + wait);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
};

// Types a fresh code into `input` and submits until `accepted` shows. Only an
// "already used" refusal is retried: it means another process spent that step.
// Any other refusal fails at once WITH the server's words. It used to wait 15 s
// for a "just used" alert that never came and report a locator timeout, which
// hid a 429 lockout as 32 unrelated-looking failures (#1366).
const submitTotpUntilAccepted = async (page, input, submit, accepted) => {
  // Scoped to the code's own form: an unrelated alert elsewhere (an earlier
  // toast) must not be read as this code's refusal.
  const refusal = input.locator("xpath=ancestor::form[1]").getByRole("alert");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await input.fill(await freshTotpCode());
    await submit.click();
    await expect(accepted.or(refusal).first()).toBeVisible({ timeout: 15000 });
    if (await accepted.first().isVisible()) return;
    const message = (await refusal.first().textContent())?.trim() ?? "";
    if (!/just used/i.test(message)) {
      throw new Error(`2FA code refused: "${message}"`);
    }
    test.info().annotations.push({ type: "totp-step-already-used", description: `attempt ${attempt + 1}` });
  }
  throw new Error("TOTP code refused as already used four times in a row");
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
    page,
    codeInput,
    page.getByRole("button", { name: "Verify Code" }),
    page.locator('button[role="tab"]'),
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
      page,
      stepUpDialog.locator("#step-up-code"),
      stepUpDialog.getByRole("button", { name: "Confirm" }),
      succeeded,
    );
  }
  await expect(succeeded.first()).toBeVisible({ timeout: 10000 });
};
