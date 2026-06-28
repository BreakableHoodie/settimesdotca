// Rate limiting utility for Cloudflare Workers
//
// Two strategies are used depending on endpoint sensitivity:
//
// 1. D1-backed (globally consistent) — used for FAIL_CLOSED_PATTERNS (auth, subscriptions).
//    D1 is a globally-replicated SQLite database, so counters are shared across all
//    Cloudflare PoPs. This prevents distributed brute-force attacks from bypassing
//    limits by spreading requests across geographic regions.
//
// 2. Cache API (PoP-local) — used for non-sensitive public endpoints (events, schedule,
//    feeds). PoP-local is acceptable here; the goal is DoS protection, not security
//    enforcement, and fail-open behaviour avoids availability impact.

import { logger } from "./logger.js";

const RATE_LIMIT_PREFIX = "rate-limit:";

// Band action endpoints that send email and must be fail-closed with a tight limit.
// Scoped to the /follow|unfollow|confirm-follow suffix so that public GET reads
// (e.g. /api/bands/<name>) are not affected.
const BAND_ACTION_RE =
  /^\/api\/bands\/[^/]+\/(follow|unfollow|confirm-follow)$/;

// Rate limit configurations by endpoint pattern.
// Order matters: more-specific prefixes must appear before less-specific ones.
const RATE_LIMITS = {
  // Admin auth endpoints — tight limits, fail-closed via D1
  "/api/admin/auth/login": { requests: 5, window: 60 }, // 5 per minute
  "/api/admin/auth/signup": { requests: 3, window: 300 }, // 3 per 5 min
  "/api/admin/auth/": { requests: 10, window: 60 }, // logout, MFA, etc.

  // Other admin CRUD — generous limit for legitimate editor activity
  "/api/admin/": { requests: 300, window: 60 },

  // Public API endpoints
  "/api/events": { requests: 60, window: 60 },
  "/api/schedule/share/": { requests: 60, window: 60 }, // GET /api/schedule/share/[slug]
  "/api/schedule/share": { requests: 10, window: 60 }, // POST /api/schedule/share
  "/api/schedule": { requests: 30, window: 60 },
  "/api/feeds": { requests: 20, window: 60 },
  "/api/subscriptions": { requests: 10, window: 60 },
  "/api/metrics": { requests: 40, window: 60 },
  "/api/auth/activate": { requests: 10, window: 60 },
  "/api/auth/resend": { requests: 3, window: 300 },

  // Default for unmatched public APIs
  default: { requests: 30, window: 60 },
};

// Endpoints to skip rate limiting
const SKIP_PATTERNS = [
  "/_", // Cloudflare internal
];

// Endpoints where a rate-limit failure blocks the request (fail closed).
// These use D1 for globally-consistent counters.
const FAIL_CLOSED_PATTERNS = [
  "/api/admin/auth/",
  "/api/auth/",
  "/api/subscriptions",
];

function shouldFailClosed(pathname) {
  return (
    BAND_ACTION_RE.test(pathname) ||
    FAIL_CLOSED_PATTERNS.some((pattern) => pathname.startsWith(pattern))
  );
}

/**
 * Get rate limit config for a path
 */
function getRateLimitConfig(pathname) {
  // Check skip patterns
  for (const pattern of SKIP_PATTERNS) {
    if (pathname.startsWith(pattern)) {
      return null;
    }
  }

  // Only rate limit /api/ routes
  if (!pathname.startsWith("/api/")) {
    return null;
  }

  // Band action endpoints (follow/unfollow/confirm-follow) — checked before the
  // prefix loop so that the tight fail-closed limit takes precedence over 'default'.
  if (BAND_ACTION_RE.test(pathname)) return { requests: 5, window: 300 };

  // Find matching config
  for (const [pattern, config] of Object.entries(RATE_LIMITS)) {
    if (pattern !== "default" && pathname.startsWith(pattern)) {
      return config;
    }
  }

  return RATE_LIMITS.default;
}

/**
 * Generate a stable key for rate limiting (IP + endpoint base path).
 * Auth sub-routes and band action endpoints use 5 segments so each action
 * (login, signup, follow, confirm-follow, etc.) gets a distinct D1 key.
 */
function getRateLimitKey(ip, pathname) {
  const depth =
    pathname.startsWith("/api/admin/auth/") ||
    pathname.startsWith("/api/auth/") ||
    BAND_ACTION_RE.test(pathname)
      ? 5
      : 4;
  const basePath = pathname.split("/").slice(0, depth).join("/");
  return `${ip}:${basePath}`;
}

/**
 * D1-backed rate limit check for security-sensitive endpoints.
 * Globally consistent across all Cloudflare PoPs.
 */
