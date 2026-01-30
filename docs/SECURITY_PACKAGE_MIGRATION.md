# Security Package Migration Plan

This document outlines the migration from custom security implementations to battle-tested packages, plus the addition of account activation flow.

## Overview

| Priority | Area | Current | Target Package | Status |
|----------|------|---------|----------------|--------|
| 🔴 HIGH | Password Hashing | Custom PBKDF2 | `@noble/hashes` | Pending |
| 🔴 HIGH | TOTP/MFA | Custom Base32 + HMAC | `otplib` | Pending |
| 🔴 HIGH | CSRF Protection | Custom double-submit | `csrf-csrf` | Pending |
| 🟡 MED | Email Validation | Custom regex | `email-validator` | Pending |
| 🟡 MED | Input Sanitization | Regex removal | `isomorphic-dompurify` | Pending |
| 🟢 NEW | Account Activation | None | Custom + email | Pending |
| 🟢 NEW | Privacy-First Metrics | None | CF Analytics Engine + D1 | Pending |
| 🟡 MED | Session Management | Custom D1 sessions | `lucia` | Pending |

---

## Phase 1: Account Activation Flow

### 1.1 Database Schema Changes

Add to `database/schema-final.sql` and create migration:

```sql
-- Migration: 0022_add_account_activation.sql

-- Add activation fields to users table
ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN activation_token TEXT;
ALTER TABLE users ADD COLUMN activation_token_expires_at TEXT;
ALTER TABLE users ADD COLUMN activated_at TEXT;

-- Create index for token lookup
CREATE INDEX IF NOT EXISTS idx_users_activation_token ON users(activation_token);

-- Existing users should be marked as active
UPDATE users SET is_active = 1, activated_at = datetime('now') WHERE is_active = 0;
```

### 1.2 Signup Flow Changes

**File: `functions/api/admin/auth/signup.js`**

Modify the signup flow:

1. Create user with `is_active = 0`
2. Generate activation token (secure random, 32 bytes hex)
3. Set `activation_token_expires_at` to 24 hours from now
4. Send activation email with link
5. Return success but DO NOT create session
6. User must activate before logging in

```javascript
// After creating user, before creating session:
const activationToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
const activationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

await DB.prepare(
  `UPDATE users SET activation_token = ?, activation_token_expires_at = ? WHERE id = ?`
).bind(activationToken, activationExpires, user.id).run();

// Send activation email
const activationUrl = `${env.PUBLIC_URL}/activate?token=${activationToken}`;
await sendEmail(env, {
  to: email,
  ...buildActivationEmail({ activationUrl, recipientName: resolvedFirstName })
});

// Return success WITHOUT session (user must activate first)
return new Response(JSON.stringify({
  success: true,
  message: 'Account created. Please check your email to activate your account.',
  requiresActivation: true
}), { status: 201 });
```

### 1.3 New Activation Endpoint

**File: `functions/api/auth/activate.js`**

```javascript
export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  const { token } = await request.json();

  if (!token || typeof token !== 'string') {
    return new Response(JSON.stringify({
      error: 'Invalid token',
      message: 'Activation token is required'
    }), { status: 400 });
  }

  // Find user with valid activation token
  const user = await DB.prepare(`
    SELECT id, email, first_name, is_active
    FROM users
    WHERE activation_token = ?
    AND activation_token_expires_at > datetime('now')
  `).bind(token).first();

  if (!user) {
    return new Response(JSON.stringify({
      error: 'Invalid or expired token',
      message: 'This activation link is invalid or has expired. Please request a new one.'
    }), { status: 400 });
  }

  if (user.is_active) {
    return new Response(JSON.stringify({
      error: 'Already activated',
      message: 'This account has already been activated. You can log in.'
    }), { status: 400 });
  }

  // Activate the account
  await DB.prepare(`
    UPDATE users
    SET is_active = 1,
        activated_at = datetime('now'),
        activation_token = NULL,
        activation_token_expires_at = NULL
    WHERE id = ?
  `).bind(user.id).run();

  return new Response(JSON.stringify({
    success: true,
    message: 'Account activated successfully. You can now log in.'
  }), { status: 200 });
}
```

### 1.4 Login Flow Changes

**File: `functions/api/admin/auth/login.js`**

Add check for account activation:

```javascript
// After finding user, before password verification:
if (!user.is_active) {
  return new Response(JSON.stringify({
    error: 'Account not activated',
    message: 'Please check your email and activate your account before logging in.',
    requiresActivation: true
  }), { status: 403 });
}
```

### 1.5 Resend Activation Email Endpoint

**File: `functions/api/auth/resend-activation.js`**

