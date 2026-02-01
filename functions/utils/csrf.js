// CSRF protection utilities for Cloudflare Workers
// Uses csrf-csrf double-submit cookie strategy

import { doubleCsrf } from "csrf-csrf";

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((acc, cookie) => {
    const [name, value] = cookie.trim().split("=");
    if (name && value) {
      acc[name] = value;
    }
    return acc;
  }, {});
}

function isDevRequest(request) {
  if (!request) return false;
  const origin = request.headers.get("Origin") || "";
  return origin.includes("localhost") || (request.url || "").includes("localhost");
}

function getHeaderToken(request) {
  return request.headers.get("X-CSRF-Token") || "";
}

// Fallback secret for local development ONLY - production must set CSRF_SECRET
const LOCAL_DEV_CSRF_SECRET = "local-dev-csrf-secret-not-for-production";

function resolveCsrfSecret(env, request) {
  const secret = env?.CSRF_SECRET;
  if (secret) {
    return secret;
  }

  // Check if this is local development
  const isLocal = request && isDevRequest(request);
  if (isLocal) {
    console.warn("[CSRF] Using fallback secret for local development. Set CSRF_SECRET for production.");
    return LOCAL_DEV_CSRF_SECRET;
  }

  // Production requires CSRF_SECRET
  console.error("[CSRF] CSRF_SECRET environment variable is required in production");
  throw new Error("CSRF_SECRET environment variable is required");
}

function getSessionIdentifier(request, cookies, sessionIdentifierOverride) {
  if (sessionIdentifierOverride) {
    return sessionIdentifierOverride;
  }
  return (
    cookies.session_token ||
    request.headers.get("Authorization")?.replace("Bearer ", "") ||
    request.headers.get("CF-Connecting-IP") ||
    "anonymous"
  );
}

export function getCookieConfig(request) {
  const isDev = isDevRequest(request);
  return {
    httpOnly: false,
    secure: !isDev,
    sameSite: isDev ? "lax" : "strict",
    path: "/",
    maxAge: 60 * 30,
  };
}

const csrf = doubleCsrf({
  getSecret: (request) => request.csrfSecret,
  getSessionIdentifier: (request) => request.sessionIdentifier,
  cookieName: "csrf_token",
  cookieOptions: getCookieConfig(),
  size: 64,
  getCsrfTokenFromRequest: getHeaderToken,
});

function buildRequestAdapter(request, env, sessionIdentifierOverride = null) {
  const cookieHeader = request.headers.get("Cookie");
  const cookies = parseCookies(cookieHeader);
  const csrfHeaderValue = request.headers.get("X-CSRF-Token") || "";

  // Create a headers object with a get() method that csrf-csrf expects
  const headersAdapter = {
    "x-csrf-token": csrfHeaderValue,
    get(name) {
      return this[name.toLowerCase()] || null;
    },
  };

  return {
    method: request.method,
    headers: headersAdapter,
    cookies,
    csrfSecret: resolveCsrfSecret(env, request),
    sessionIdentifier: getSessionIdentifier(
      request,
      cookies,
      sessionIdentifierOverride
    ),
  };
}

export function generateCSRFToken(request, env, sessionIdentifierOverride = null) {
  const req = buildRequestAdapter(request, env, sessionIdentifierOverride);
  const res = {
    cookie: () => {},
  };
  return csrf.generateCsrfToken(req, res, {
    cookieOptions: getCookieConfig(request),
    overwrite: true,
  });
}

function serializeCookie(name, value, options) {
  const parts = [`${name}=${value}`];
  if (options?.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options?.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  if (options?.expires) {
    parts.push(`Expires=${options.expires}`);
  }
  if (options?.secure) {
    parts.push("Secure");
  }
  if (options?.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options?.sameSite) {
    const sameSite =
      options.sameSite === "none"
        ? "None"
        : options.sameSite === "lax"
          ? "Lax"
          : "Strict";
    parts.push(`SameSite=${sameSite}`);
  }
  return parts.join("; ");
}

export function setCSRFCookie(token, request = null) {
  const options = getCookieConfig(request);
  return serializeCookie("csrf_token", token, {
    ...options,
    httpOnly: false,
  });
}

export function deleteCSRFCookie(request = null) {
  const options = getCookieConfig(request);
  const secure = options.secure ? "Secure; " : "";
  const sameSite =
    options.sameSite === "none" ? "None" : options.sameSite === "lax" ? "Lax" : "Strict";
  return `csrf_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; ${secure}SameSite=${sameSite}`;
}

export function validateCSRFToken(request, env = null) {
  try {
    const req = buildRequestAdapter(request, env);
    return csrf.validateRequest(req);
  } catch (error) {
    console.error("[CSRF] Validation error");
    return false;
  }
}

export function validateCSRFMiddleware(request, env = null) {
  const method = request.method.toUpperCase();
  if (!["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    return null;
  }

  const url = new URL(request.url);
  if (url.pathname.includes("/api/admin/auth/")) {
    return null;
  }

  if (!validateCSRFToken(request, env)) {
    const csrfToken = generateCSRFToken(request, env);
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

  return null;
}
