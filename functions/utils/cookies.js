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
  const {
    maxAge = 1800, // 30 minutes default
    path = "/",
    httpOnly = true,
    secure = true,
    sameSite = "Strict",
  } = options;

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
 * @param {string} path - Cookie path (must match the path used when setting)
 * @returns {string} Set-Cookie header value
 */
export function deleteCookie(name, path = "/") {
  return `${name}=; Path=${path}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict`;
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
 * @returns {string} Set-Cookie header value
 */
export function setSessionCookie(sessionToken, rememberMe = false) {
  const maxAge = rememberMe ? 7 * 24 * 60 * 60 : 30 * 60; // 7 days or 30 minutes

  return setSecureCookie("session_token", sessionToken, {
    maxAge,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
  });
}

/**
 * Delete session cookie
 * @returns {string} Set-Cookie header value
 */
export function deleteSessionCookie() {
  return deleteCookie("session_token");
}