```javascript
export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  const { email } = await request.json();

  // Rate limit: max 3 resends per hour per email
  // ... rate limiting logic ...

  const user = await DB.prepare(`
    SELECT id, first_name, is_active
    FROM users
    WHERE email = ?
  `).bind(email).first();

  // Always return success to prevent email enumeration
  if (!user || user.is_active) {
    return new Response(JSON.stringify({
      success: true,
      message: 'If an inactive account exists with this email, an activation link has been sent.'
    }), { status: 200 });
  }

  // Generate new activation token
  const activationToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
  const activationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await DB.prepare(`
    UPDATE users
    SET activation_token = ?, activation_token_expires_at = ?
    WHERE id = ?
  `).bind(activationToken, activationExpires, user.id).run();

  const activationUrl = `${env.PUBLIC_URL}/activate?token=${activationToken}`;
  await sendEmail(env, {
    to: email,
    ...buildActivationEmail({ activationUrl, recipientName: user.first_name })
  });

  return new Response(JSON.stringify({
    success: true,
    message: 'If an inactive account exists with this email, an activation link has been sent.'
  }), { status: 200 });
}
```

### 1.6 Email Template

**File: `functions/utils/emailTemplates.js`**

Add:

```javascript
export function buildActivationEmail({ activationUrl, recipientName }) {
  const intro = recipientName
    ? `Hi ${recipientName}, welcome to SetTimes!`
    : 'Welcome to SetTimes!';

  const bodyHtml = `
    <p style="margin:0 0 12px;">Click the button above to activate your account and start managing events.</p>
    <p style="margin:0;">This link expires in 24 hours.</p>
  `;

  return {
    subject: 'Activate your SetTimes account',
    text: [
      intro,
      '',
      `Activate your account: ${activationUrl}`,
      '',
      'This link expires in 24 hours.',
      '',
      'If you did not create this account, you can ignore this email.',
    ].join('\n'),
    html: renderEmail({
      title: 'Activate your account',
      preheader: 'Complete your SetTimes registration',
      intro,
      ctaLabel: 'Activate Account',
      ctaUrl: activationUrl,
      bodyHtml,
    }),
  };
}
```

### 1.7 Frontend Changes

**File: `frontend/src/admin/SignupPage.jsx`**

After successful signup, show activation message instead of redirecting to dashboard:

```jsx
// On successful signup response with requiresActivation: true
setShowActivationMessage(true);
// Show: "Check your email to activate your account"
// With "Resend activation email" button
```

**File: `frontend/src/pages/ActivatePage.jsx`** (NEW)

Create activation page that:
1. Reads token from URL query param
2. Calls POST /api/auth/activate
3. Shows success/error message
4. Provides link to login

---

## Phase 2: Password Hashing Migration

### 2.1 Install Package

```bash
npm install @noble/hashes
```

### 2.2 Update crypto.js

**File: `functions/utils/crypto.js`**

```javascript
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';

const SALT_LENGTH = 16;
const DEFAULT_ITERATIONS = 100000; // CF Workers limit
const KEY_LENGTH = 32;

export async function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH);
  const passwordBytes = new TextEncoder().encode(password);

  const hash = pbkdf2(sha256, passwordBytes, salt, {
    c: DEFAULT_ITERATIONS,
    dkLen: KEY_LENGTH
  });

  const saltBase64 = btoa(String.fromCharCode(...salt));
  const hashBase64 = btoa(String.fromCharCode(...hash));

  return `pbkdf2$${DEFAULT_ITERATIONS}$${saltBase64}$${hashBase64}`;
}

export async function verifyPassword(password, storedHash) {
  // ... parse storedHash (keep existing logic for format parsing)

  const passwordBytes = new TextEncoder().encode(password);
  const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));

  const hash = pbkdf2(sha256, passwordBytes, salt, {
    c: iterations,
    dkLen: KEY_LENGTH
  });

  const storedHashArray = Uint8Array.from(atob(hashBase64), c => c.charCodeAt(0));

  // @noble/hashes provides timing-safe comparison
  return timingSafeEqual(hash, storedHashArray);
}

// Use @noble/hashes timing-safe comparison
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
```

### 2.3 Verify Compatibility

- Test that existing password hashes still verify (backward compatibility)
- Test new password hashing works
- Run existing auth tests

---

## Phase 3: TOTP/MFA Migration

### 3.1 Install Package

```bash
npm install otplib
```

Note: May need `@otplib/preset-browser` for CF Workers compatibility.

### 3.2 Update totp.js

**File: `functions/utils/totp.js`**

