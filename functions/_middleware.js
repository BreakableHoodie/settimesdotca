// Shared middleware for Cloudflare Pages Functions
// Handles CORS, rate limiting, error handling, and common headers

import {
  checkRateLimit,
  rateLimitHeaders,
  rateLimitResponse,
} from './utils/rateLimit.js';

export async function onRequest(context) {
  const { request, env } = context;

  // Allowed origins for CORS (production and development)
  const baseAllowedOrigins = [
    "https://settimes.ca",
    "https://www.settimes.ca",
    "https://dev.settimes.pages.dev",
    "https://settimes.pages.dev",
    "https://dev.settimes.ca",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:8788",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8788",
  ];
  const envAllowedOrigins = (env?.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const ALLOWED_ORIGINS = Array.from(
    new Set([...baseAllowedOrigins, ...envAllowedOrigins]),
  );

  // SECURITY: Check if origin is allowed
  const origin = request.headers.get("Origin");

  // Only set CORS headers if origin is explicitly allowed
  const corsHeaders = {};
  if (ALLOWED_ORIGINS.includes(origin)) {
    corsHeaders["Access-Control-Allow-Origin"] = origin;
    corsHeaders["Access-Control-Allow-Methods"] =
      "GET, POST, PUT, DELETE, OPTIONS";
    corsHeaders["Access-Control-Allow-Headers"] =
      "Content-Type, Authorization, X-CSRF-Token";
    corsHeaders["Access-Control-Max-Age"] = "86400";
    corsHeaders["Access-Control-Allow-Credentials"] = "true";
  } else if (!origin) {
    // Same-origin request (no Origin header) - allow
    // Browser will handle same-origin policy
  } else {
    // Origin provided but not in allowed list - reject
    return new Response(
      JSON.stringify({ error: "Origin not allowed" }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Handle preflight requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Rate limiting for public APIs
  const rateLimit = await checkRateLimit(request);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit, corsHeaders);
  }

  // Basic request size guard for non-upload API requests (1MB)
  if (["POST", "PUT", "PATCH"].includes(request.method)) {
    const contentType = request.headers.get("Content-Type") || "";
    const isMultipart = contentType.includes("multipart/form-data");
    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (!isMultipart && contentLength > 1_000_000) {
      return new Response(
        JSON.stringify({ error: "Payload too large" }),
        {
          status: 413,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
  }

  const cspEnforce =
    env?.CSP_ENFORCE !== undefined && env?.CSP_ENFORCE !== null
      ? env?.CSP_ENFORCE === "true"
      : env?.ENVIRONMENT === "production";

  try {
    // Continue to the next middleware/handler
    const response = await context.next();

    // Add CORS and rate limit headers to response
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });
    Object.entries(rateLimitHeaders(rateLimit)).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });

    // Security headers
    newHeaders.set("X-Content-Type-Options", "nosniff");
    newHeaders.set("X-Frame-Options", "DENY");
    newHeaders.set("Referrer-Policy", "no-referrer");
    newHeaders.set(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=()"
    );
    const csp = [
      "default-src 'self'",
      "script-src 'self' https: 'unsafe-inline'",
      "style-src 'self' https: 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data: https:",
      "connect-src 'self' https: wss:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    if (cspEnforce) {
      newHeaders.set("Content-Security-Policy", csp);
    } else {
      newHeaders.set("Content-Security-Policy-Report-Only", csp);
    }
    if (request.url.startsWith("https://")) {
      newHeaders.set(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains; preload"
      );
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    console.error("Middleware error:", error);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
          "Referrer-Policy": "no-referrer",
          "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
          ...(cspEnforce
            ? {
                "Content-Security-Policy":
                  "default-src 'self'; script-src 'self' https: 'unsafe-inline'; style-src 'self' https: 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data: https:; connect-src 'self' https: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
              }
            : {
                "Content-Security-Policy-Report-Only":
                  "default-src 'self'; script-src 'self' https: 'unsafe-inline'; style-src 'self' https: 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data: https:; connect-src 'self' https: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
              }),
        },
      },
    );
  }
}
