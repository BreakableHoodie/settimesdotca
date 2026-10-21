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

// Reset tokens are stored hashed (#1354), like invite codes (inviteCodes.js,
// #1334) and API keys: the plaintext exists only in the emailed link. Same
// scheme and reasoning: the token is crypto.randomUUID() (122 random bits), so
// an unsalted SHA-256 has no dictionary to fear, and lookup stays `WHERE token
// = ?`. A submitted value is always hashed first, so a caller who sends a
// stored `sha256:...` or `retired:<id>` value matches nothing.
export const RESET_TOKEN_HASH_PREFIX = "sha256:";

export async function hashResetToken(plaintext) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(plaintext)));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${RESET_TOKEN_HASH_PREFIX}${hex}`;
}

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