```javascript
import { authenticator } from 'otplib';

// Configure for CF Workers if needed
authenticator.options = {
  digits: 6,
  step: 30,
  window: 1
};

export function generateTotpSecret(byteLength = 20) {
  return authenticator.generateSecret(byteLength);
}

export function buildOtpAuthUrl({ secret, email, issuer = 'SetTimes' }) {
  return authenticator.keyuri(email, issuer, secret);
}

export function verifyTotp(secret, code, window = 1) {
  authenticator.options = { ...authenticator.options, window };
  return authenticator.verify({ token: code, secret });
}

export function generateTotpCode(secret) {
  return authenticator.generate(secret);
}

// Keep backup code functions (these are simple enough)
export function generateBackupCodes(count = 10) {
  // ... existing implementation is fine
}

export async function hashBackupCode(code) {
  // ... existing implementation is fine
}

export async function verifyBackupCode(code, hashedCodes = []) {
  // ... existing implementation is fine
}
```

### 3.3 Verify Compatibility

- Existing TOTP secrets should still work
- Test MFA setup flow
- Test MFA verification flow
- Run existing MFA tests

---

## Phase 4: CSRF Migration

### 4.1 Install Package

```bash
npm install csrf-csrf
```

Or for edge/CF Workers: consider `@edge-csrf/core`

### 4.2 Update csrf.js

**File: `functions/utils/csrf.js`**

```javascript
import { CsrfError, doubleCsrf } from 'csrf-csrf';

const { generateToken, validateRequest, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || 'fallback-secret-change-in-prod',
  cookieName: 'csrf_token',
  cookieOptions: {
    httpOnly: false, // Must be false for double-submit pattern
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 1800
  },
  getTokenFromRequest: (req) => req.headers.get('X-CSRF-Token')
});

export { generateToken as generateCSRFToken, validateRequest as validateCSRFToken };

// Adapter for existing middleware signature
export function validateCSRFMiddleware(request) {
  const method = request.method.toUpperCase();
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    return null;
  }

  const url = new URL(request.url);
  if (url.pathname.includes('/api/admin/auth/')) {
    return null;
  }

  try {
    if (!validateRequest(request)) {
      throw new CsrfError('Invalid CSRF token');
    }
    return null;
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'CSRF validation failed',
      message: 'Invalid or missing CSRF token'
    }), { status: 403 });
  }
}
```

Note: May need custom implementation for CF Workers if package isn't compatible.

---

## Phase 5: Email Validation

### 5.1 Install Package

```bash
npm install email-validator
```

### 5.2 Update validation.js

**File: `functions/utils/validation.js`**

```javascript
import * as EmailValidator from 'email-validator';

export function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  return EmailValidator.validate(email.trim());
}
```

---

## Phase 6: Input Sanitization (Frontend)

### 6.1 Install Package

```bash
cd frontend && npm install isomorphic-dompurify
```

### 6.2 Update frontend validation

**File: `frontend/src/utils/validation.js`**

```javascript
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] }); // Strip all HTML
}

export function sanitizeUrl(url) {
  if (!url) return '';
  const sanitized = DOMPurify.sanitize(url, { ALLOWED_TAGS: [] });
  // Ensure safe protocol
  if (!/^https?:\/\//i.test(sanitized)) {
    return `https://${sanitized}`;
  }
  return sanitized;
}
```

---

## Testing Checklist

### Account Activation
- [ ] New signup creates inactive user
- [ ] Activation email is sent
- [ ] Activation link works
- [ ] Cannot login without activation
- [ ] Resend activation works
- [ ] Expired tokens are rejected
- [ ] Used tokens are invalidated

### Password Hashing
- [ ] New passwords hash correctly
- [ ] Existing passwords still verify
- [ ] Legacy format passwords still work
- [ ] Timing-safe comparison works

### TOTP/MFA
- [ ] Existing secrets still work
- [ ] New secret generation works
- [ ] QR code URL generation works
- [ ] TOTP verification works with window
- [ ] Backup codes still work

### CSRF
- [ ] Tokens are generated correctly
- [ ] Valid tokens pass validation
- [ ] Invalid tokens are rejected
- [ ] Cookie attributes are correct

### Email Validation
- [ ] Valid emails pass
- [ ] Invalid emails fail
- [ ] Edge cases handled (IDN, etc.)

---

## Environment Variables

Add to Cloudflare Pages:

```
CSRF_SECRET=<generate-secure-random-string>
```

---

## Rollback Plan

Each phase can be rolled back independently:

1. Keep old function implementations in `*.legacy.js` files
2. Use feature flags if needed: `env.USE_NEW_CRYPTO=true`
3. Database migrations include DOWN migrations
4. Git tags before each phase deployment

---

---

## Phase 8: Session Management with Lucia

### 8.1 Why Lucia?

Current implementation has:
- ✅ D1-backed sessions
- ✅ HTTPOnly cookies
- ✅ 30-min sliding expiry
- ❌ No absolute session timeout
- ❌ No session listing/revocation UI
- ❌ No device tracking
- ❌ Manual session refresh logic

Lucia provides all of this out of the box with a D1 adapter.

### 8.2 Install Package

```bash
npm install lucia @lucia-auth/adapter-sqlite
```

### 8.3 Database Schema Changes

Lucia uses a specific schema. Migration to align:

```sql
-- Migration: 0024_lucia_sessions.sql

