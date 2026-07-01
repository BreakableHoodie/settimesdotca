// TOTP (RFC 6238) + backup codes for admin MFA.
//
// The HMAC runs through the Web Crypto API (crypto.subtle) rather than a pure-JS
// crypto library, so the security-sensitive primitive uses the platform's native,
// audited implementation (and keeps functions/ free of a JS crypto dependency).
// Correctness is pinned by the RFC 6238 Appendix B test vectors in the test suite.

const DEFAULT_TOTP_STEP_SECONDS = 30;
const DEFAULT_TOTP_DIGITS = 6;
const DEFAULT_BACKUP_CODE_COUNT = 10;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // RFC 4648, no padding

function normalizeCode(code) {
  return String(code || "")
    .trim()
    .replace(/[\s-]/g, "");
}

export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(secret) {
  const clean = String(secret)
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

// HOTP (RFC 4226): HMAC-SHA1 over the 8-byte big-endian counter, dynamically
// truncated to `digits` decimal digits.
async function hotp(secretBytes, counter, digits) {
  const counterBytes = new Uint8Array(8);
  let remaining = counter;
  for (let i = 7; i >= 0; i -= 1) {
    counterBytes[i] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

function constantTimeEqual(a, b) {
  // Include length inequality in the diff to avoid a length timing oracle.
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function generateTotpSecret(byteLength = 20) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

export function buildOtpAuthUrl({ secret, email, issuer = "SetTimes" }) {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DEFAULT_TOTP_DIGITS),
    period: String(DEFAULT_TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export async function generateTotpCode(secret, timeMs = Date.now()) {
  if (!secret) {
    return "";
  }
  const counter = Math.floor(timeMs / 1000 / DEFAULT_TOTP_STEP_SECONDS);
  return hotp(base32Decode(secret), counter, DEFAULT_TOTP_DIGITS);
}

export async function verifyTotp(secret, code, window = 1) {
  const normalized = normalizeCode(code);

  if (!secret || !normalized) {
    return false;
  }

  const secretBytes = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / DEFAULT_TOTP_STEP_SECONDS);
  const span = Math.max(0, window);

  let matched = false;
  // Walk the full ± window without early-exit so a match's step index doesn't leak.
  for (let offset = -span; offset <= span; offset += 1) {
    const candidate = await hotp(secretBytes, counter + offset, DEFAULT_TOTP_DIGITS);
    if (constantTimeEqual(candidate, normalized)) {
      matched = true;
    }
  }
  return matched;
}

export function generateBackupCodes(count = DEFAULT_BACKUP_CODE_COUNT) {
  const CHARSET_SIZE = 36; // 0-9a-z
  // Reject bytes >= this threshold to eliminate modulo bias (256 = 7×36 + 4).
  const UNBIASED_LIMIT = Math.floor(256 / CHARSET_SIZE) * CHARSET_SIZE; // 252
  const codes = [];

  for (let i = 0; i < count; i += 1) {
    const chars = [];
    while (chars.length < 6) {
      const bytes = new Uint8Array(6);
      crypto.getRandomValues(bytes);
      for (const byte of bytes) {
        if (byte < UNBIASED_LIMIT && chars.length < 6) {
          chars.push((byte % CHARSET_SIZE).toString(36));
        }
      }
    }
    const code = chars.join("").toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

export async function hashBackupCode(code) {
  const normalized = normalizeCode(code);
  const data = new TextEncoder().encode(normalized);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return btoa(String.fromCharCode(...digest));
}

export async function verifyBackupCode(code, hashedCodes = []) {
  if (!Array.isArray(hashedCodes) || hashedCodes.length === 0) {
    return { valid: false, remaining: hashedCodes };
  }

  const hashed = await hashBackupCode(code);
  let index = -1;

  // Iterate all codes without early exit to prevent position-based timing leaks.
  for (let i = 0; i < hashedCodes.length; i += 1) {
    if (constantTimeEqual(hashed, String(hashedCodes[i] || ""))) {
      index = i;
    }
  }

  if (index === -1) {
    return { valid: false, remaining: hashedCodes };
  }

  const remaining = hashedCodes.slice();
  remaining.splice(index, 1);
  return { valid: true, remaining };
}
