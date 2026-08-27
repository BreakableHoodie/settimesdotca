// Secure cookie management utilities for Cloudflare Workers
// Implements HTTPOnly cookies with SameSite and Secure flags

// A malformed percent-escape makes decodeURIComponent THROW, not return garbage:
// `decodeURIComponent("abc%")` raises URIError. A client fully controls its Cookie
// header, so without this a request carrying `session_token=abc%` turned every caller
// into a 500 instead of an ordinary "no valid cookie" 401 -- and since the admin
// middleware now asks for a session cookie on its very first line, that was reachable
// on every /api/admin/* request. An undecodable value falls back to its raw form: it
// will not match a real credential, which is the correct outcome, and the request is
// rejected on its merits rather than crashing.
function decodeCookieValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Parse cookies from a Cookie header. THE canonical cookie parser for functions/.
 *
 * There were four, and they disagreed. auth.js's readSessionCookie trimmed the cookie
 * name and joined on "="; this one, csrf.js's private copy and trustedDevice.js's
 * inline loop each did neither. Two parsers disagreeing about whether a session cookie
 * is PRESENT is how a credential slips past a presence check -- `__Host-session_token
 * =abc` was invisible to getCookie while the session layer read it fine. All four are
 * now this function, and cookieParserUniqueness.test.js fails if a fifth appears.
 *
 * @param {string} cookieHeader - Cookie header value
 * @returns {Object} Parsed cookies as key-value pairs
 */
export function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(";").reduce((cookies, cookie) => {
    // The NAME is trimmed, not just the pair. Trimming only the pair leaves interior
    // whitespace on the name -- `__Host-session_token =abc` keyed the map on
    // "__Host-session_token " (trailing space), so getCookie returned undefined while
    // lucia.readSessionCookie, which compares k.trim(), returned "abc". Two parsers
    // disagreeing about whether a session cookie is present is how a credential slips
    // past a presence check; RFC 6265 does not permit that whitespace anyway.
    const [rawName, ...rest] = cookie.split("=");
    const name = rawName.trim();
    // rest.join("="), not a second destructured element: a cookie VALUE may legally
    // contain "=" (base64 padding is the everyday case), and `const [n, v] = split("=")`
    // silently truncated it at the first one.
    const value = rest.join("=").trim();
    if (name && value) {
      cookies[name] = decodeCookieValue(value);
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
