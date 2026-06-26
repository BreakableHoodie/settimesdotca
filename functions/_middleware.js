// Shared middleware for Cloudflare Pages Functions
// Handles CORS, rate limiting, error handling, and common headers

import {
  checkRateLimit,
  rateLimitHeaders,
  rateLimitResponse,
} from './utils/rateLimit.js';
import { createRequestLogger } from './utils/logger.js';

export async function onRequest(context) {
  const { request, env } = context;

  // Only process API routes - let static files pass through without middleware
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) {
    return context.next();
  }

  const log = createRequestLogger(context);

  // Allowed origins for CORS (production and development)
  const baseAllowedOrigins = [
    'https://settimes.ca',
    'https://www.settimes.ca',
    'https://dev.settimesdotca.pages.dev',
    'https://settimesdotca.pages.dev',
    'https://dev.settimes.ca',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8788',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8788',
  ];
  const envAllowedOrigins = (env?.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const ALLOWED_ORIGINS = Array.from(
    new Set([...baseAllowedOrigins, ...envAllowedOrigins])
  );

  // SECURITY: Check if origin is allowed
  const origin = request.headers.get('Origin');

  // Only set CORS headers if origin is explicitly allowed
  const corsHeaders = {};
  if (ALLOWED_ORIGINS.includes(origin)) {
    corsHeaders['Access-Control-Allow-Origin'] = origin;
    corsHeaders['Access-Control-Allow-Methods'] =
      'GET, POST, PUT, DELETE, OPTIONS';
    corsHeaders['Access-Control-Allow-Headers'] =
      'Content-Type, Authorization, X-CSRF-Token';
    corsHeaders['Access-Control-Max-Age'] = '86400';
    corsHeaders['Access-Control-Allow-Credentials'] = 'true';
  } else if (!origin) {
    // Same-origin request (no Origin header) - allow
    // Browser will handle same-origin policy
  } else {
    // Origin provided but not in allowed list - reject
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Rate limiting for public APIs
  const rateLimit = await checkRateLimit(request, env);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit, corsHeaders);
  }

  // Basic request size guard for non-upload API requests (1MB)
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    const contentType = request.headers.get('Content-Type') || '';
    const isMultipart = contentType.includes('multipart/form-data');
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (!isMultipart && contentLength > 1_000_000) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  }

  const cspEnforce =
    env?.CSP_ENFORCE !== undefined && env?.CSP_ENFORCE !== null
      ? env?.CSP_ENFORCE === 'true'
      : env?.ENVIRONMENT === 'production';

  // Single source of truth for the Content-Security-Policy (reused on both the
  // success and error responses below).
  //   - script-src/frame-src/connect-src allow https://challenges.cloudflare.com
  //     for Cloudflare Turnstile (per its CSP docs); no 'unsafe-inline' needed.
  //   - the inline theme-flash bootstrap in frontend/index.html is permitted by
  //     its sha256 hash — REGENERATE this hash if that <script> ever changes
  //     (openssl/Node sha256 over the exact script body, base64).
  //   - worker-src 'self' permits the /sw.js service worker (main.jsx registers it).
  // NOTE: this strict policy (no 'unsafe-inline') is incompatible with Cloudflare
  // Rocket Loader, which rewrites/inline-executes scripts. Rocket Loader must stay
  // DISABLED for this zone or it will trip "Refused to execute inline script".
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com 'sha256-AthfpLUxHMTHKKJhjnay6WvKZb8lWKmb3ca+GM+ZrkI='",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://challenges.cloudflare.com",
    "object-src 'none'",
    "frame-src 'self' https://challenges.cloudflare.com",
    "child-src 'self' https://challenges.cloudflare.com",
    "worker-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  // Enable FK enforcement for this D1 session. SQLite disables it by default;
  // this must be set per-connection so it applies to every handler in this request.
  // Placed after all early returns so preflights and rejected origins don't pay
  // a D1 round-trip.
  //
  // SECURITY: FK constraints only matter for writes (INSERT/UPDATE/DELETE). GET
  // and HEAD are read-only by HTTP semantics and cannot violate them, so skip
  // the PRAGMA round-trip for those to speed up read paths (e.g. the landing
  // page). The guard is a strict allowlist of read-only methods — anything else
  // (POST/PUT/PATCH/DELETE or an unknown method) still gets FK enforcement, so
  // the invariant holds for every mutation. Do NOT widen this to skip writes.
  const isReadOnlyMethod =
    request.method === 'GET' || request.method === 'HEAD';
  if (env.DB && !isReadOnlyMethod) {
    await env.DB.prepare('PRAGMA foreign_keys = ON').run();
  }

  try {
    const startTime = Date.now();

    // Continue to the next middleware/handler
    const response = await context.next();

    const duration = Date.now() - startTime;

    // Log the completed request
    log.info(`Request completed: ${request.method} ${url.pathname}`, {
      status: response.status,
      durationMs: duration,
    });

    // Add CORS and rate limit headers to response
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });
    Object.entries(rateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });

    // Traceability: Add Request ID to response headers
    newHeaders.set('X-Request-ID', log.getRequestId());

    // Security headers
    newHeaders.set('X-Content-Type-Options', 'nosniff');
    newHeaders.set('X-Frame-Options', 'DENY');
    newHeaders.set('Referrer-Policy', 'no-referrer');
    newHeaders.set(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=()'
    );
    if (cspEnforce) {
      newHeaders.set('Content-Security-Policy', csp);
    } else {
      newHeaders.set('Content-Security-Policy-Report-Only', csp);
    }
    if (request.url.startsWith('https://')) {
      newHeaders.set(
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains; preload'
      );
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    log.error('Middleware error', { error });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'no-referrer',
          'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
          ...(cspEnforce
            ? { 'Content-Security-Policy': csp }
            : { 'Content-Security-Policy-Report-Only': csp }),
        },
      }
    );
  }
}
