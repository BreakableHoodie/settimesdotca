// Web Crypto API password hashing utilities for Cloudflare Workers
// Uses PBKDF2 instead of bcrypt (which requires Node.js)

const SALT_LENGTH = 16;
const ITERATIONS = 100000;
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
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  // Convert password to bytes
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  // Import key
  const key = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  // Derive key using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    key,
    KEY_LENGTH * 8,
  );

  // Convert to base64 for storage
  const hashArray = new Uint8Array(derivedBits);
  const saltBase64 = btoa(String.fromCharCode(...salt));
  const hashBase64 = btoa(String.fromCharCode(...hashArray));

  // Return format: salt:hash
  return `${saltBase64}:${hashBase64}`;
}

/**
 * Verify a password against a stored hash
 * @param {string} password - Plain text password to verify
 * @param {string} storedHash - Stored hash in format salt:hash
 * @returns {Promise<boolean>} - True if password matches
 */
export async function verifyPassword(password, storedHash) {
  try {
    // Parse stored hash
    const [saltBase64, hashBase64] = storedHash.split(":");
    if (!saltBase64 || !hashBase64) {
      return false;
    }

    // Decode salt
    const salt = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));

    // Convert password to bytes
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password);

    // Import key
    const key = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      { name: "PBKDF2" },
      false,
      ["deriveBits"],
    );

    // Derive key using same parameters
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: ITERATIONS,
        hash: "SHA-256",
      },
      key,
      KEY_LENGTH * 8,
    );

    const hashArray = new Uint8Array(derivedBits);
    const storedHashArray = Uint8Array.from(
      atob(hashBase64),
      (c) => c.charCodeAt(0),
    );

    return timingSafeEqual(hashArray, storedHashArray);
  } catch (error) {
    console.error("Password verification error:", error);
    return false;
  }
}
