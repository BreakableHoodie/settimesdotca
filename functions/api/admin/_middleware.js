// Admin authentication and rate limiting middleware
// Applies to all /api/admin/* endpoints except /api/admin/auth/login

const LOCKOUT_THRESHOLD = 5; // Failed attempts before lockout
const LOCKOUT_WINDOW_MINUTES = 10; // Time window to count attempts
const LOCKOUT_DURATION_HOURS = 1; // Lockout duration

// Get client IP from request
function getClientIP(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
    "unknown"
  );
}

// Check and update rate limit
async function checkRateLimit(DB, ipAddress) {
  const now = new Date().toISOString();

  // Get current rate limit record
  const record = await DB.prepare(
    `
    SELECT * FROM rate_limit WHERE ip_address = ?
  `
  )
    .bind(ipAddress)
    .first();

  // Check if IP is currently locked out
  if (record && record.lockout_until) {
    const lockoutUntil = new Date(record.lockout_until);
    if (lockoutUntil > new Date()) {
      const minutesRemaining = Math.ceil((lockoutUntil - new Date()) / 60000);
      return {
        allowed: false,
        locked: true,
        minutesRemaining,
      };
    } else {
      // Lockout expired, reset
      await DB.prepare(
        `
        UPDATE rate_limit
        SET failed_attempts = 0, lockout_until = NULL, last_attempt = ?
        WHERE ip_address = ?
      `
      )
        .bind(now, ipAddress)
        .run();
    }
  }

  return { allowed: true, locked: false };
}

// Record failed authentication attempt
async function recordFailedAttempt(DB, ipAddress) {
  const now = new Date().toISOString();
  const windowStart = new Date(
    Date.now() - LOCKOUT_WINDOW_MINUTES * 60000
  ).toISOString();

  // Get or create rate limit record
  let record = await DB.prepare(
    `
    SELECT * FROM rate_limit WHERE ip_address = ?
  `
  )
    .bind(ipAddress)
    .first();

  if (!record) {
    // Create new record
    await DB.prepare(
      `
      INSERT INTO rate_limit (ip_address, failed_attempts, last_attempt)
      VALUES (?, 1, ?)
    `
    )
      .bind(ipAddress, now)
      .run();
    return 1;
  }

  // Check if last attempt was within window
  const lastAttempt = new Date(record.last_attempt);
  const windowStartDate = new Date(windowStart);

  let failedAttempts = record.failed_attempts;
  if (lastAttempt < windowStartDate) {
    // Reset counter if outside window
    failedAttempts = 1;
  } else {
    failedAttempts += 1;
  }

  // Check if we should lock out
  let lockoutUntil = null;
  if (failedAttempts >= LOCKOUT_THRESHOLD) {
    lockoutUntil = new Date(
      Date.now() + LOCKOUT_DURATION_HOURS * 60 * 60000
    ).toISOString();
  }

  // Update record
  await DB.prepare(
    `
    UPDATE rate_limit
    SET failed_attempts = ?, lockout_until = ?, last_attempt = ?
    WHERE ip_address = ?
  `
  )
    .bind(failedAttempts, lockoutUntil, now, ipAddress)
    .run();

  return failedAttempts;
}

// Reset rate limit on successful auth
async function resetRateLimit(DB, ipAddress) {
  await DB.prepare(
    `
    UPDATE rate_limit
    SET failed_attempts = 0, lockout_until = NULL
    WHERE ip_address = ?
  `
  )
    .bind(ipAddress)
    .run();
}

// Log authentication event
async function logAuthEvent(DB, ipAddress, action, success, details = null) {
  const userAgent = details?.userAgent || null;
  const detailsJson = details ? JSON.stringify(details) : null;

  await DB.prepare(
    `
    INSERT INTO auth_audit (ip_address, action, success, user_agent, details)
    VALUES (?, ?, ?, ?, ?)
  `
  )
    .bind(ipAddress, action, success ? 1 : 0, userAgent, detailsJson)
    .run();
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const { pathname } = new URL(request.url);

  // Skip auth check for login and reset endpoints
  if (pathname.includes("/api/admin/auth/")) {
    return next();
  }

  const { DB } = env;
  const ipAddress = getClientIP(request);

  try {
    // Check rate limit
    const rateLimitCheck = await checkRateLimit(DB, ipAddress);
    if (!rateLimitCheck.allowed) {
      await logAuthEvent(DB, ipAddress, "api_access_blocked", false, {
        reason: "rate_limited",
        minutesRemaining: rateLimitCheck.minutesRemaining,
      });

      return new Response(
        JSON.stringify({
          error: "Too many failed attempts",
          message: `Your IP has been temporarily locked out. Please try again in ${rateLimitCheck.minutesRemaining} minutes.`,
          locked: true,
          minutesRemaining: rateLimitCheck.minutesRemaining,
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Verify admin password
    const adminPassword = request.headers.get("X-Admin-Password");
    const expectedPassword = env.ADMIN_PASSWORD;

    if (!adminPassword) {
      await logAuthEvent(DB, ipAddress, "api_access_denied", false, {
        reason: "missing_password",
      });

      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Admin password required",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (adminPassword !== expectedPassword) {
      await recordFailedAttempt(DB, ipAddress);
      await logAuthEvent(DB, ipAddress, "api_access_denied", false, {
        reason: "invalid_password",
      });

      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Invalid admin password",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Password is valid - reset rate limit and log success
    await resetRateLimit(DB, ipAddress);
    await logAuthEvent(DB, ipAddress, "api_access_granted", true);

    // Store auth info in context for handlers to use
    context.data = { ...context.data, authenticated: true, ipAddress };

    return next();
  } catch (error) {
    console.error("Auth middleware error:", error);

    return new Response(
      JSON.stringify({
        error: "Authentication error",
        message: "Failed to verify credentials",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