async function checkRateLimitD1(DB, ip, pathname, config) {
  const now = Math.floor(Date.now() / 1000);
  const key = getRateLimitKey(ip, pathname);

  try {
    // Atomically upsert: insert on first request, or increment/reset on subsequent ones.
    // The CASE expression resets the window when it has expired.
    await DB.prepare(
      `
      INSERT INTO rate_limits (key, count, window_start, updated_at)
      VALUES (?1, 1, ?2, ?2)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN (?2 - window_start) >= ?3 THEN 1 ELSE count + 1 END,
        window_start = CASE WHEN (?2 - window_start) >= ?3 THEN ?2 ELSE window_start END,
        updated_at = ?2
    `,
    )
      .bind(key, now, config.window)
      .run();

    const row = await DB.prepare(
      "SELECT count, window_start FROM rate_limits WHERE key = ?",
    )
      .bind(key)
      .first();

    const count = row?.count ?? 1;
    const windowStart = row?.window_start ?? now;
    const remaining = Math.max(0, config.requests - count);
    const resetAt = windowStart + config.window;

    return {
      allowed: count <= config.requests,
      remaining,
      resetAt,
      limit: config.requests,
    };
  } catch (error) {
    logger.error("D1 rate limit check failed on sensitive endpoint", {
      error,
      ip,
      pathname,
    });
    // Fail closed: block the request when the counter is unavailable.
    return {
      allowed: false,
      remaining: 0,
      resetAt: now + config.window,
      limit: config.requests,
    };
  }
}

/**
 * Generate cache key for Cache API rate limiting
 */
function getCacheKey(ip, pathname) {
  // Normalize path to endpoint base
  const basePath = pathname.split("/").slice(0, 4).join("/");
  return `https://rate-limit.internal/${RATE_LIMIT_PREFIX}${ip}:${basePath}`;
}

/**
 * Check and update rate limit.
 * Uses D1 for fail-closed (auth/subscription) endpoints, Cache API for others.
 *
 * @param {Request} request
 * @param {object|null} env - Cloudflare env bindings (provides env.DB for D1)
 * @returns {{ allowed: boolean, remaining: number, resetAt: number, limit?: number }}
 */
export async function checkRateLimit(request, env = null) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const config = getRateLimitConfig(pathname);
  if (!config) {
    return { allowed: true, remaining: -1, resetAt: 0 };
  }

  // Get client IP (Cloudflare provides this)
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown";

  // Loopback IPs (127.0.0.1/::1) only appear in wrangler dev / CI, where miniflare
  // injects the socket's local address. Skip rate limiting entirely — no real IP is available.
  if (ip === "127.0.0.1" || ip === "::1") {
    return { allowed: true, remaining: -1, resetAt: 0 };
  }

  // In production, CF-Connecting-IP is always present. If both IP headers are absent,
  // fail closed on auth endpoints (misconfiguration safety) and fail open elsewhere.
  if (ip === "unknown") {
    if (shouldFailClosed(pathname)) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: Math.floor(Date.now() / 1000) + 60,
        limit: config.requests,
      };
    }
    return { allowed: true, remaining: -1, resetAt: 0 };
  }

  // Security-sensitive endpoints use D1 for globally-consistent counters.
  if (shouldFailClosed(pathname) && env?.DB) {
    return await checkRateLimitD1(env.DB, ip, pathname, config);
  }

  // Non-sensitive endpoints (or D1 unavailable in local dev): use Cache API.
  const cacheKey = getCacheKey(ip, pathname);
  const cache = caches.default;
  const now = Math.floor(Date.now() / 1000);

  try {
    // Try to get existing rate limit data
    const cached = await cache.match(cacheKey);
    let data = { count: 0, windowStart: now };

    if (cached) {
      const text = await cached.text();
      data = JSON.parse(text);

      // Check if window has expired
      if (now - data.windowStart >= config.window) {
        // Reset window
        data = { count: 0, windowStart: now };
      }
    }

    // Increment counter
    data.count++;

    // Calculate remaining and reset time
    const remaining = Math.max(0, config.requests - data.count);
    const resetAt = data.windowStart + config.window;

    // Store updated data
    const response = new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `max-age=${config.window}`,
      },
    });

    await cache.put(cacheKey, response);

    return {
      allowed: data.count <= config.requests,
      remaining,
      resetAt,
      limit: config.requests,
    };
  } catch (error) {
    // Fail open for non-sensitive endpoints to avoid availability impact.
    logger.warn("Rate limit check failed", { error, ip });
    return { allowed: true, remaining: -1, resetAt: 0 };
  }
}

/**
 * Create rate limit headers
 */
export function rateLimitHeaders(result) {
  if (result.remaining < 0) {
    return {};
  }

  return {
    "X-RateLimit-Limit": String(result.limit || 30),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetAt),
  };
}

/**
 * Create 429 Too Many Requests response
 */
export function rateLimitResponse(result, corsHeaders = {}) {
  const retryAfter = Math.max(
    1,
    result.resetAt - Math.floor(Date.now() / 1000),
  );

  return new Response(
    JSON.stringify({
      error: "Too many requests",
      message: "Rate limit exceeded. Please try again later.",
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
        ...rateLimitHeaders(result),
        ...corsHeaders,
      },
    },
  );
}
