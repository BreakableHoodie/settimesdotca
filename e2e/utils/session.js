import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../credentials";

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
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForSelector('button[role="tab"]', { state: "visible", timeout: 15000 });
  }
};
