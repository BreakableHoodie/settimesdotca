// Secure token generation for subscriptions, password resets, and sessions

/**
 * Generate a hex-encoded random token
 * @param {number} length - Byte length of token (default 32)
 * @returns {string} Hex-encoded token
 */
export function generateToken(length = 32) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Generate a UUID v4 token for password resets and sessions
 * @returns {string} UUID v4 token
 */
export function generateUUID() {
  return crypto.randomUUID();
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
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
  };
}

/**
 * Generate a session token
 * @param {number} userId - User ID for the session
 * @param {boolean} rememberMe - Whether this is a long-lived session
 * @returns {Object} Session object with id and expiry
 */
export function generateSessionToken(userId, rememberMe = false) {
  const expiryHours = rememberMe ? 24 * 7 : 24; // 7 days vs 24 hours
  return {
    id: crypto.randomUUID(),
    userId,
    rememberMe: rememberMe ? 1 : 0,
    expiresAt: new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Validate token format (basic UUID check)
 * @param {string} token - Token to validate
 * @returns {boolean} True if token looks valid
 */
export function isValidTokenFormat(token) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return typeof token === "string" && uuidRegex.test(token);
}
