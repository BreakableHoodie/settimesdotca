import { test, expect } from "@playwright/test";
import { ADMIN_PASSWORD } from "./credentials";
import { confirmStepUpIfPrompted, loginAsAdmin } from "./utils/session";

// Signup through an invite is the flow the PBKDF2 outage broke in production
// from 2026-06-28 to 2026-10-10 (CLAUDE.md "PBKDF2, not bcrypt"): hashPassword
// runs on the request path, and only the edge refuses more than 100,000
// iterations, so every Node and local-wrangler test stayed green. This spec
// completes one real signup, and the edge-e2e job runs it on a preview (#1292).
//
// It needs the invite code, which the API hands back only when email delivery
// is not configured: true for local E2E and for previews, never production.
test("an invited user can complete signup", async ({ page, browser }) => {
  // A login and a step-up can each wait up to 30 s for an unspent TOTP step
  // (e2e/utils/session.js), so the default 30 s budget passes only by luck.
  test.setTimeout(120000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const email = `edge-signup-${suffix}@example.com`;

  await loginAsAdmin(page);
  await page.click('button:has-text("Users")');
  await page.click('button:has-text("Invite User")');
  await expect(page.getByRole("heading", { name: "Create New User" })).toBeVisible();
  // The form initialises just after it opens and clears anything filled too
  // early, so fill until every value has stuck rather than sleeping.
  const fields = { "#firstName": "Edge", "#lastName": `Signup ${suffix}`, "#email": email };
  await expect(async () => {
    for (const [selector, value] of Object.entries(fields)) {
      await page.fill(selector, value);
    }
    for (const [selector, value] of Object.entries(fields)) {
      await expect(page.locator(selector)).toHaveValue(value, { timeout: 500 });
    }
  }).toPass({ timeout: 5000 });
  await page.selectOption("#role", "viewer");
  await page.click('button[type="submit"]:has-text("Send Invite")');
  const inviteCreated = page.getByRole("heading", { name: "Invite Created" });
  await confirmStepUpIfPrompted(page, inviteCreated);

  // Only the code: the URL is built from the PUBLIC base URL, which can name
  // the production host. The signup must hit the deployment under test.
  const code = new URL(await page.getByLabel("Invite URL").inputValue()).searchParams.get("code");
  expect(code, "the invite URL carries a code").toBeTruthy();

  // The invitee is someone else: a signed-out context. Inside Playwright Test,
  // browser.newContext() inherits the project's `use` options, storageState
  // included, so it must be emptied explicitly or the "invitee" is the admin
  // and /admin/signup redirects to the dashboard (as chromium-unauth does).
  const base = test.info().project.use.baseURL;
  const invitee = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const signup = await invitee.newPage();
    await signup.goto(new URL(`/admin/signup?code=${encodeURIComponent(code)}`, base).toString());
    // Derived from the E2E admin secret on purpose: failure artifacts upload
    // only after scrub-e2e-artifacts.mjs redacts that secret, and it redacts
    // every occurrence, so a typed passphrase CONTAINING it is scrubbed too.
    // A fresh random one would sit in a public artifact unredacted.
    const testOnlyPassphrase = `${ADMIN_PASSWORD}-Inv1`;
    expect(testOnlyPassphrase.length, "derived passphrase fits the 128-character limit").toBeLessThanOrEqual(128);
    const signupFields = {
      "#signup-email": email,
      "#signup-password": testOnlyPassphrase,
      "#signup-confirm-password": testOnlyPassphrase,
      "#signup-first-name": "Edge",
      "#signup-last-name": `Signup ${suffix}`,
    };
    // The page is a lazy chunk that sets its state from the URL on mount, so
    // fill until every value has stuck (as for the invite form above).
    await expect(async () => {
      for (const [selector, value] of Object.entries(signupFields)) {
        await signup.fill(selector, value);
      }
      for (const [selector, value] of Object.entries(signupFields)) {
        await expect(signup.locator(selector)).toHaveValue(value, { timeout: 500 });
      }
    }).toPass({ timeout: 10000 });
    const createAccount = signup.getByRole("button", { name: "Create Account" });
    await expect(createAccount, "the form is complete and has the invite code").toBeEnabled();

    // Assert the API, not just the page: a hashPassword the edge refuses is a
    // 500 here, and that is the regression this spec exists to catch. Bounded,
    // so a submit that never happens fails here instead of hanging the test.
    const [response] = await Promise.all([
      signup.waitForResponse((r) => r.url().endsWith("/api/admin/auth/signup") && r.request().method() === "POST", {
        timeout: 15000,
      }),
      createAccount.click(),
    ]);
    expect(response.status(), await response.text()).toBe(201);
    expect((await response.json()).requiresActivation).toBe(true);
    await expect(signup.getByRole("heading", { name: "Check your email" })).toBeVisible();
  } finally {
    await invitee.close();
  }
});
