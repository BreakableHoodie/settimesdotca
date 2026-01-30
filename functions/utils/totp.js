import { generate, generateSecret, generateURI, verify } from "otplib";

const DEFAULT_TOTP_STEP_SECONDS = 30;
const DEFAULT_TOTP_DIGITS = 6;
const DEFAULT_BACKUP_CODE_COUNT = 10;

function normalizeCode(code) {
  return String(code || "")
    .trim()
    .replace(/[\s-]/g, "");
}

export function generateTotpSecret(byteLength = 20) {
  return generateSecret({ length: byteLength });
}

export function buildOtpAuthUrl({ secret, email, issuer = "SetTimes" }) {
  return generateURI({
    issuer,
    label: email,
    secret,
    digits: DEFAULT_TOTP_DIGITS,
    period: DEFAULT_TOTP_STEP_SECONDS,
  });
}

export async function generateTotpCode(secret, timeMs = Date.now()) {
  if (!secret) {
    return "";
  }
  return generate({
    secret,
    digits: DEFAULT_TOTP_DIGITS,
    period: DEFAULT_TOTP_STEP_SECONDS,
    epoch: Math.floor(timeMs / 1000),
  });
}

export async function verifyTotp(secret, code, window = 1) {
  const normalized = normalizeCode(code);
  if (!secret || !normalized) {
    return false;
  }

  const epochTolerance = Math.max(0, window) * DEFAULT_TOTP_STEP_SECONDS;
  const result = await verify({
    secret,
    token: normalized,
    digits: DEFAULT_TOTP_DIGITS,
    period: DEFAULT_TOTP_STEP_SECONDS,
    epochTolerance,
  });
  return result.valid;
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
