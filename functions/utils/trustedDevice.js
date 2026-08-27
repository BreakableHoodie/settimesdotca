// Trusted Device utilities for "Remember this device" MFA feature
import { isDevRequest } from "./auth.js";
import { toSqliteDateTime } from "./authAttempts.js";
import { logger } from "./logger.js";
import { getCookie } from "./cookies.js";

// __Host- prefix enforces Secure + Path=/ + no Domain, preventing subdomain injection.
// Must align with the name used in getTrustedDeviceToken's cookie parsing.
const TRUSTED_DEVICE_COOKIE_NAME_SECURE = "__Host-trusted_device";
const TRUSTED_DEVICE_COOKIE_NAME_DEV = "trusted_device";
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
  // Include length inequality in diff to prevent timing oracle on hash length.
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
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

async function hashTrustedDeviceToken(token) {
  return sha256Hex(token);
}

/**
 * Create a trusted device entry in the database
 */
export async function createTrustedDevice(DB, userId, ipAddress, userAgent) {
  const token = generateTrustedDeviceToken();
  const tokenHash = await hashTrustedDeviceToken(token);
  const fingerprint = await generateDeviceFingerprint(ipAddress, userAgent);
  const uaHash = await generateUaHash(userAgent);
  // Store in SQLite datetime format (space separator, no T/Z) so that
  // TEXT comparisons against datetime('now') are lexicographically correct.
  // ISO 8601 with 'T' compares greater than space-separated format at the
  // same instant, which would allow expired devices to pass validation.
  const expiresAt = toSqliteDateTime(new Date(Date.now() + TRUSTED_DEVICE_EXPIRY_DAYS * 24 * 60 * 60 * 1000));

  await DB.prepare(
    `INSERT INTO trusted_devices (user_id, token, device_fingerprint, ua_hash, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(userId, tokenHash, fingerprint, uaHash, ipAddress, userAgent, expiresAt)
    .run();

  return { token, expiresAt };
}

/**
 * Validate a trusted device token
 * Returns the user_id if valid, null otherwise
 */
export async function validateTrustedDevice(DB, token, ipAddress, userAgent) {
  if (!token) return null;

  const tokenHash = await hashTrustedDeviceToken(token);

  const device = await DB.prepare(
    `SELECT id, user_id, token, device_fingerprint, ua_hash, ip_address, expires_at
     FROM trusted_devices
     WHERE token = ? AND expires_at > datetime('now')`,
  )
    .bind(tokenHash)
    .first();

  if (!device) return null;

  // Trust policy:
  //   New rows (ua_hash present): UA must match; IP change is tolerated (DHCP, mobile, VPN).
  //   Legacy rows (no ua_hash):   full IP+UA fingerprint must match.
  //
  // ACCEPTED RISK (conscious tradeoff): tolerating IP changes means a stolen
  // trusted-device token replayed from a different network still validates, as
  // long as the attacker also presents the same User-Agent string. We accept
  // this because:
  //   1. The token is the primary factor — a 256-bit secret, hashed at rest
  //      (hashTrustedDeviceToken), delivered over a Secure/HttpOnly cookie and
  //      expiring after a bounded window. IP/UA are only weak secondary signals.
  //   2. Pinning to IP would reject a large fraction of legitimate logins
  //      (mobile handoff, CGNAT/DHCP churn, corporate VPNs), pushing users back
  //      through full MFA constantly and eroding the feature's value.
  //   3. Trusted-device only skips the MFA *second factor* on an already
  //      password-authenticated login — it is not a standalone credential.
  // If the threat model tightens (e.g. admin-only high-value accounts), revisit
  // by adding IP-range/ASN checks rather than exact-IP pinning.
  const currentFingerprint = await generateDeviceFingerprint(ipAddress, userAgent);
  const currentUaHash = await generateUaHash(userAgent);

  const fingerprintMatch = timingSafeStringEqual(device.device_fingerprint, currentFingerprint);

  if (device.ua_hash) {
    const uaMatch = timingSafeStringEqual(device.ua_hash, currentUaHash);
    if (!uaMatch) {
      logger.debug("trusted device UA mismatch, device not trusted", {
        userId: device.user_id,
      });
      return null;
    }
    if (!fingerprintMatch) {
      // UA matches but IP changed — normal for DHCP, mobile, VPN users.
      // Fingerprint is refreshed in the update below.
      logger.debug("trusted device IP changed for known UA, refreshing fingerprint", { userId: device.user_id });
    }
  } else if (!fingerprintMatch) {
    logger.debug("trusted device fingerprint mismatch, device not trusted", {
      userId: device.user_id,
    });
    return null;
  }

  // Always refresh last_used_at; also refresh IP and fingerprint so they stay current
  await DB.prepare(
    `UPDATE trusted_devices SET last_used_at = datetime('now'), ip_address = ?, device_fingerprint = ? WHERE id = ?`,
  )
    .bind(ipAddress, currentFingerprint, device.id)
    .run();

  return device.user_id;
}

/**
 * Remove all trusted devices for a user (e.g., on password change)
 */
export async function revokeAllTrustedDevices(DB, userId) {
  await DB.prepare(`DELETE FROM trusted_devices WHERE user_id = ?`).bind(userId).run();
}

/**
 * Create the trusted device cookie string.
 * Uses __Host- prefix in production to enforce Secure + Path=/ and prevent subdomain injection.
 */
export function createTrustedDeviceCookie(token, request, env) {
  const isDev = isDevRequest(request, env);
  const cookieName = isDev ? TRUSTED_DEVICE_COOKIE_NAME_DEV : TRUSTED_DEVICE_COOKIE_NAME_SECURE;
  const maxAge = TRUSTED_DEVICE_EXPIRY_DAYS * 24 * 60 * 60;

  const parts = [`${cookieName}=${token}`, `Path=/`, `Max-Age=${maxAge}`, `SameSite=Strict`, `HttpOnly`];

  if (!isDev) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

/**
 * Get trusted device token from request cookies
 */
export function getTrustedDeviceToken(request) {
  // getCookie, not a fourth inline parser. The hand-rolled loop this replaces did not
  // trim the cookie name and truncated any value containing "=", so a token was
  // silently unreadable for shapes the session layer handled fine.
  return getCookie(request, TRUSTED_DEVICE_COOKIE_NAME_SECURE) || getCookie(request, TRUSTED_DEVICE_COOKIE_NAME_DEV);
}
