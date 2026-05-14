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

  try {
    const result = await verify({
      secret,
      token: normalized,
      digits: DEFAULT_TOTP_DIGITS,
      period: DEFAULT_TOTP_STEP_SECONDS,
      epochTolerance,
    });
    return result.valid;
  } catch (error) {
    console.error("[TOTP] verify() threw error:", error?.message || error);
    console.error("[TOTP] Error details:", {
      name: error?.name,
      message: error?.message,
      stack: error?.stack?.split("\n").slice(0, 3),
    });
    return false;
  }
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

  const timingSafeEqual = (a, b) => {
    // Include length inequality in diff to prevent timing oracle on hash length.
    const maxLen = Math.max(a.length, b.length);
    let diff = a.length ^ b.length;
    for (let i = 0; i < maxLen; i += 1) {
      diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return diff === 0;
  };

  // Iterate all codes without early exit to prevent position-based timing leaks.
  for (let i = 0; i < hashedCodes.length; i += 1) {
    if (timingSafeEqual(hashed, String(hashedCodes[i] || ""))) {
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
