const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_TOTP_STEP_SECONDS = 30;
const DEFAULT_TOTP_DIGITS = 6;
const DEFAULT_BACKUP_CODE_COUNT = 10;

function base32Encode(bytes) {
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

function base32Decode(input) {
  const cleaned = input.replace(/=+$/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const output = [];

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      continue;
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}

function normalizeCode(code) {
  return String(code || "")
    .trim()
    .replace(/[\s-]/g, "");
}

export function generateTotpSecret(byteLength = 20) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

export function buildOtpAuthUrl({ secret, email, issuer = "SetTimes" }) {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const issuerParam = encodeURIComponent(issuer);
  const secretParam = encodeURIComponent(secret);
  return `otpauth://totp/${label}?secret=${secretParam}&issuer=${issuerParam}&digits=${DEFAULT_TOTP_DIGITS}&period=${DEFAULT_TOTP_STEP_SECONDS}`;
}

async function generateTotp(secret, timeMs, stepSeconds, digits) {
  const counter = Math.floor(timeMs / 1000 / stepSeconds);
  const counterBytes = new Uint8Array(8);
  let temp = counter;

  for (let i = 7; i >= 0; i -= 1) {
    counterBytes[i] = temp & 0xff;
    temp = Math.floor(temp / 256);
  }

  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );

  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, "0");
}

export async function generateTotpCode(secret, timeMs = Date.now()) {
  return generateTotp(secret, timeMs, DEFAULT_TOTP_STEP_SECONDS, DEFAULT_TOTP_DIGITS);
}

export async function verifyTotp(secret, code, window = 1) {
  const normalized = normalizeCode(code);
  if (!secret || !normalized) {
    return false;
  }

  const now = Date.now();
  for (let offset = -window; offset <= window; offset += 1) {
    const timeMs = now + offset * DEFAULT_TOTP_STEP_SECONDS * 1000;
    const expected = await generateTotp(
      secret,
      timeMs,
      DEFAULT_TOTP_STEP_SECONDS,
      DEFAULT_TOTP_DIGITS,
    );
    if (expected === normalized) {
      return true;
    }
  }

  return false;
}

export function generateBackupCodes(count = DEFAULT_BACKUP_CODE_COUNT) {
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const code = Array.from(bytes)
      .map(byte => (byte % 36).toString(36))
      .join("")
      .toUpperCase();
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
  const index = hashedCodes.indexOf(hashed);
  if (index === -1) {
    return { valid: false, remaining: hashedCodes };
  }

  const remaining = hashedCodes.slice();
  remaining.splice(index, 1);
  return { valid: true, remaining };
}
