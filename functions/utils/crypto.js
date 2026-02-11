// PBKDF2 password hashing utilities for Cloudflare Workers
// Uses the native Web Crypto API (crypto.subtle) which runs outside the
// Workers CPU time meter, avoiding error 1102 "Worker exceeded resource limits".

const SALT_LENGTH = 16;
const LEGACY_ITERATIONS = 100000;
const DEFAULT_ITERATIONS = 100000;
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
 * Derive a key using PBKDF2-SHA256 via the native Web Crypto API.
 * Unlike pure-JS implementations, crypto.subtle runs in native code
 * and does not count against the Workers CPU time limit.
 */
async function deriveKey(password, salt, iterations) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_LENGTH * 8
  );

  return new Uint8Array(derived);
}

/**
 * Hash a password using PBKDF2
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Format: pbkdf2$iterations$salt$hash
 */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  const hashArray = await deriveKey(password, salt, DEFAULT_ITERATIONS);

  const saltBase64 = btoa(String.fromCharCode(...salt));
  const hashBase64 = btoa(String.fromCharCode(...hashArray));

  return `pbkdf2$${DEFAULT_ITERATIONS}$${saltBase64}$${hashBase64}`;
}

/**
 * Verify a password against a stored hash
 * @param {string} password - Plain text password to verify
 * @param {string} storedHash - Stored hash in format pbkdf2$iterations$salt$hash or legacy salt:hash
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

    const salt = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));

    const hashArray = await deriveKey(password, salt, iterations);
    const storedHashArray = Uint8Array.from(atob(hashBase64), (c) =>
      c.charCodeAt(0)
    );

    return timingSafeEqual(hashArray, storedHashArray);
  } catch (error) {
    console.error("Password verification error:", error);
    return false;
  }
}