-- Lucia expects these columns
ALTER TABLE sessions ADD COLUMN id TEXT; -- Lucia uses string IDs
ALTER TABLE sessions ADD COLUMN user_id INTEGER NOT NULL;
ALTER TABLE sessions ADD COLUMN expires_at INTEGER NOT NULL; -- Unix timestamp

-- Create index for Lucia queries
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- Migrate existing data
UPDATE sessions SET id = session_token WHERE id IS NULL;
UPDATE sessions SET expires_at = CAST(strftime('%s', expires_at) AS INTEGER)
  WHERE typeof(expires_at) = 'text';
```

### 8.4 Lucia Setup

**File: `functions/utils/auth.js`**

```javascript
import { Lucia } from "lucia";
import { D1Adapter } from "@lucia-auth/adapter-sqlite";

export function initializeLucia(DB) {
  const adapter = new D1Adapter(DB, {
    user: "users",
    session: "sessions"
  });

  return new Lucia(adapter, {
    sessionCookie: {
      name: "session_token",
      expires: false, // Session cookie (browser close = logout)
      attributes: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/"
      }
    },
    sessionExpiresIn: new TimeSpan(30, "d"), // Absolute: 30 days max
    getUserAttributes: (attributes) => ({
      email: attributes.email,
      role: attributes.role,
      name: attributes.name,
      firstName: attributes.first_name,
      lastName: attributes.last_name,
      isActive: attributes.is_active
    })
  });
}

// Session configuration
export const SESSION_CONFIG = {
  // Absolute maximum session lifetime
  absoluteTimeout: 30 * 24 * 60 * 60 * 1000, // 30 days

  // Idle timeout (no activity)
  idleTimeout: 30 * 60 * 1000, // 30 minutes

  // Refresh threshold (extend session if within this time of expiry)
  refreshThreshold: 15 * 60 * 1000, // 15 minutes

  // Admin sessions have shorter timeouts
  adminIdleTimeout: 15 * 60 * 1000, // 15 minutes
  adminAbsoluteTimeout: 8 * 60 * 60 * 1000, // 8 hours
};
```

### 8.5 Middleware Update

**File: `functions/api/admin/_middleware.js`**

```javascript
import { initializeLucia, SESSION_CONFIG } from "../../utils/auth.js";
import { verifyRequestOrigin } from "lucia";

