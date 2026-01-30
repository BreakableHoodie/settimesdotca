// Rate limiting utility using Cloudflare Cache API
// No KV binding required - uses the Cache API as a distributed counter

import { logger } from './logger.js';

const RATE_LIMIT_PREFIX = 'rate-limit:';

// Rate limit configurations by endpoint pattern
const RATE_LIMITS = {
  // Public API endpoints
  '/api/events': { requests: 60, window: 60 },      // 60 req/min
  '/api/schedule': { requests: 30, window: 60 },    // 30 req/min
  '/api/feeds': { requests: 20, window: 60 },       // 20 req/min
  '/api/subscriptions': { requests: 10, window: 60 }, // 10 req/min (signup)
  '/api/metrics': { requests: 100, window: 60 },    // 100 req/min (beacons)
  '/api/auth/activate': { requests: 10, window: 60 }, // 10 req/min
  '/api/auth/resend': { requests: 3, window: 300 },  // 3 per 5 min

  // Default for unmatched public APIs
  'default': { requests: 30, window: 60 },
};

// Endpoints to skip rate limiting
const SKIP_PATTERNS = [
  '/api/admin/',  // Admin APIs use session auth
  '/_',           // Cloudflare internal
];

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
  if (!pathname.startsWith('/api/')) {
    return null;
  }

  // Find matching config
  for (const [pattern, config] of Object.entries(RATE_LIMITS)) {
    if (pattern !== 'default' && pathname.startsWith(pattern)) {
      return config;
    }
  }

  return RATE_LIMITS.default;
}

/**
 * Generate cache key for rate limiting
 */
function getCacheKey(ip, pathname) {
  // Normalize path to endpoint base
  const basePath = pathname.split('/').slice(0, 4).join('/');
  return `https://rate-limit.internal/${RATE_LIMIT_PREFIX}${ip}:${basePath}`;
}

/**
 * Check and update rate limit using Cache API
 * Returns { allowed: boolean, remaining: number, resetAt: number }
 */
export async function checkRateLimit(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const config = getRateLimitConfig(pathname);
  if (!config) {
    return { allowed: true, remaining: -1, resetAt: 0 };
  }

  // Get client IP (Cloudflare provides this)
  const ip = request.headers.get('CF-Connecting-IP') ||
             request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
             'unknown';

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
        'Content-Type': 'application/json',
        'Cache-Control': `max-age=${config.window}`,
      },
    });

    // Use waitUntil if available to not block response
    await cache.put(cacheKey, response);

    return {
      allowed: data.count <= config.requests,
      remaining,
      resetAt,
      limit: config.requests,
    };
  } catch (error) {
    // If rate limiting fails, allow the request (fail open)
    logger.warn('Rate limit check failed', { error, ip });
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
    'X-RateLimit-Limit': String(result.limit || 30),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.resetAt),
  };
}

/**
 * Create 429 Too Many Requests response
 */
export function rateLimitResponse(result, corsHeaders = {}) {
  const retryAfter = Math.max(1, result.resetAt - Math.floor(Date.now() / 1000));

  return new Response(
    JSON.stringify({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        ...rateLimitHeaders(result),
        ...corsHeaders,
      },
    }
  );
}
