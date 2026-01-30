// Secure cookie management utilities for Cloudflare Workers
// Implements HTTPOnly cookies with SameSite and Secure flags

/**
 * Set a secure HTTPOnly cookie
 * @param {string} name - Cookie name
 * @param {string} value - Cookie value
 * @param {Object} options - Cookie options
 * @returns {string} Set-Cookie header value
 */
export function setSecureCookie(name, value, options = {}) {
  // Detect development environment (localhost or wrangler dev)
  const isDev = options.isDev !== undefined ? options.isDev : false;

  // Extract options with defaults
  const maxAge = options.maxAge !== undefined ? options.maxAge : 1800;
  const path = options.path !== undefined ? options.path : "/";
  const httpOnly = options.httpOnly !== undefined ? options.httpOnly : true;

  // Apply dev-specific defaults
  const secure = options.secure !== undefined ? options.secure : !isDev;
  const sameSite =
    options.sameSite !== undefined
      ? options.sameSite
      : isDev
      ? "Lax"
      : "Strict";

  const parts = [`${name}=${value}`];

  if (maxAge) {
    parts.push(`Max-Age=${maxAge}`);
  }

  if (path) {
    parts.push(`Path=${path}`);
  }

  if (httpOnly) {
    parts.push("HttpOnly");
  }

  if (secure) {
    parts.push("Secure");
  }

  if (sameSite) {
    parts.push(`SameSite=${sameSite}`);
  }

  return parts.join("; ");
}

/**
 * Delete a cookie by setting it to expire immediately
 * @param {string} name - Cookie name
 * @param {Object} options - Cookie options
 * @returns {string} Set-Cookie header value
 */
export function deleteCookie(name, options = {}) {
  const path = options.path !== undefined ? options.path : "/";
  const isDev = options.isDev !== undefined ? options.isDev : false;
  const secure = options.secure !== undefined ? options.secure : !isDev;
  const sameSite =
    options.sameSite !== undefined
      ? options.sameSite
      : isDev
      ? "Lax"
      : "Strict";

  const parts = [`${name}=`];
  if (path) {
    parts.push(`Path=${path}`);
  }
  parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  parts.push("HttpOnly");
  if (secure) {
    parts.push("Secure");
  }
  if (sameSite) {
    parts.push(`SameSite=${sameSite}`);
  }

  return parts.join("; ");
}

/**
 * Parse cookies from Cookie header
 * @param {string} cookieHeader - Cookie header value
 * @returns {Object} Parsed cookies as key-value pairs
 */
export function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(";").reduce((cookies, cookie) => {
    const [name, value] = cookie.trim().split("=");
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
    return cookies;
  }, {});
}

/**
 * Get a specific cookie value
 * @param {Request} request - Request object
 * @param {string} name - Cookie name
 * @returns {string|null} Cookie value or null
 */
export function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) {
    return null;
  }

  const cookies = parseCookies(cookieHeader);
  return cookies[name] || null;
}

/**
 * Set session cookie with security defaults
 * @param {string} sessionToken - Session token
 * @param {boolean} rememberMe - Whether to extend expiry
 * @param {Request} request - Request object to detect environment
 * @returns {string} Set-Cookie header value
 */
export function setSessionCookie(
  sessionToken,
  rememberMe = false,
  request = null
) {
  const maxAge = rememberMe ? 7 * 24 * 60 * 60 : 30 * 60; // 7 days or 30 minutes

  // Detect dev environment from request origin
  const isDev = request
    ? (request.headers.get("Origin") || "").includes("localhost") ||
      (request.url || "").includes("localhost")
    : false;

  return setSecureCookie("session_token", sessionToken, {
    maxAge,
    path: "/",
    httpOnly: true,
    isDev, // Pass development flag
  });
}

/**
 * Delete session cookie
 * @returns {string} Set-Cookie header value
 */
export function deleteSessionCookie(request = null) {
  const isDev = request
    ? (request.headers.get("Origin") || "").includes("localhost") ||
      (request.url || "").includes("localhost")
    : false;

  return deleteCookie("session_token", { path: "/", isDev });
}