export async function onRequest(context) {
  const { request, env, next } = context;
  const { pathname } = new URL(request.url);

  // Skip auth for auth endpoints
  if (pathname.includes("/api/admin/auth/")) {
    return next();
  }

  // CSRF protection via Origin header (Lucia recommendation)
  if (request.method !== "GET") {
    const originHeader = request.headers.get("Origin");
    const hostHeader = request.headers.get("Host");
    if (!originHeader || !hostHeader || !verifyRequestOrigin(originHeader, [hostHeader])) {
      return new Response(null, { status: 403 });
    }
  }

  const lucia = initializeLucia(env.DB);

  // Get session from cookie
  const sessionId = lucia.readSessionCookie(request.headers.get("Cookie") ?? "");

  if (!sessionId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Validate session
  const { session, user } = await lucia.validateSession(sessionId);

  if (!session) {
    // Invalid session - clear cookie
    const cookie = lucia.createBlankSessionCookie();
    return new Response(JSON.stringify({ error: "Session expired" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookie.serialize()
      }
    });
  }

  // Check if user is active
  if (!user.isActive) {
    return new Response(JSON.stringify({ error: "Account deactivated" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Check idle timeout
  const idleTimeout = user.role === "admin"
    ? SESSION_CONFIG.adminIdleTimeout
    : SESSION_CONFIG.idleTimeout;

  const lastActivity = session.lastActivityAt || session.createdAt;
  const idleTime = Date.now() - new Date(lastActivity).getTime();

  if (idleTime > idleTimeout) {
    // Idle timeout - invalidate session
    await lucia.invalidateSession(sessionId);
    const cookie = lucia.createBlankSessionCookie();
    return new Response(JSON.stringify({
      error: "Session expired",
      reason: "inactivity"
    }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookie.serialize()
      }
    });
  }

  // Refresh session if needed (Lucia handles this)
  let setCookieHeader = null;
  if (session.fresh) {
    const cookie = lucia.createSessionCookie(session.id);
    setCookieHeader = cookie.serialize();
  }

  // Update last activity
  await env.DB.prepare(
    "UPDATE sessions SET last_activity_at = datetime('now') WHERE id = ?"
  ).bind(sessionId).run();

  // Store in context
  context.data = {
    ...context.data,
    authenticated: true,
    user,
    session,
    lucia
  };

  const response = await next();

  // Add session cookie refresh if needed
  if (setCookieHeader) {
    const headers = new Headers(response.headers);
    headers.append("Set-Cookie", setCookieHeader);
    return new Response(response.body, {
      status: response.status,
      headers
    });
  }

  return response;
}
```

### 8.6 Login Flow Update

**File: `functions/api/admin/auth/login.js`**

```javascript
import { initializeLucia } from "../../../utils/auth.js";
import { verifyPassword } from "../../../utils/crypto.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const lucia = initializeLucia(env.DB);

  const { email, password, rememberMe } = await request.json();

  // ... validation ...

  // Find user
  const user = await env.DB.prepare(
    "SELECT * FROM users WHERE email = ?"
  ).bind(email).first();

  if (!user || !await verifyPassword(password, user.password_hash)) {
    return new Response(JSON.stringify({ error: "Invalid credentials" }), {
      status: 401
    });
  }

  if (!user.is_active) {
    return new Response(JSON.stringify({
      error: "Account not activated",
      requiresActivation: true
    }), { status: 403 });
  }

  // Create session with Lucia
  const session = await lucia.createSession(user.id, {
    // Custom session attributes
    ip_address: request.headers.get("CF-Connecting-IP"),
    user_agent: request.headers.get("User-Agent"),
    remember_me: rememberMe
  });

  const cookie = lucia.createSessionCookie(session.id);

  return new Response(JSON.stringify({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    }
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookie.serialize()
    }
  });
}
```

### 8.7 Session Management Endpoints

**File: `functions/api/admin/sessions.js`**

```javascript
// GET: List user's active sessions
export async function onRequestGet(context) {
  const { env, data } = context;
  const { user } = data;

  const sessions = await env.DB.prepare(`
    SELECT
      id,
      ip_address,
      user_agent,
      created_at,
      last_activity_at,
      expires_at
    FROM sessions
    WHERE user_id = ?
    AND expires_at > datetime('now')
    ORDER BY last_activity_at DESC
  `).bind(user.id).all();

  return new Response(JSON.stringify({
    sessions: sessions.results,
    currentSessionId: data.session.id
  }), {
    headers: { "Content-Type": "application/json" }
  });
}

// DELETE: Revoke a specific session
export async function onRequestDelete(context) {
  const { request, env, data } = context;
  const { lucia, user } = data;

  const { sessionId } = await request.json();

  // Verify session belongs to user
  const session = await env.DB.prepare(
    "SELECT user_id FROM sessions WHERE id = ?"
  ).bind(sessionId).first();

  if (!session || session.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404
    });
  }

  await lucia.invalidateSession(sessionId);

  return new Response(JSON.stringify({ success: true }));
}
```

**File: `functions/api/admin/sessions/revoke-all.js`**

```javascript
// POST: Revoke all sessions except current
export async function onRequestPost(context) {
  const { env, data } = context;
  const { lucia, user, session } = data;

  // Invalidate all user sessions
  await lucia.invalidateUserSessions(user.id);

  // Create new session for current user
  const newSession = await lucia.createSession(user.id, {
    ip_address: context.request.headers.get("CF-Connecting-IP"),
    user_agent: context.request.headers.get("User-Agent")
  });

  const cookie = lucia.createSessionCookie(newSession.id);

  return new Response(JSON.stringify({
    success: true,
    message: "All other sessions revoked"
  }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookie.serialize()
    }
  });
}
```

### 8.8 Backend-Driven Inactivity Warning

The backend provides session status in API responses. The admin panel can use this to show warnings.

**Response Header Approach**:

```javascript
// In middleware, add session info to response headers
const timeUntilIdle = idleTimeout - (Date.now() - lastActivity);
const timeUntilAbsolute = absoluteTimeout - (Date.now() - sessionCreated);
const timeRemaining = Math.min(timeUntilIdle, timeUntilAbsolute);

