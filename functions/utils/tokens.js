// Secure token generation for subscriptions, password resets, and sessions

import { toSqliteDateTime } from "./authAttempts.js";

/**
 * Generate a hex-encoded random token
 * @param {number} length - Byte length of token (default 32)
 * @returns {string} Hex-encoded token
 */
export function generateToken(length = 32) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Bearer tokens are stored hashed (#1354, #1415), like invite codes and API
// keys: the plaintext exists only in the emailed link. Random tokens have no
// useful dictionary, so an unsalted SHA-256 keeps lookup simple. A submitted
// value is always hashed first, so stored digests and retired values cannot be
// replayed as input.
export const STORED_TOKEN_HASH_PREFIX = "sha256:";
export const RESET_TOKEN_HASH_PREFIX = STORED_TOKEN_HASH_PREFIX;

export async function hashStoredToken(plaintext) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(plaintext)));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${STORED_TOKEN_HASH_PREFIX}${hex}`;
}

export const hashResetToken = hashStoredToken;

/**
 * Generate a password reset token with metadata
 * @param {number} userId - User ID requesting reset
 * @param {number} createdBy - Admin user ID initiating reset
 * @returns {Object} Token object with id and expiry
 */
export function generatePasswordResetToken(userId, createdBy) {
  return {
    token: crypto.randomUUID(),
    userId,
    createdBy,
    expiresAt: toSqliteDateTime(new Date(Date.now() + 2 * 60 * 60 * 1000)),
  };
}
