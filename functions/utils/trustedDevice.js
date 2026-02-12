// Trusted Device utilities for "Remember this device" MFA feature

const TRUSTED_DEVICE_COOKIE_NAME = "trusted_device";
const TRUSTED_DEVICE_EXPIRY_DAYS = 30;

/**
 * Generate a device fingerprint from IP and User-Agent
 */
async function generateDeviceFingerprint(ipAddress, userAgent) {
  const data = `${ipAddress || "unknown"}:${userAgent || "unknown"}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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
  const expiresAt = new Date(
    Date.now() + TRUSTED_DEVICE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  await DB.prepare(
    `INSERT INTO trusted_devices (user_id, token, device_fingerprint, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(userId, token, fingerprint, ipAddress, userAgent, expiresAt)
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
    `SELECT id, user_id, device_fingerprint, ip_address, expires_at
     FROM trusted_devices
     WHERE token = ? AND expires_at > datetime('now')`
  )
    .bind(token)
    .first();

  if (!device) return null;

  // Validate device fingerprint (strict match)
  const currentFingerprint = await generateDeviceFingerprint(ipAddress, userAgent);

  if (device.device_fingerprint !== currentFingerprint) {
    console.log("[TrustedDevice] Fingerprint mismatch, device not trusted");
    return null;
  }

  // Update last_used_at
  await DB.prepare(
    `UPDATE trusted_devices SET last_used_at = datetime('now') WHERE id = ?`
  )
    .bind(device.id)
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
