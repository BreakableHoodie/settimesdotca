// Shared middleware for Cloudflare Pages Functions
// Handles CORS, rate limiting, error handling, and common headers

import { checkRateLimit, rateLimitHeaders, rateLimitResponse } from "./utils/rateLimit.js";
import { createRequestLogger } from "./utils/logger.js";

export async function onRequest(context) {
  const { request, env } = context;

  // Only process API routes - let static files pass through without middleware
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) {
    return context.next();
  }

  const log = createRequestLogger(context);

  // Allowed origins for CORS (production and development)
  const baseAllowedOrigins = [
    "https://settimes.ca",
    "https://www.settimes.ca",
    "https://dev.settimesdotca.pages.dev",
    "https://settimesdotca.pages.dev",
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
  const ALLOWED_ORIGINS = Array.from(new Set([...baseAllowedOrigins, ...envAllowedOrigins]));

  // SECURITY: Check if origin is allowed
  const origin = request.headers.get("Origin");

  // Only set CORS headers if origin is explicitly allowed
  const corsHeaders = {};
  if (ALLOWED_ORIGINS.includes(origin)) {
    corsHeaders["Access-Control-Allow-Origin"] = origin;
    corsHeaders["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
    corsHeaders["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-CSRF-Token";
    corsHeaders["Access-Control-Max-Age"] = "86400";
    corsHeaders["Access-Control-Allow-Credentials"] = "true";
  } else if (!origin) {
    // Same-origin request (no Origin header) - allow
    // Browser will handle same-origin policy
  } else {
    // Origin provided but not in allowed list - reject
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Handle preflight requests
  if (request.method === "OPTIONS") {
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

  // Request size guard for mutating API requests. #481: parse Content-Length
  // ourselves and count bytes when it's absent/unparseable, instead of
  // trusting `Number(header || 0)`, which silently coerced an ABSENT header
  // to 0 and let a chunked/streamed body of any size sail straight through to
  // handlers like functions/api/metrics.js's unguarded `request.json()`.
  // #495: no request is exempt from this guard anymore. It used to key a
  // blanket multipart exemption solely off the client-supplied Content-Type,
  // so any client could set `Content-Type: multipart/form-data` on e.g.
  // /api/metrics and skip the 1MB limit entirely. Multipart now gets a raised
  // ceiling instead of a bypass, and only on the routes that legitimately
  // need it (#616 added the event poster upload alongside band photos).
  if (["POST", "PUT", "PATCH"].includes(request.method)) {
    const contentType = request.headers.get("Content-Type") || "";
    const isMultipart = contentType.includes("multipart/form-data");

    // The band photo (functions/api/admin/bands/photos.js) and event poster
    // (functions/api/admin/events/posters.js, #616) uploads are the ONLY
    // routes that legitimately accept multipart bodies, and each already
    // enforces its own precise 5MB-per-file limit after parsing formData.
    // Pin the raised ceiling to these exact pathnames — Cloudflare Pages
    // Functions match routes exactly, so this can't be satisfied by a
    // sub-path or a different handler.
    const RAISED_LIMIT_UPLOAD_ROUTES = new Set(["/api/admin/bands/photos", "/api/admin/events/posters"]);
    const isPhotoUpload = isMultipart && RAISED_LIMIT_UPLOAD_ROUTES.has(url.pathname);

    const MAX_BODY_BYTES = 1_000_000;
    // Coarse DoS ceiling, not the business rule: 5MB file + multipart
    // boundary/header overhead + other form fields. The precise 5MB-per-file
    // limit stays enforced in photos.js/posters.js; this guard only needs to
    // reject bodies wildly larger than any real upload could be.
    const MULTIPART_MAX_BODY_BYTES = 6_000_000;
    const maxBodyBytes = isPhotoUpload ? MULTIPART_MAX_BODY_BYTES : MAX_BODY_BYTES;

    const tooLargeResponse = () =>
      new Response(JSON.stringify({ error: "Payload too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });

    // Strict parse: only a plain non-negative decimal integer counts as a
    // usable Content-Length. A bare Number() would coerce "" → 0, "0x10" →
    // 16 and "-1" → -1 into the "trusted" bucket below, letting a malformed
    // CL skip the byte-counting fallback. Anything non-numeric maps to NaN
    // and falls through to counting.
    const rawContentLength = request.headers.get("Content-Length");
    const contentLength =
      rawContentLength !== null && /^\d+$/.test(rawContentLength.trim()) ? Number(rawContentLength) : NaN;

    if (Number.isFinite(contentLength)) {
      // SECURITY: a present, parseable Content-Length can be trusted without
      // reading the body ourselves. Cloudflare's edge enforces HTTP framing
      // against a declared Content-Length — HTTP/1.1 body reads stop at
      // exactly CL bytes, and HTTP/2 treats a CL/DATA-frame-length mismatch
      // as a protocol error and resets the stream. A client cannot declare a
      // small CL and then smuggle a larger body past the edge. The bypass
      // this fix closes is exclusively the CL-absent/unparseable (streamed)
      // case, handled below.
      if (contentLength > maxBodyBytes) {
        return tooLargeResponse();
      }
    } else if (request.body) {
      // No usable Content-Length (chunked/streamed request) — count actual
      // bytes as they arrive instead of trusting a header that isn't there.
      // We read from a CLONE of the request: Request.clone() tees the
      // underlying ReadableStream, so bytes we pull here are also
      // queued for the original body that the real handler will read later —
      // cancelling our (cloned) reader does not affect the original. We
      // deliberately never buffer the body ourselves (no arrayBuffer()/
      // text()/concatenation) — only `value.byteLength` is accumulated — so
      // this guard can't become a memory-DoS amplifier; the tee holds at
      // most ~maxBodyBytes plus one in-flight chunk before we bail.
      const reader = request.clone().body.getReader();
      let totalBytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > maxBodyBytes) {
            // Best-effort cleanup, deliberately NOT awaited: on a teed
            // stream, cancelling one branch leaves the cancel promise
            // pending until the other branch is also cancelled/closed
            // (awaiting could hang the request forever), and on an errored
            // stream it can reject (awaiting would bounce us into the catch
            // below and fail OPEN a request we just proved oversized —
            // reopening the #481 bypass). Cleanup must never change the
            // outcome: the 413 is already decided by the byte count.
            reader.cancel().catch(() => {});
            return tooLargeResponse();
          }
        }
      } catch (error) {
        // Fail open: this guard exists to stop DoS payloads, not to police
        // well-behaved clients. This catch is only reachable BELOW the limit
        // (an over-limit total already returned 413 above), so the exposure
        // is bounded. And a source error propagates to BOTH tee branches, so
        // a request landing here cannot have its body successfully read
        // downstream either — the handler's own read fails and surfaces its
        // own error, with better attribution than a spurious 413/500 from us.
        log.warn("Body-size guard: stream read failed, passing request through", {
          error,
          method: request.method,
          path: url.pathname,
          // A malformed (vs. absent) Content-Length is inherently suspicious —
          // no legitimate client sends one. Logged with the applied limit so
          // abuse probes are distinguishable from ordinary aborted uploads.
          rawContentLength,
          maxBodyBytes,
          // How far we got before the read failed — distinguishes a benign
          // early client abort from a stream that died near the limit.
          totalBytes,
        });
      }
    }
  }

  const cspEnforce =
    env?.CSP_ENFORCE !== undefined && env?.CSP_ENFORCE !== null
      ? env?.CSP_ENFORCE === "true"
      : env?.ENVIRONMENT === "production";

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
  ].join("; ");

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
  const isReadOnlyMethod = request.method === "GET" || request.method === "HEAD";
  if (env.DB && !isReadOnlyMethod) {
    await env.DB.prepare("PRAGMA foreign_keys = ON").run();
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
    newHeaders.set("X-Request-ID", log.getRequestId());

    // Security headers
    newHeaders.set("X-Content-Type-Options", "nosniff");
    newHeaders.set("X-Frame-Options", "DENY");
    newHeaders.set("Referrer-Policy", "no-referrer");
    newHeaders.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    if (cspEnforce) {
      newHeaders.set("Content-Security-Policy", csp);
    } else {
      newHeaders.set("Content-Security-Policy-Report-Only", csp);
    }
    if (request.url.startsWith("https://")) {
      newHeaders.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    log.error("Middleware error", { error });

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
          ...(cspEnforce ? { "Content-Security-Policy": csp } : { "Content-Security-Policy-Report-Only": csp }),
        },
      },
    );
  }
}
