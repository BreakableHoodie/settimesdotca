// Admin login endpoint
// POST /api/admin/auth/login
// Body: { password: string }
// Returns: { success: true, message: string } or error

function getClientIP(request) {
  return request.headers.get('CF-Connecting-IP') ||
         request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
         'unknown'
}

async function checkRateLimit(DB, ipAddress) {
  const record = await DB.prepare(`
    SELECT * FROM rate_limit WHERE ip_address = ?
  `).bind(ipAddress).first()

  if (record && record.lockout_until) {
    const lockoutUntil = new Date(record.lockout_until)
    if (lockoutUntil > new Date()) {
      const minutesRemaining = Math.ceil((lockoutUntil - new Date()) / 60000)
      return { allowed: false, locked: true, minutesRemaining }
    }
  }

  return { allowed: true, locked: false }
}

async function recordFailedAttempt(DB, ipAddress) {
  const now = new Date().toISOString()
  const LOCKOUT_THRESHOLD = 5
  const LOCKOUT_WINDOW_MINUTES = 10
  const LOCKOUT_DURATION_HOURS = 1

  let record = await DB.prepare(`
    SELECT * FROM rate_limit WHERE ip_address = ?
  `).bind(ipAddress).first()

  if (!record) {
    await DB.prepare(`
      INSERT INTO rate_limit (ip_address, failed_attempts, last_attempt)
      VALUES (?, 1, ?)
    `).bind(ipAddress, now).run()
    return 1
  }

  const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60000).toISOString()
  const lastAttempt = new Date(record.last_attempt)
  const windowStartDate = new Date(windowStart)

  let failedAttempts = lastAttempt < windowStartDate ? 1 : record.failed_attempts + 1
  let lockoutUntil = null

  if (failedAttempts >= LOCKOUT_THRESHOLD) {
    lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_HOURS * 60 * 60000).toISOString()
  }

  await DB.prepare(`
    UPDATE rate_limit
    SET failed_attempts = ?, lockout_until = ?, last_attempt = ?
    WHERE ip_address = ?
  `).bind(failedAttempts, lockoutUntil, now, ipAddress).run()

  return failedAttempts
}

async function resetRateLimit(DB, ipAddress) {
  await DB.prepare(`
    UPDATE rate_limit
    SET failed_attempts = 0, lockout_until = NULL
    WHERE ip_address = ?
  `).bind(ipAddress).run()
}

async function logAuthEvent(DB, ipAddress, action, success, details = null) {
  await DB.prepare(`
    INSERT INTO auth_audit (ip_address, action, success, user_agent, details)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    ipAddress,
    action,
    success ? 1 : 0,
    details?.userAgent || null,
    details ? JSON.stringify(details) : null
  ).run()
}

export async function onRequestPost(context) {
  const { request, env } = context
  const { DB } = env
  const ipAddress = getClientIP(request)

  try {
    // Check rate limit
    const rateLimitCheck = await checkRateLimit(DB, ipAddress)
    if (!rateLimitCheck.allowed) {
      await logAuthEvent(DB, ipAddress, 'login_attempt', false, {
        reason: 'rate_limited'
      })

      return new Response(
        JSON.stringify({
          error: 'Too many failed attempts',
          message: `Too many failed login attempts. Please try again in ${rateLimitCheck.minutesRemaining} minutes.`,
          locked: true,
          minutesRemaining: rateLimitCheck.minutesRemaining
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const { password } = body

    if (!password) {
      await logAuthEvent(DB, ipAddress, 'login_attempt', false, {
        reason: 'missing_password'
      })

      return new Response(
        JSON.stringify({
          error: 'Bad request',
          message: 'Password is required'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Verify password
    const expectedPassword = env.ADMIN_PASSWORD

    if (password !== expectedPassword) {
      const failedAttempts = await recordFailedAttempt(DB, ipAddress)
      await logAuthEvent(DB, ipAddress, 'login_attempt', false, {
        reason: 'invalid_password',
        failedAttempts
      })

      const remainingAttempts = 5 - failedAttempts
      const message = remainingAttempts > 0
        ? `Invalid password. ${remainingAttempts} attempts remaining before lockout.`
        : 'Invalid password. Your IP has been locked out for 1 hour.'

      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message,
          remainingAttempts: Math.max(0, remainingAttempts)
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Success - reset rate limit
    await resetRateLimit(DB, ipAddress)
    await logAuthEvent(DB, ipAddress, 'login_attempt', true)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Login successful'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Login error:', error)

    return new Response(
      JSON.stringify({
        error: 'Server error',
        message: 'Failed to process login request'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}
