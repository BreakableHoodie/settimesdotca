import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { verifyPassword } from "../functions/utils/crypto.js";
import { hashResetToken } from "../functions/utils/tokens.js";
import { d1, sqlString } from "./utils/d1";

// Password-reset completion, whose token is only ever emailed (#1292). Previews
// and local E2E have no email provider, and reset tokens are stored hashed
// (#1354), so the test seeds the digest of a token it generated into the
// database the app under test uses (e2e/utils/d1.js) and opens a link carrying
// the plaintext. On the edge this is a PBKDF2 canary: it hashes a new password
// in the real Workers runtime.
test.use({ storageState: { cookies: [], origins: [] } });

// From crypto, not Math.random: it goes into a password, and CodeQL (rightly)
// refuses weak randomness anywhere near a credential.
const unique = () => `${Date.now()}-${randomBytes(4).toString("hex")}`;

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
  // Stored hashed, as issuance stores it (#1354); the link carries the token.
  const tokenHash = await hashResetToken(token);
  d1(
    `INSERT INTO password_reset_tokens (user_id, token, created_by, expires_at, reason)
     SELECT id, ${sqlString(tokenHash)}, id, datetime('now', '+30 minutes'), 'e2e' FROM users
     WHERE email = 'viewer@settimes.ca'`,
  );

  await page.goto(`/reset-password#token=${token}`);
  const newPassword = `test-only-Reset-${unique()}-Aa1!`;
  await page.getByLabel(/^new password/i).fill(newPassword);
  await page.getByLabel(/^confirm/i).fill(newPassword);
  // The page posts to /api/auth/reset-password (re-exporting reset-password-complete.js).
  const response = await clickAndWaitForPost(page, "/api/auth/reset-password", "Reset password");
  expect(response.status(), await response.text()).toBe(200);
  await expect(page.getByText(/password reset successfully/i)).toBeVisible();

  const [row] = d1(`SELECT used FROM password_reset_tokens WHERE token = ${sqlString(tokenHash)}`);
  expect(row?.used, "the token is spent").toBe(1);
  // A handler can spend the token and answer 200 without writing the hash.
  const [user] = d1("SELECT password_hash FROM users WHERE email = 'viewer@settimes.ca'");
  expect(await verifyPassword(newPassword, user?.password_hash), "the new password is what is stored").toBe(true);
});
