// Trusted Device utilities for "Remember this device" MFA feature

const TRUSTED_DEVICE_COOKIE_NAME = "trusted_device";
const TRUSTED_DEVICE_EXPIRY_DAYS = 30;

/**
 * Hash a string using SHA-256, returning hex
 */
async function sha256Hex(input) {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeStringEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Generate a device fingerprint from IP and User-Agent
 * Returns both the combined fingerprint and a separate UA hash
 */
async function generateDeviceFingerprint(ipAddress, userAgent) {
  const data = `${ipAddress || "unknown"}:${userAgent || "unknown"}`;
  return sha256Hex(data);
}

/**
 * Generate a hash of the User-Agent alone for independent validation
 */
async function generateUaHash(userAgent) {
  return sha256Hex(userAgent || "unknown");
}

/**
 * Generate a secure random token for trusted device
 */
function generateTrustedDeviceToken() {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
}

/**
 * Create a trusted device entry in the database
 */
export async function createTrustedDevice(DB, userId, ipAddress, userAgent) {
  const token = generateTrustedDeviceToken();
  const fingerprint = await generateDeviceFingerprint(ipAddress, userAgent);
  const uaHash = await generateUaHash(userAgent);
  const expiresAt = new Date(
    Date.now() + TRUSTED_DEVICE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  await DB.prepare(
    `INSERT INTO trusted_devices (user_id, token, device_fingerprint, ua_hash, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(userId, token, fingerprint, uaHash, ipAddress, userAgent, expiresAt)
    .run();

  return { token, expiresAt };
}

/**
 * Validate a trusted device token
 * Returns the user_id if valid, null otherwise
 */
export async function validateTrustedDevice(DB, token, ipAddress, userAgent) {
  if (!token) return null;

  const device = await DB.prepare(
    `SELECT id, user_id, device_fingerprint, ua_hash, ip_address, expires_at
     FROM trusted_devices
     WHERE token = ? AND expires_at > datetime('now')`
  )
    .bind(token)
    .first();

  if (!device) return null;

  // Validate IP and UA independently using constant-time comparison
  const currentFingerprint = await generateDeviceFingerprint(ipAddress, userAgent);
  const currentUaHash = await generateUaHash(userAgent);

  const fingerprintMatch = timingSafeStringEqual(
    device.device_fingerprint,
    currentFingerprint,
  );

  // If stored ua_hash exists, validate UA independently (new schema)
  // Otherwise fall back to full fingerprint check (pre-migration rows)
  if (device.ua_hash) {
    const uaMatch = timingSafeStringEqual(device.ua_hash, currentUaHash);
    if (!uaMatch) {
      console.log("[TrustedDevice] UA mismatch, device not trusted");
      return null;
    }
    if (!fingerprintMatch) {
      // UA matches but IP changed — this is normal (DHCP, mobile, VPN)
      // Update stored fingerprint to reflect new IP
      const newFingerprint = currentFingerprint;
      await DB.prepare(
        `UPDATE trusted_devices SET device_fingerprint = ?, ip_address = ? WHERE id = ?`
      ).bind(newFingerprint, ipAddress, device.id).run();
      console.log("[TrustedDevice] IP changed for known UA, updated fingerprint");
    }
  } else if (!fingerprintMatch) {
    console.log("[TrustedDevice] Fingerprint mismatch, device not trusted");
    return null;
  }

  // Update last_used_at and current IP
  await DB.prepare(
    `UPDATE trusted_devices SET last_used_at = datetime('now'), ip_address = ? WHERE id = ?`
  )
    .bind(ipAddress, device.id)
    .run();

  return device.user_id;
}

/**
 * Remove a trusted device by token
 */
export async function revokeTrustedDevice(DB, token) {
  await DB.prepare(`DELETE FROM trusted_devices WHERE token = ?`)
    .bind(token)
    .run();
}

/**
 * Remove all trusted devices for a user (e.g., on password change)
 */
export async function revokeAllTrustedDevices(DB, userId) {
  await DB.prepare(`DELETE FROM trusted_devices WHERE user_id = ?`)
    .bind(userId)
    .run();
}

/**
 * Clean up expired trusted devices
 */
export async function cleanupExpiredDevices(DB) {
  await DB.prepare(
    `DELETE FROM trusted_devices WHERE expires_at <= datetime('now')`
  ).run();
}

/**
 * Create the trusted device cookie string
 */
export function createTrustedDeviceCookie(token, request) {
  const isSecure = !request?.url?.includes("localhost");
  const maxAge = TRUSTED_DEVICE_EXPIRY_DAYS * 24 * 60 * 60;

  const parts = [
    `${TRUSTED_DEVICE_COOKIE_NAME}=${token}`,
    `Path=/`,
    `Max-Age=${maxAge}`,
    `SameSite=Strict`,
  ];

  if (isSecure) {
    parts.push("Secure");
  }

  // HTTPOnly so JavaScript can't access it
  parts.push("HttpOnly");

  return parts.join("; ");
}

/**
 * Create a cookie to delete the trusted device
 */
export function deleteTrustedDeviceCookie(request) {
  const isSecure = !request?.url?.includes("localhost");
  const secure = isSecure ? "Secure; " : "";

  return `${TRUSTED_DEVICE_COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; ${secure}SameSite=Strict; HttpOnly`;
}

/**
 * Get trusted device token from request cookies
 */
export function getTrustedDeviceToken(request) {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === TRUSTED_DEVICE_COOKIE_NAME) {
      return value;
    }
  }

  return null;
}
