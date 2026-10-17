// Invite codes are stored hashed (#1334), like API keys (see apiKeys.js).
//
// `GET /api/admin/invite-codes` used to return every unused code in plaintext,
// so an admin session stolen WITHOUT the second factor could read an unused
// admin invite and sign up as a new admin, bypassing the step-up that guards
// creating one. Now the plaintext exists only in the creation response and the
// invite link; the database holds a SHA-256 digest and an 8-character display
// prefix.
//
// A fast, UNSALTED digest is right here for the same reason as API keys: the
// code is `crypto.randomUUID()` (122 random bits), so there is no dictionary to
// slow down, and redemption finds the row with `WHERE code = ?`, which a
// per-row salt would make impossible.
//
// The `sha256:` prefix is the stored-value scheme. A submitted string is always
// hashed before lookup, so a caller who sends `sha256:...` or `retired:<id>`
// (the value migration 0071 gives dead rows) is hashed again and matches nothing.

export const INVITE_CODE_HASH_PREFIX = "sha256:";
export const INVITE_CODE_DISPLAY_PREFIX_LENGTH = 8;

export async function hashInviteCode(plaintext) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(plaintext)));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${INVITE_CODE_HASH_PREFIX}${hex}`;
}

export function inviteCodePrefix(plaintext) {
  return String(plaintext).slice(0, INVITE_CODE_DISPLAY_PREFIX_LENGTH);
}

// Mints a code: the plaintext is returned once to the caller, never persisted.
export async function generateInviteCode() {
  const plaintext = crypto.randomUUID();
  return { plaintext, codeHash: await hashInviteCode(plaintext), codePrefix: inviteCodePrefix(plaintext) };
}
