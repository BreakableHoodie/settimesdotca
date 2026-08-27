// Admin authentication middleware
// Applies to all /api/admin/* endpoints except /api/admin/auth/*

import { getCookie } from "../../utils/cookies.js";
import { generateCSRFToken, setCSRFCookie, validateCSRFMiddleware } from "../../utils/csrf.js";
import { getClientIP } from "../../utils/request.js";
import { initializeLucia, isDevRequest, SESSION_CONFIG, SESSION_COOKIE_NAMES } from "../../utils/auth.js";
import { fromSqliteDateTime, toSqliteDateTime } from "../../utils/authAttempts.js";
import { createRequestLogger, logger } from "../../utils/logger.js";
import { auditLogStatement } from "../../utils/auditLogStatement.js";
import { API_KEY_PREFIX, DISPLAY_PREFIX_LENGTH, verifyApiKey } from "../../utils/apiKeys.js";
import { apiKeyRateLimitKey, checkRateLimitByKey, rateLimitResponse } from "../../utils/rateLimit.js";

export { auditLogStatement } from "../../utils/auditLogStatement.js";

// 60/min: high enough for a scheduled import or a dashboard poll, low enough that a
// leaked key cannot be used to walk the whole dataset before anyone notices. Keyed on
// the key id, independent of the per-IP limits, so a credential that moves between
// addresses is still bounded.
const API_KEY_RATE_LIMIT = { requests: 60, window: 60 };
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

// A bearer key authenticates a MACHINE, but it necessarily borrows a PERSON's
// identity: context.data.user.userId below is the key's creator, because that is
// what audit attribution and every ownership check need. Account self-service
// endpoints read that same field as "the human holding this browser session" and
// act on their credentials -- so a key reaching one of them edits its creator's
// account, at whatever role the key carries.
//
// That is not theoretical. Before this list existed, a `viewer` key could POST
// /api/admin/mfa/setup + /mfa/enable and plant an attacker-controlled TOTP secret
// and backup codes on its admin creator (both gate at "viewer" and act on
// auth.user.userId), read that admin's live sessions and device inventory with IPs
// (no role check at all), and revoke their trusted devices. The role hierarchy is
// the wrong axis: NO key role belongs here, including one minted `admin`.
//
// Matched with startsWith, so the slash-less entries also cover their children
// (/sessions and /sessions/revoke-all). Enforced by apiKeySelfService.test.js,
// which fails when an admin route with no checkPermission call is not covered here.
//
// /api/admin/me is deliberately NOT listed: it is a read that returns the identity
// the key holder already obtained from the admin who minted the key, and a machine
// client discovering its own role is a legitimate use. A decision, not an omission.
const KEY_FORBIDDEN_PREFIXES = [
  "/api/admin/auth/",
  "/api/admin/mfa/",
  "/api/admin/sessions",
  "/api/admin/trusted-devices",
];

function normalizeUser(user) {
  if (!user) return null;
  const displayName = user.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: displayName,
    firstName: user.firstName || null,
    lastName: user.lastName || null,
    isActive: user.isActive,
  };
}

async function resolveSession(request, env) {
  const lucia = initializeLucia(env.DB, request, env);
  // SECURITY: Bearer token auth is for non-production environments only.
  // In production, only cookie-based sessions are accepted.
  // isDevRequest, not a raw `!== "production"`: that comparison passes for
  // "Production", " production" and "PRODUCTION", and this is the switch deciding
  // whether `Authorization: Bearer <session-id>` is a valid credential at all.
  // isDevRequest allowlists known dev values and fails closed on every variant (#425).
  const allowHeaderAuth = env?.ALLOW_HEADER_AUTH === "true" && isDevRequest(request, env);
  const sessionId =
    lucia.readSessionCookie(request.headers.get("Cookie") ?? "") ||
    (allowHeaderAuth ? request.headers.get("Authorization")?.replace("Bearer ", "") : null);

  if (!sessionId) {
    return { lucia, sessionId: null, session: null, user: null, sessionMeta: null };
  }

  try {
    const { session, user } = await lucia.validateSession(sessionId);
    if (!session || !user) {
      return { lucia, sessionId, session: null, user: null, sessionMeta: null };
    }

    const sessionMeta = await env.DB.prepare("SELECT created_at, last_activity_at FROM lucia_sessions WHERE id = ?")
      .bind(sessionId)
      .first();

    return { lucia, sessionId, session, user, sessionMeta };
  } catch (_error) {
    // Log silently - session validation failures are common (expired, invalid)
    return { lucia, sessionId, session: null, user: null, sessionMeta: null };
  }
}

