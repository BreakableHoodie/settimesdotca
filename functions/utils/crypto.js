// PBKDF2 password hashing utilities for Cloudflare Workers
// Uses @noble/hashes for consistent runtime support.
// NOTE: Cloudflare Workers limits PBKDF2 to 100,000 iterations max

import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";

const SALT_LENGTH = 16;
const LEGACY_ITERATIONS = 100000;
const DEFAULT_ITERATIONS = 100000; // CF Workers limit: max 100,000 iterations
const KEY_LENGTH = 32;

function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }

  return diff === 0;
}

/**
 * Hash a password using PBKDF2
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Base64 encoded salt:hash string
 */
export async function hashPassword(password) {
  // Generate random salt
  const salt = randomBytes(SALT_LENGTH);

  // Convert password to bytes
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  // Derive key using PBKDF2
  const hashArray = pbkdf2(sha256, passwordBytes, salt, {
    c: DEFAULT_ITERATIONS,
    dkLen: KEY_LENGTH,
  });

  // Convert to base64 for storage
  const saltBase64 = btoa(String.fromCharCode(...salt));
  const hashBase64 = btoa(String.fromCharCode(...hashArray));

  // Return format: pbkdf2$iterations$salt$hash
  return `pbkdf2$${DEFAULT_ITERATIONS}$${saltBase64}$${hashBase64}`;
}

/**
 * Verify a password against a stored hash
 * @param {string} password - Plain text password to verify
 * @param {string} storedHash - Stored hash in format salt:hash
 * @returns {Promise<boolean>} - True if password matches
 */
export async function verifyPassword(password, storedHash) {
  try {
    let iterations = LEGACY_ITERATIONS;
    let saltBase64;
    let hashBase64;

    if (storedHash.startsWith("pbkdf2$")) {
      const parts = storedHash.split("$");
      if (parts.length !== 4) {
        return false;
      }
      iterations = Number(parts[1]);
      saltBase64 = parts[2];
      hashBase64 = parts[3];
      if (!iterations || !saltBase64 || !hashBase64) {
        return false;
      }
    } else {
      // Legacy format: salt:hash
      const legacyParts = storedHash.split(":");
      if (legacyParts.length !== 2) {
        return false;
      }
      saltBase64 = legacyParts[0];
      hashBase64 = legacyParts[1];
    }

    // Decode salt
    const salt = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));

    // Convert password to bytes
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password);

    // Derive key using same parameters
    const hashArray = pbkdf2(sha256, passwordBytes, salt, {
      c: iterations,
      dkLen: KEY_LENGTH,
    });
    const storedHashArray = Uint8Array.from(atob(hashBase64), (c) =>
      c.charCodeAt(0)
    );

    return timingSafeEqual(hashArray, storedHashArray);
  } catch (error) {
    console.error("Password verification error:", error);
    return false;
  }
}