// Add to all admin API responses
headers.set('X-Session-Expires-In', Math.floor(timeRemaining / 1000));
headers.set('X-Session-Warning', timeRemaining < 5 * 60 * 1000 ? 'true' : 'false');
```

**Admin Panel Usage**:

```javascript
// In admin API wrapper, check response headers
async function adminFetch(url, options) {
  const res = await fetch(url, options);

  const warning = res.headers.get('X-Session-Warning');
  const expiresIn = parseInt(res.headers.get('X-Session-Expires-In'));

  if (warning === 'true' && expiresIn > 0) {
    // Show toast: "Session expires in X minutes. Click to extend."
    showSessionWarning(expiresIn);
  }

  return res;
}

// Extend session by making any authenticated request
async function extendSession() {
  await adminFetch('/api/admin/me');
}
```

**Dedicated Endpoint** (alternative):

```javascript
// GET /api/admin/session/status
{
  "expiresIn": 1800,        // seconds until expiry
  "idleExpiresIn": 1800,    // seconds until idle timeout
  "absoluteExpiresIn": 28800, // seconds until absolute timeout
  "warning": false
}
```

### 8.9 Scope Clarification

**In Scope (Backend Admin Auth)**:
- Session validation with Lucia
- Idle timeout enforcement (server-side)
- Absolute timeout enforcement (server-side)
- Session expiry info in response headers
- Session revocation APIs
- Role-based timeout (stricter for admins)

**Out of Scope**:
- Public frontend (anonymous users, localStorage only)
- Frontend-side activity tracking (backend is source of truth)

### 8.9 Testing Checklist

- [ ] Login creates Lucia session
- [ ] Session cookie is HTTPOnly and Secure
- [ ] Idle timeout works (30 min default, 15 min admin)
- [ ] Absolute timeout works (30 days default, 8 hours admin)
- [ ] Session refresh extends expiry on activity
- [ ] Session listing API returns user's sessions
- [ ] Session revocation API works
- [ ] "Revoke all" invalidates other sessions
- [ ] Expired session returns 401
- [ ] Deactivated user cannot use existing sessions
- [ ] Existing sessions migrated correctly

---

## Implementation Order

1. **Account Activation** (independent, can be done first)
2. **Email Validation** (lowest risk)
3. **Input Sanitization** (frontend only)
4. **Password Hashing** (test thoroughly, backward compatible)
5. **TOTP** (test thoroughly, backward compatible)
6. **CSRF** (may need custom implementation for CF Workers)
7. **Privacy-First Metrics** (independent, can be parallelized)
8. **Session Management** (after auth packages, integrates with existing)

---

---

## Phase 7: Privacy-First Metrics System

### 7.1 Design Principles

| Principle | Implementation |
|-----------|----------------|
| **No PII** | Never store emails, IPs, or user IDs in metrics |
| **Aggregated** | Store counts, not individual events |
| **Minimal** | Only track what's needed for artist profiles |
| **Performant** | Async, non-blocking, edge-computed |
| **Transparent** | Users can see what's tracked |

### 7.2 Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│  ┌─────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │ Page Views  │───▶│ Lightweight      │───▶│ Beacon API    │  │
│  │ Interactions│    │ Event Collector  │    │ /api/metrics  │  │
│  └─────────────┘    └──────────────────┘    └───────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND (CF Workers)                      │
│  ┌─────────────────┐    ┌──────────────────┐                   │
│  │ /api/metrics    │───▶│ Cloudflare       │                   │
│  │ (ingest)        │    │ Analytics Engine │                   │
│  └─────────────────┘    └──────────────────┘                   │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐    ┌──────────────────┐                   │
│  │ Hourly Cron     │───▶│ D1: Aggregated   │                   │
│  │ (aggregate)     │    │ Stats Tables     │                   │
│  └─────────────────┘    └──────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 What to Track

#### Artist Profile Metrics (stored in D1)
```sql
-- Daily aggregated stats per artist
CREATE TABLE artist_daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  performer_id INTEGER NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD
  page_views INTEGER DEFAULT 0,
  profile_clicks INTEGER DEFAULT 0, -- from event timeline
  social_clicks INTEGER DEFAULT 0, -- instagram, bandcamp, etc.
  share_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(performer_id, date),
  FOREIGN KEY (performer_id) REFERENCES performers(id)
);

-- Aggregated totals (updated by cron)
ALTER TABLE performers ADD COLUMN total_views INTEGER DEFAULT 0;
ALTER TABLE performers ADD COLUMN total_social_clicks INTEGER DEFAULT 0;
ALTER TABLE performers ADD COLUMN popularity_score REAL DEFAULT 0;
```

#### App Usage Metrics (Cloudflare Analytics Engine)
```javascript
// What we track (no PII):
const ALLOWED_EVENTS = [
  'page_view',           // which pages are popular
  'event_view',          // which events get attention
  'artist_profile_view', // artist popularity
  'social_link_click',   // engagement type
  'share_event',         // viral potential
  'filter_use',          // UX insights
  'search_query',        // anonymized search terms (no PII)
];