async function enforceSession(request, env) {
  const result = await resolveSession(request, env);
  const { lucia, sessionId, session, user, sessionMeta } = result;

  if (!session || !user) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (sessionId) {
      headers.append("Set-Cookie", lucia.createBlankSessionCookie().serialize());
    }
    return {
      response: new Response(JSON.stringify({ error: "Unauthorized", message: "Valid session required" }), {
        status: 401,
        headers,
      }),
      result,
    };
  }

  if (!user.isActive) {
    return {
      response: new Response(JSON.stringify({ error: "Account deactivated" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
      result,
    };
  }

  const now = new Date();
  const createdAt = fromSqliteDateTime(sessionMeta?.created_at);

  // lucia_sessions.created_at has been NOT NULL since the table's creation
  // (migration 0024) — there is no legacy row missing it. A null here means
  // either sessionMeta itself came back empty (the row vanished between
  // validateSession and this SELECT) or the stored value is corrupted.
  // Either way, its age cannot be verified: fail closed and invalidate rather
  // than falling back to "now", which would silently reset both the idle and
  // absolute-expiry clocks and grant a session with unverifiable metadata an
  // indefinite extension instead of catching the corruption.
  if (!createdAt) {
    await lucia.invalidateSession(sessionId);
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append("Set-Cookie", lucia.createBlankSessionCookie().serialize());
    return {
      response: new Response(JSON.stringify({ error: "Session expired", reason: "invalid_metadata" }), {
        status: 401,
        headers,
      }),
      result,
    };
  }

  const lastActivityAt = fromSqliteDateTime(sessionMeta?.last_activity_at) || createdAt;

  const idleTimeout = user.role === "admin" ? SESSION_CONFIG.adminIdleTimeout : SESSION_CONFIG.idleTimeout;
  const absoluteTimeout = user.role === "admin" ? SESSION_CONFIG.adminAbsoluteTimeout : SESSION_CONFIG.absoluteTimeout;

  const idleElapsed = now.getTime() - lastActivityAt.getTime();
  const absoluteElapsed = now.getTime() - createdAt.getTime();

  if (idleElapsed > idleTimeout || absoluteElapsed > absoluteTimeout) {
    await lucia.invalidateSession(sessionId);
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append("Set-Cookie", lucia.createBlankSessionCookie().serialize());

    return {
      response: new Response(
        JSON.stringify({
          error: "Session expired",
          reason: idleElapsed > idleTimeout ? "inactivity" : "absolute",
        }),
        { status: 401, headers },
      ),
      result,
    };
  }

  await env.DB.prepare("UPDATE lucia_sessions SET last_activity_at = datetime('now') WHERE id = ?")
    .bind(sessionId)
    .run();

  const idleRemaining = Math.max(0, idleTimeout - idleElapsed);
  const absoluteRemaining = Math.max(0, absoluteTimeout - absoluteElapsed);

  const refreshedTiming = {
    idleRemaining,
    absoluteRemaining,
    timeRemaining: Math.min(idleRemaining, absoluteRemaining),
  };

  return {
    result,
    pendingCookie: session.fresh ? lucia.createSessionCookie(session.id).serialize() : null,
    timing: refreshedTiming,
  };
}

// Check if user has required permission based on role hierarchy
// Role hierarchy: admin (3) > editor (2) > viewer (1)
export async function checkPermission(context, requiredRole) {
  const { request, env, data } = context;

  if (data && data.user) {
    const user = data.user;
    const roleHierarchy = { admin: 3, editor: 2, viewer: 1 };
    const userLevel = roleHierarchy[user.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    if (userLevel < requiredLevel) {
      return {
        error: true,
        response: new Response(
          JSON.stringify({
            error: "Forbidden",
            message: "Insufficient permissions",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      };
    }

    return { error: false, user };
  }

  const auth = await enforceSession(request, env);
  if (auth.response) {
    return { error: true, response: auth.response };
  }

  const normalizedUser = normalizeUser(auth.result.user);
  const roleHierarchy = { admin: 3, editor: 2, viewer: 1 };
  const userLevel = roleHierarchy[normalizedUser.role] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;

  if (userLevel < requiredLevel) {
    return {
      error: true,
      response: new Response(
        JSON.stringify({
          error: "Forbidden",
          message: "Insufficient permissions",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    };
  }

  return { error: false, user: normalizedUser, lucia: auth.result.lucia, session: auth.result.session };
}

// Audit log function - logs all admin actions
export async function auditLog(env, userId, action, resourceType, resourceId, details, ipAddress, log = null) {
  try {
    await auditLogStatement(env, userId, action, resourceType, resourceId, details, ipAddress).run();
  } catch (error) {
    // Never throws: audit logging must not fail the request it records.
    //
    // The inner guard makes that unconditional rather than merely intended.
    // Every call site awaits this with no `.catch()`, so anything the catch
    // block throws would surface as a 500 on a request whose work already
    // succeeded — an email sent, a digest flushed — and invite a retry of it.
    try {
      const l = log ?? logger;
      l.warn("Audit log write failed", { action, resourceType, resourceId, error });
    } catch {
      // The reporting channel is what failed; there is nothing left to report
      // with. Swallowing is the contract.
    }
  }
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const { pathname } = new URL(request.url);
  const log = createRequestLogger(context);

  const authHeader = request.headers.get("Authorization");
  const bearerValue = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const isApiKeyRequest = bearerValue !== null && bearerValue.startsWith(API_KEY_PREFIX);

  // Both names, not the environment-appropriate one: this only asks "is a session
  // cookie present at all", and guessing wrong would silently disable the rejection
  // below. This agrees with the session layer's own reader only because parseCookies
  // now trims the cookie NAME (see cookies.js) -- it did not, so a header of
  // `__Host-session_token =abc` keyed the map on "__Host-session_token " and returned
  // undefined here while lucia.readSessionCookie, which compares k.trim(), returned
  // "abc". A cookie shape that carries a readable session id past this check is
  // exactly what this check must not have.
  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) => Boolean(getCookie(request, name)));

  // Fail closed on ambiguous auth, BEFORE validating either credential. Two
  // credentials on one request is where privilege-confusion bugs live.
  if (isApiKeyRequest && hasSessionCookie) {
    return new Response(JSON.stringify({ error: "Ambiguous authentication", code: "AMBIGUOUS_AUTH" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // The API-key path returns before reaching validateCSRFMiddleware below, and that is
  // the CSRF skip. An API client has no csrf_token cookie to echo, so leaving the check
  // on would fail every key-authenticated mutation.
  //
  // What makes the skip safe is that `Authorization` is NOT an ambient header: a
  // browser never attaches it cross-origin without a successful preflight, and
  // functions/_middleware.js only emits `Access-Control-Allow-Headers: …Authorization`
  // for an origin already on the allowlist -- which an attacker does not control. That
  // is the primary control, and it is a property of the platform rather than of code
  // anyone can edit here.
  //
  // The AMBIGUOUS_AUTH rejection above is defence-in-depth against privilege confusion
  // (two credentials, one request), NOT the thing holding this up. Stating it as the
  // sole control was wrong twice over: it made the skip look one edit away from a CSRF
  // bypass, and it demanded an exactness the check did not have -- a cookie-name
  // whitespace variant slipped past it until parseCookies was fixed to trim the name.
  if (isApiKeyRequest) {
    const ipAddress = getClientIP(request);

    // Before verification, deliberately: this is a property of the credential TYPE and
    // the path, not of any particular key, so a valid key and a forged one are refused
    // identically. It also costs zero D1 round-trips, which is the right posture for a
    // path an attacker can hammer for free.
    if (KEY_FORBIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      log.warn("API key blocked from account self-service route", {
        keyPrefix: bearerValue.slice(0, DISPLAY_PREFIX_LENGTH),
        path: pathname,
        ipAddress,
      });
      return new Response(
        JSON.stringify({
          error: "Not available to API keys",
          code: "KEY_NOT_PERMITTED",
          message: "This endpoint acts on the account behind the key and is reachable only with a session.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const key = await verifyApiKey(env.DB, bearerValue);
    if (!key) {
      log.warn("API key authentication failed", {
        // The non-secret display prefix ONLY, so brute-force attempts are visible
        // without the presented secret ever reaching a log sink.
        keyPrefix: bearerValue.slice(0, DISPLAY_PREFIX_LENGTH),
        ipAddress,
      });
      return new Response(JSON.stringify({ error: "Invalid API key", code: "INVALID_API_KEY" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rateResult = await checkRateLimitByKey(env.DB, apiKeyRateLimitKey(key.id, pathname), API_KEY_RATE_LIMIT, {
      apiKeyId: key.id,
    });
    if (!rateResult.allowed) {
      return rateLimitResponse(rateResult);
    }

    const cutoff = toSqliteDateTime(new Date(Date.now() - LAST_USED_THROTTLE_MS));
    try {
      await env.DB.prepare(
        "UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)",
      )
        .bind(key.id, cutoff)
        .run();
    } catch (lastUsedError) {
      logger.warn("last_used_at update failed", { keyId: key.id, error: lastUsedError });
    }

    // No second SELECT: verifyApiKey's JOIN on users already returned these as creator_*.
    // created_by is ON DELETE RESTRICT and the JOIN requires is_active = 1, so the row
    // provably exists -- these fields are absent only if the column itself is NULL.
    const displayName =
      key.creator_name || [key.creator_first_name, key.creator_last_name].filter(Boolean).join(" ") || null;

    context.data = {
      ...context.data,
      authenticated: true,
      user: {
        userId: key.created_by,
        email: key.creator_email ?? null,
        role: key.role,
        name: displayName,
        firstName: key.creator_first_name ?? null,
        lastName: key.creator_last_name ?? null,
        isActive: true,
      },
      apiKey: { id: key.id, keyPrefix: key.key_prefix, role: key.role },
      ipAddress,
    };

    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      try {
        await auditLogStatement(
          env,
          key.created_by,
          "api_key.request",
          "api_key",
          key.id,
          { method, path: pathname },
          ipAddress,
          key.id,
        ).run();
      } catch (auditError) {
        logger.warn("api_key.request audit log failed", { keyId: key.id, error: auditError });
      }
    }

    return next();
  }

  if (pathname.startsWith("/api/admin/auth/")) {
    const csrfError = validateCSRFMiddleware(request, env);
    if (csrfError) {
      return csrfError;
    }
    return next();
  }

  const csrfError = validateCSRFMiddleware(request, env);
  if (csrfError) {
    return csrfError;
  }

  const ipAddress = getClientIP(request);

  try {
    const auth = await enforceSession(request, env);
    if (auth.response) {
      return auth.response;
    }

    const { result, pendingCookie, timing } = auth;
    const { session, user, sessionId, sessionMeta, lucia } = result;

    const normalizedUser = normalizeUser(user);

    const sessionData = {
      user_id: normalizedUser.userId,
      expires_at: session.expiresAt?.toISOString?.() || null,
      created_at: sessionMeta?.created_at || null,
      last_activity_at: sessionMeta?.last_activity_at || new Date().toISOString(),
    };

    const pendingCookies = [];
    if (pendingCookie) {
      pendingCookies.push(pendingCookie);
    }

    const csrfCookie = getCookie(request, "csrf_token");
    if (!csrfCookie) {
      const csrfToken = generateCSRFToken(request, env, sessionId || session.id);
      pendingCookies.push(setCSRFCookie(csrfToken, request));
    }

    context.data = {
      ...context.data,
      authenticated: true,
      user: normalizedUser,
      session: sessionData,
      ipAddress,
      lucia,
    };

    const response = await next();

    const headers = new Headers(response.headers);
    pendingCookies.forEach((cookie) => headers.append("Set-Cookie", cookie));

    if (timing) {
      headers.set("X-Session-Expires-In", Math.floor(timing.timeRemaining / 1000).toString());
      headers.set("X-Session-Idle-Expires-In", Math.floor(timing.idleRemaining / 1000).toString());
      headers.set("X-Session-Absolute-Expires-In", Math.floor(timing.absoluteRemaining / 1000).toString());
      headers.set("X-Session-Warning", timing.timeRemaining < 5 * 60 * 1000 ? "true" : "false");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    log.error("Auth middleware error", { error });

    return new Response(
      JSON.stringify({
        error: "Authentication error",
        message: "Failed to verify credentials",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
