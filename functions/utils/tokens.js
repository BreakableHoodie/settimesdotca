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
