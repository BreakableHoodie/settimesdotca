import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { d1, sqlString } from "./utils/d1";

// The three flows whose token is only ever emailed: password-reset completion,
// follow confirmation and subscription verification (#1292). Previews and local
// E2E have no email provider, so the token is read from (or, for a reset,
// seeded into) the database the app under test uses (e2e/utils/d1.js).
//
// Each confirmation is CLICKED in a real browser, never POSTed with curl:
// CLAUDE.md "Emailed links never act on a GET" records a Referrer-Policy bug
// that broke every confirm button in Chromium while curl and unit tests passed.
test.use({ storageState: { cookies: [], origins: [] } });

// Cloudflare's always-pass test secret (previews) accepts any token; local dev
// with the secret unset accepts a dev request.
const TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// POST from inside the page: same origin, so the real Origin header is sent.
const postJson = (page, path, body) =>
  page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, text: await response.text() };
    },
    { path, body },
  );

const clickAndWaitForPost = async (page, path, buttonName) => {
  const [response] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === path && r.request().method() === "POST", {
      timeout: 15000,
    }),
    page.getByRole("button", { name: buttonName }).click(),
  ]);
  return response;
};

test("a password reset link completes, hashing the new password on the server", async ({ page }) => {
  // A real reset token, seeded the way mfa/admin reset issues one: 64 hex
  // characters, a SQLite-format expiry. Issuance is not what can break on the
  // edge; hashing the new password is (the PBKDF2 outage, CLAUDE.md).
  const token = randomBytes(32).toString("hex");
  d1(
    `INSERT INTO password_reset_tokens (user_id, token, created_by, expires_at, reason)
     SELECT id, ${sqlString(token)}, id, datetime('now', '+30 minutes'), 'e2e' FROM users
     WHERE email = 'viewer@settimes.ca'`,
  );

  await page.goto(`/reset-password#token=${token}`);
  const newPassword = `test-only-Reset-${unique()}-Aa1!`;
  await page.getByLabel(/^new password/i).fill(newPassword);
  await page.getByLabel(/^confirm/i).fill(newPassword);
  // The page posts to /api/auth/reset-password (re-exporting reset-password-complete.js).
  const response = await clickAndWaitForPost(page, "/api/auth/reset-password", "Reset Password");
  expect(response.status(), await response.text()).toBe(200);
  await expect(page.getByText(/password reset successfully/i)).toBeVisible();

  const [row] = d1(`SELECT used FROM password_reset_tokens WHERE token = ${sqlString(token)}`);
  expect(row?.used, "the token is spent").toBe(1);
});

test("a follow confirmation link confirms the follow", async ({ page }) => {
  const email = `edge-follow-${unique()}@example.com`;
  await page.goto("/privacy");
  const followed = await postJson(page, "/api/bands/1/follow", { email, turnstileToken: TURNSTILE_TEST_TOKEN });
  expect(followed.status, followed.text).toBe(200);

  const [pending] = d1(
    `SELECT verified, verification_token AS token FROM band_follows WHERE email = ${sqlString(email)}`,
  );
  expect(pending?.verified, "double opt-in: pending until confirmed").toBe(0);

  await page.goto(`/api/bands/1/confirm-follow?token=${encodeURIComponent(pending.token)}`);
  // Mail scanners fetch links with GET, so loading the page must change nothing
  // (CLAUDE.md "Emailed links never act on a GET"). Only the click confirms.
  expect(d1(`SELECT verified FROM band_follows WHERE email = ${sqlString(email)}`)).toEqual([{ verified: 0 }]);
  const response = await clickAndWaitForPost(page, "/api/bands/1/confirm-follow", "Confirm my follow");
  expect(response.status(), await response.text()).toBe(200);
  expect(d1(`SELECT verified FROM band_follows WHERE email = ${sqlString(email)}`)).toEqual([{ verified: 1 }]);
});

test("a subscription verification link verifies the subscription", async ({ page }) => {
  const email = `edge-subscribe-${unique()}@example.com`;
  await page.goto("/privacy");
  const subscribed = await postJson(page, "/api/subscriptions/subscribe", {
    email,
    city: "all",
    genre: "all",
    frequency: "weekly",
    turnstileToken: TURNSTILE_TEST_TOKEN,
  });
  expect(subscribed.status, subscribed.text).toBeLessThan(300);

  const [pending] = d1(
    `SELECT verified, verification_token AS token FROM email_subscriptions WHERE email = ${sqlString(email)}`,
  );
  expect(pending?.verified, "double opt-in: pending until verified").toBe(0);

  await page.goto(`/api/subscriptions/verify?token=${encodeURIComponent(pending.token)}`);
  // As for follows: the GET a mail scanner makes must not verify anything.
  expect(d1(`SELECT verified FROM email_subscriptions WHERE email = ${sqlString(email)}`)).toEqual([{ verified: 0 }]);
  // Success is a 303 to /subscribe?verified=true on the PUBLIC host, so assert
  // the redirect itself rather than wherever the browser ends up.
  const response = await clickAndWaitForPost(page, "/api/subscriptions/verify", "Confirm my subscription");
  expect(response.status()).toBe(303);
  expect(new URL(response.headers().location).pathname + new URL(response.headers().location).search).toBe(
    "/subscribe?verified=true",
  );
  expect(d1(`SELECT verified FROM email_subscriptions WHERE email = ${sqlString(email)}`)).toEqual([{ verified: 1 }]);
});
