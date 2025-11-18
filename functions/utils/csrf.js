// CSRF protection utilities for Cloudflare Workers
// Implements double-submit cookie pattern

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
 * @returns {string} Set-Cookie header value
 */
export function setCSRFCookie(token) {
  // CSRF cookie is NOT HttpOnly so JavaScript can read it
  // This is intentional for the double-submit pattern
  return `csrf_token=${token}; Path=/; Max-Age=1800; Secure; SameSite=Strict`;
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

  // Both must exist and match
  return cookieToken && headerToken && cookieToken === headerToken;
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
    return new Response(
      JSON.stringify({
        error: "CSRF validation failed",
        message: "Invalid or missing CSRF token",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return null; // Valid
}
