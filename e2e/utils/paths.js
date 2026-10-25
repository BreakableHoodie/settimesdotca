// Files shared by every Playwright process in a run (all under the gitignored
// e2e/.auth/). One home, so the config, the setup project and the login helper
// cannot drift apart.
export const ADMIN_STORAGE_STATE = "e2e/.auth/admin.json";
// The last TOTP step any process spent (#1366, see scripts/e2e-totp.mjs).
export const TOTP_LEDGER = "e2e/.auth/totp-ledger.json";
// Held across a whole form login: a second login replaces the first's pending
// 2FA challenge, so two at once fail with "Invalid or expired MFA token".
export const ADMIN_LOGIN_LOCK = "e2e/.auth/admin-login.lock";
