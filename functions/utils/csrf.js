// CSRF protection utilities for Cloudflare Workers
// Implements double-submit cookie pattern

/**
 * Timing-safe string comparison to prevent timing attacks
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings are equal
 */
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Generate a CSRF token
 * @returns {string} CSRF token
 */
export function generateCSRFToken() {
  return crypto.randomUUID();
}

/**
 * Set CSRF token cookie
 * @param {string} token - CSRF token
 * @param {Request} request - Request object to detect environment
 * @returns {string} Set-Cookie header value
 */
export function setCSRFCookie(token, request = null) {
  // Detect dev environment from request origin
  const isDev = request
    ? (request.headers.get("Origin") || "").includes("localhost") ||
      (request.url || "").includes("localhost")
    : false;

  // CSRF cookie is NOT HttpOnly so JavaScript can read it
  // This is intentional for the double-submit pattern
  const secure = isDev ? "" : "Secure; ";
  const sameSite = isDev ? "Lax" : "Strict";

  return `csrf_token=${token}; Path=/; Max-Age=1800; ${secure}SameSite=${sameSite}`;
}

/**
 * Delete CSRF token cookie
 * @param {Request} request - Request object to detect environment
 * @returns {string} Set-Cookie header value
 */
export function deleteCSRFCookie(request = null) {
  const isDev = request
    ? (request.headers.get("Origin") || "").includes("localhost") ||
      (request.url || "").includes("localhost")
    : false;

  const secure = isDev ? "" : "Secure; ";
  const sameSite = isDev ? "Lax" : "Strict";

  return `csrf_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; ${secure}SameSite=${sameSite}`;
}

/**
 * Validate CSRF token from request
 * @param {Request} request - Request object
 * @returns {boolean} True if valid
 */
export function validateCSRFToken(request) {
  // Get CSRF token from cookie
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) {
    return false;
  }

  const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
    const [name, value] = cookie.trim().split("=");
    if (name && value) {
      acc[name] = value;
    }
    return acc;
  }, {});

  const cookieToken = cookies["csrf_token"];

  // Get CSRF token from header (sent by client)
  const headerToken = request.headers.get("X-CSRF-Token");


  // Both must exist and match (using timing-safe comparison)
  return Boolean(
    cookieToken && headerToken && timingSafeEqual(cookieToken, headerToken)
  );
}

/**
 * Middleware to validate CSRF for state-changing methods
 * @param {Request} request - Request object
 * @returns {Response|null} Error response or null if valid
 */
export function validateCSRFMiddleware(request) {
  // Only check CSRF for state-changing methods
  const method = request.method.toUpperCase();
  if (!["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    return null; // GET, HEAD, OPTIONS don't need CSRF check
  }

  // Skip CSRF check for auth endpoints (they use different protection)
  const url = new URL(request.url);
  if (url.pathname.includes("/api/admin/auth/")) {
    return null;
  }

  if (!validateCSRFToken(request)) {
    const csrfToken = generateCSRFToken();
    const headers = new Headers({
      "Content-Type": "application/json",
    });
    headers.append("Set-Cookie", setCSRFCookie(csrfToken, request));

    return new Response(
      JSON.stringify({
        error: "CSRF validation failed",
        message: "Invalid or missing CSRF token",
      }),
      {
        status: 403,
        headers,
      }
    );
  }

  return null; // Valid
}