// What we NEVER track:
// - IP addresses
// - User IDs or emails
// - Device fingerprints
// - Cross-site tracking
// - Personal information
```

### 7.4 Frontend Implementation

**File: `frontend/src/utils/metrics.js`**

```javascript
// Privacy-first metrics collector
// Uses Beacon API for non-blocking sends

const METRICS_ENDPOINT = '/api/metrics';
const BATCH_INTERVAL = 5000; // 5 seconds
const MAX_BATCH_SIZE = 20;

let eventQueue = [];
let flushTimeout = null;

// Hash function for anonymizing sensitive data
async function anonymize(value) {
  if (!value) return null;
  const encoder = new TextEncoder();
  const data = encoder.encode(value + 'settimes-salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash).slice(0, 8))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Track an event (privacy-safe)
export function trackEvent(eventName, properties = {}) {
  // Only track allowed events
  const ALLOWED = [
    'page_view', 'event_view', 'artist_profile_view',
    'social_link_click', 'share_event', 'filter_use'
  ];

  if (!ALLOWED.includes(eventName)) {
    console.warn(`[Metrics] Unknown event: ${eventName}`);
    return;
  }

  // Strip any PII from properties
  const safeProps = {};
  const SAFE_KEYS = ['performer_id', 'event_id', 'venue_id', 'link_type', 'filter_type'];

  for (const key of SAFE_KEYS) {
    if (properties[key] !== undefined) {
      safeProps[key] = properties[key];
    }
  }

  eventQueue.push({
    event: eventName,
    props: safeProps,
    ts: Date.now(),
    // Session ID (random per session, not persistent)
    sid: getSessionId()
  });

  // Schedule flush
  if (!flushTimeout) {
    flushTimeout = setTimeout(flushEvents, BATCH_INTERVAL);
  }

  // Flush immediately if batch is full
  if (eventQueue.length >= MAX_BATCH_SIZE) {
    flushEvents();
  }
}

// Non-blocking flush using Beacon API
function flushEvents() {
  if (eventQueue.length === 0) return;

  const events = [...eventQueue];
  eventQueue = [];
  flushTimeout = null;

  // Use Beacon API (non-blocking, works on page unload)
  if (navigator.sendBeacon) {
    navigator.sendBeacon(METRICS_ENDPOINT, JSON.stringify({ events }));
  } else {
    // Fallback to fetch (async, non-blocking)
    fetch(METRICS_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({ events }),
      keepalive: true
    }).catch(() => {}); // Silently fail
  }
}

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushEvents();
    }
  });
}

// Generate session ID (not persistent, not trackable)
let sessionId = null;
function getSessionId() {
  if (!sessionId) {
    sessionId = crypto.randomUUID().slice(0, 8);
  }
  return sessionId;
}

