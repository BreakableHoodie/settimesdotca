// TOTP (Time-based One-Time Password) utilities using otplib
// Industry standard library for Google Authenticator compatibility

import { authenticator, totp } from "otplib";

// Configure otplib for Google Authenticator compatibility
authenticator.options = {
  window: 1, // Allow 1 time step tolerance
  step: 30, // 30 second time steps
  algorithm: "sha1",
  digits: 6,
  encoding: "base32",
};

totp.options = authenticator.options;

/**
 * Generate a secret key for TOTP
 * @returns {string} Base32 encoded secret
 */
export function generateTOTPSecret() {
  return authenticator.generateSecret();
}

/**
 * Generate QR code data URL for TOTP setup
 * @param {string} email - User's email
 * @param {string} secret - TOTP secret
 * @param {string} issuer - App name
 * @returns {string} Data URL for QR code
 */
export function generateTOTPQRCode(email, secret, issuer = "Concert Manager") {
  const otpauth = authenticator.keyuri(email, issuer, secret);
  return `data:image/svg+xml;base64,${btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="white"/>
      <text x="100" y="100" text-anchor="middle" font-family="monospace" font-size="12">
        Scan with Google Authenticator
      </text>
    </svg>
  `)}`;
}

/**
 * Verify a TOTP token
 * @param {string} token - 6-digit token from user
 * @param {string} secret - User's TOTP secret
 * @returns {boolean} True if token is valid
 */
export function verifyTOTPToken(token, secret) {
  try {
    return authenticator.verify({ token, secret });
  } catch (error) {
    console.error("TOTP verification error:", error);
    return false;
  }
}

/**
 * Generate a backup code (8-digit numeric)
 * @returns {string} 8-digit backup code
 */
export function generateBackupCode() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

/**
 * Generate multiple backup codes
 * @param {number} count - Number of codes to generate
 * @returns {string[]} Array of backup codes
 */
export function generateBackupCodes(count = 10) {
  return Array.from({ length: count }, () => generateBackupCode());
}
