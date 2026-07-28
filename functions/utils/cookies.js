// Secure cookie management utilities for Cloudflare Workers
// Implements HTTPOnly cookies with SameSite and Secure flags

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