// Convenience functions
export const trackPageView = (page) => trackEvent('page_view', { page });
export const trackArtistView = (performerId) => trackEvent('artist_profile_view', { performer_id: performerId });
export const trackSocialClick = (performerId, linkType) => trackEvent('social_link_click', { performer_id: performerId, link_type: linkType });
export const trackEventView = (eventId) => trackEvent('event_view', { event_id: eventId });
```

### 7.5 Backend Implementation

**File: `functions/api/metrics.js`**

```javascript
// Metrics ingestion endpoint
// Writes to Cloudflare Analytics Engine

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { events } = await request.json();

    if (!Array.isArray(events) || events.length === 0) {
      return new Response('OK', { status: 200 });
    }

    // Validate and sanitize events
    const validEvents = events
      .filter(e => e.event && typeof e.event === 'string')
      .slice(0, 50); // Max 50 events per request

    // Write to Analytics Engine (if configured)
    if (env.ANALYTICS) {
      for (const event of validEvents) {
        env.ANALYTICS.writeDataPoint({
          blobs: [
            event.event,
            String(event.props?.performer_id || ''),
            String(event.props?.event_id || ''),
            String(event.props?.link_type || '')
          ],
          doubles: [Date.now()],
          indexes: [event.event] // For efficient querying
        });
      }
    }

    // Also update D1 aggregates for artist stats (batched)
    const artistViews = validEvents.filter(e =>
      e.event === 'artist_profile_view' && e.props?.performer_id
    );

    if (artistViews.length > 0 && env.DB) {
      const today = new Date().toISOString().split('T')[0];

      // Batch upsert for performance
      const performerCounts = {};
      for (const view of artistViews) {
        const pid = view.props.performer_id;
        performerCounts[pid] = (performerCounts[pid] || 0) + 1;
      }

      for (const [performerId, count] of Object.entries(performerCounts)) {
        await env.DB.prepare(`
          INSERT INTO artist_daily_stats (performer_id, date, page_views)
          VALUES (?, ?, ?)
          ON CONFLICT (performer_id, date)
          DO UPDATE SET page_views = page_views + ?
        `).bind(performerId, today, count, count).run();
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    // Never fail metrics - just log and return OK
    console.error('[Metrics] Ingestion error:', error);
    return new Response('OK', { status: 200 });
  }
}
```

### 7.6 Cloudflare Analytics Engine Setup

Add to `wrangler.toml`:

```toml
# Analytics Engine binding
[[analytics_engine_datasets]]
binding = "ANALYTICS"
dataset = "settimes_metrics"
```

### 7.7 Artist Popularity Score Calculation

**File: `functions/scheduled/aggregate-stats.js`** (Cron trigger)

```javascript
// Runs daily to aggregate artist stats
export async function scheduled(event, env, ctx) {
  const { DB } = env;

  // Calculate popularity score based on last 30 days
  // Formula: views * 1 + social_clicks * 3 + shares * 5
  await DB.prepare(`
    UPDATE performers
    SET
      total_views = COALESCE((
        SELECT SUM(page_views)
        FROM artist_daily_stats
        WHERE performer_id = performers.id
      ), 0),
      total_social_clicks = COALESCE((
        SELECT SUM(social_clicks)
        FROM artist_daily_stats
        WHERE performer_id = performers.id
      ), 0),
      popularity_score = COALESCE((
        SELECT
          SUM(page_views) * 1.0 +
          SUM(social_clicks) * 3.0 +
          SUM(share_count) * 5.0
        FROM artist_daily_stats
        WHERE performer_id = performers.id
        AND date >= date('now', '-30 days')
      ), 0)
  `).run();

  // Clean up old daily stats (keep 90 days)
  await DB.prepare(`
    DELETE FROM artist_daily_stats
    WHERE date < date('now', '-90 days')
  `).run();
}
```

### 7.8 Privacy Controls

**File: `frontend/src/components/PrivacyBanner.jsx`**

```jsx
// Minimal, non-intrusive privacy notice
export function PrivacyBanner() {
  const [dismissed, setDismissed] = useState(
    localStorage.getItem('privacy-acknowledged') === 'true'
  );

  if (dismissed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-band-navy/95 p-3 text-sm text-gray-300 border-t border-gray-700">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <p>
          We collect anonymous usage data to improve artist profiles.
          No personal information is stored.
          <a href="/privacy" className="text-band-orange ml-1">Learn more</a>
        </p>
        <button
          onClick={() => {
            localStorage.setItem('privacy-acknowledged', 'true');
            setDismissed(true);
          }}
          className="text-band-orange hover:text-white"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
```

### 7.9 Metrics Dashboard (Admin)

Add to admin panel for viewing aggregated stats:

- Top artists by views (last 7/30/90 days)
- Event popularity trends
- Social link engagement breakdown
- No individual user data visible

### 7.10 Testing Checklist

- [ ] Events are batched correctly
- [ ] Beacon API fallback works
- [ ] No PII in any event payload
- [ ] Analytics Engine writes succeed
- [ ] D1 aggregates update correctly
- [ ] Popularity scores calculate correctly
- [ ] Old data cleanup works
- [ ] Metrics endpoint never fails (always 200)
- [ ] Performance: <5ms added latency

### 7.11 Migration Steps

```sql
-- Migration: 0023_add_metrics_tables.sql

CREATE TABLE IF NOT EXISTS artist_daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  performer_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  page_views INTEGER DEFAULT 0,
  profile_clicks INTEGER DEFAULT 0,
  social_clicks INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(performer_id, date),
  FOREIGN KEY (performer_id) REFERENCES performers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artist_stats_date ON artist_daily_stats(date);
CREATE INDEX IF NOT EXISTS idx_artist_stats_performer ON artist_daily_stats(performer_id);

-- Add aggregated columns to performers
ALTER TABLE performers ADD COLUMN total_views INTEGER DEFAULT 0;
ALTER TABLE performers ADD COLUMN total_social_clicks INTEGER DEFAULT 0;
ALTER TABLE performers ADD COLUMN popularity_score REAL DEFAULT 0;
```

---

## Notes for Codex

- Test CF Workers compatibility for each package before implementing
- Run `npm run test` after each change
- Run `npm run lint` to ensure code style
- Keep backward compatibility for all auth-related changes
- Never break existing user sessions or passwords
- **Metrics must NEVER slow down page loads** - use async/Beacon API
- **Privacy is non-negotiable** - no PII, no fingerprinting, no cross-site tracking
