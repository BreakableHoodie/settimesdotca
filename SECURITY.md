# Security Documentation - SetTimes.ca

**Last Updated:** 2026-04-30
**Version:** 2.2 (April 2026 Review)

---

## Table of Contents

1. [Security Overview](#security-overview)
2. [Critical Security Fixes](#critical-security-fixes)
3. [Authentication & Authorization](#authentication--authorization)
4. [Session Management](#session-management)
5. [CSRF Protection](#csrf-protection)
6. [Input Validation & Sanitization](#input-validation--sanitization)
7. [Content Security Policy](#content-security-policy)
8. [CORS Configuration](#cors-configuration)
9. [Deployment Security](#deployment-security)
10. [Security Best Practices](#security-best-practices)

---

## Security Overview

This application implements defense-in-depth security with multiple layers of protection:

- ✅ **HTTPOnly session cookies** - Protects against XSS token theft
- ✅ **CSRF tokens** - Prevents cross-site request forgery
- ✅ **Invite-only signup** - Prevents unauthorized account creation
- ✅ **Content Security Policy** - Mitigates XSS and injection attacks
- ✅ **Strict CORS** - Prevents unauthorized cross-origin requests
- ✅ **PBKDF2 password hashing** - 100,000 iterations with SHA-256
- ✅ **Role-based access control** - Admin, Editor, Viewer roles
- ✅ **TOTP MFA** - Time-based one-time password with backup codes
- ✅ **Trusted device** - 30-day device remembrance validated by IP + User-Agent hash
- ✅ **Comprehensive audit logging** - All actions tracked
- ✅ **Rate limiting** - Prevents brute force attacks
- ✅ **DOMPurify** - Rich-text HTML sanitization

---

## Critical Security Fixes

### P0-1: Invite-Only Signup System

**Problem:** Public signup endpoint allowed unlimited account creation.

**Solution:** Implemented invite code system requiring valid, unexpired invite codes for all signups.

**Files Changed:**
- `database/migration-invite-codes.sql` - Invite codes table
- `functions/api/admin/invite-codes.js` - Admin invite management
- `functions/api/admin/auth/signup.js` - Invite code validation

**Usage:**
```bash
# Create invite code
node scripts/create-admin-invite.js --prod

# Insert into database
wrangler d1 execute settimes-db --command="INSERT INTO invite_codes..."

# Use during signup
POST /api/admin/auth/signup
{
  "email": "user@example.com",
  "password": "<your-strong-password>",
  "name": "User Name",
  "inviteCode": "generated-uuid-here"
}
```

### P0-2: Removed Hardcoded Credentials

**Problem:** Default admin credentials were hardcoded in migration files and docs.

**Solution:** Removed plaintext credentials. Demo passwords are now set locally via environment variables during setup.

**Files Changed:**
- `database/migration-rbac-sprint-1-1.sql` - Removed default admin
- `scripts/create-admin-invite.js` - Helper script for first-time setup

### P0-3: HTTPOnly Cookies + CSRF Protection

**Problem:** Session tokens stored in `sessionStorage`, vulnerable to XSS attacks.

**Solution:** Migrated to HTTPOnly cookies with double-submit CSRF token pattern.

**Files Changed:**
- `functions/utils/cookies.js` - Cookie utilities
- `functions/utils/csrf.js` - CSRF token generation/validation
- `functions/api/admin/auth/login.js` - Set HTTPOnly cookie
- `functions/api/admin/auth/signup.js` - Set HTTPOnly cookie
- `functions/api/admin/auth/logout.js` - Clear cookies
- `functions/api/admin/_middleware.js` - Read cookie, validate CSRF
- `frontend/src/utils/adminApi.js` - Use cookies instead of sessionStorage

**Flow:**
1. Login/signup returns CSRF token in JSON and sets HTTPOnly session cookie
2. Client stores CSRF token in memory
3. Client sends CSRF token in `X-CSRF-Token` header with state-changing requests
4. Server validates: cookie token exists AND matches header token
5. Logout clears both cookies

### P0-4: Content Security Policy (CSP)

**Problem:** CSP disabled, leaving app vulnerable to XSS and injection attacks.

**Solution:** Enabled strict CSP with minimal unsafe directives.

**Files Changed:**
- `backend/server.js` - Helmet CSP configuration

**CSP Directives:**
```javascript
{
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind needs inline
  imgSrc: ["'self'", "data:", "https:"],
  fontSrc: ["'self'", "data:"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  frameSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  upgradeInsecureRequests: []
}
```

### P1-8: Fixed CORS Validation

**Problem:** CORS middleware set `Access-Control-Allow-Origin` even for invalid origins.

**Solution:** Strict origin validation - only allowed origins receive CORS headers.

**Files Changed:**
- `functions/_middleware.js` - Validate origin before setting headers

**Allowed Origins:**
- Production: `https://settimes.ca`, `https://www.settimes.ca`
- Preview: `https://dev.settimes.pages.dev`, `https://settimes.pages.dev`
- Local: `http://localhost:5173`, `http://localhost:3000`, `http://localhost:8788`

### P1-10: Service Worker Security

**Problem:** Service worker cached sensitive admin API responses.

**Solution:** Exclude all `/api/admin/` routes from caching.

**Files Changed:**
- `frontend/public/sw.js` - Never cache admin routes

---

## Authentication & Authorization

### User Roles

| Role | Permissions |
|------|------------|
| **admin** | Full access: manage users, all CRUD operations, view audit logs |
| **editor** | Create/edit events, bands, venues; cannot manage users |
| **viewer** | Read-only access to admin panel |

### Role Hierarchy

```
admin (level 3) > editor (level 2) > viewer (level 1)
```

Higher roles inherit lower role permissions.

### Permission Checks

All admin endpoints use `checkPermission()` middleware:

```javascript
const permCheck = await checkPermission(request, env, "editor");
if (permCheck.error) {
  return permCheck.response; // 401 or 403
}
```

---

## Session Management

### Session Cookies

Sessions are managed by **Lucia auth v3** using a Cloudflare D1 (`lucia_sessions`) backend.

| Property | Value |
|----------|-------|
| **Production cookie name** | `__Host-session_token` |
| **Dev cookie name** | `session_token` |
| **HTTPOnly** | Yes (not accessible to JavaScript) |
| **Secure** | Yes in production (enforced by `__Host-` prefix) |
| **SameSite** | Strict (prevents CSRF) |
| **Expiry** | 30 days (absolute); sliding on activity |

The `__Host-` prefix also enforces `Path=/` and prohibits a `Domain` attribute, preventing subdomain injection attacks.

### MFA & Trusted Devices

When TOTP MFA is enabled, login is a two-step flow:
1. Password check → issues a short-lived `mfa_challenges` token (5 minutes)
2. TOTP/backup-code verification → issues the full Lucia session

Optionally, users can choose "Remember this device" to skip MFA for 30 days. Trusted device tokens are stored as `__Host-trusted_device` (SHA-256 hashed in DB) and validated against the stored SHA-256 hashes of the IP address and User-Agent string from when the device was registered.

### Session Lifecycle

1. **Creation:** Successful MFA verification calls `lucia.createSession(userId, {})`
2. **Storage:** Session ID stored in `lucia_sessions` table with IP + UA metadata
3. **Validation:** `_middleware.js` reads the session cookie with `lucia.readSessionCookie()` and validates the resulting ID with `lucia.validateSession(sessionId)` on every admin request
4. **Activity:** `last_used_at` updated on successful validation; sessions slide on activity
5. **Expiration:** Sessions expire after 30 days of inactivity
6. **Logout:** `lucia.invalidateSession()` deletes the DB row; cookies cleared

---

## CSRF Protection

### Double-Submit Cookie Pattern

1. Server generates CSRF token on login/signup
2. Server sends token in JSON response AND sets `csrf_token` cookie (NOT HttpOnly)
3. Client stores token in memory
4. Client sends token in `X-CSRF-Token` header with requests
5. Server validates: cookie value === header value

### Validation Rules

- **Required for:** POST, PUT, DELETE, PATCH
- **Skipped for:** GET, HEAD, OPTIONS, auth endpoints
- **Failure:** 403 Forbidden

### Implementation

```javascript
// Server: Generate and send
const csrfToken = generateCSRFToken();
headers.append("Set-Cookie", setCSRFCookie(csrfToken));
return { ...response, csrfToken };

// Client: Send with requests
headers: {
  'Content-Type': 'application/json',
  'X-CSRF-Token': csrfToken
}

// Server: Validate
const valid = validateCSRFToken(request);
if (!valid) return 403;
```

---

## Input Validation & Sanitization

### Current Validation

File: `frontend/src/utils/validation.js`

- **DOMPurify** sanitizes all rich-text HTML before it is stored or rendered ✅
- Parameterized queries for all D1 SQL ✅
- React escapes plain-text output automatically ✅
- Server-side validation on all admin endpoints (email format, required fields, length limits)

### Server-Side Validation

All endpoints validate:
- Email format (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`)
- Password length (8+ characters)
- Required fields
- Data types
- Length limits (future enhancement)

---

## Content Security Policy

### Policy Goals

1. Prevent XSS attacks
2. Block inline script execution
3. Restrict resource loading
4. Prevent clickjacking

### Configuration

Location: `frontend/public/_headers` (Cloudflare Pages)

```javascript
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind CSS
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
})
```

### Notes

- `'unsafe-inline'` for styles: Required by Tailwind CSS
- Consider using nonces for inline scripts if needed
- Test thoroughly after any CSP changes

---

## CORS Configuration

### Allowed Origins

Configured in: `functions/_middleware.js`

**Production:**
- `https://settimes.ca`
- `https://www.settimes.ca`

**Preview/Staging:**
- `https://dev.settimes.pages.dev`
- `https://settimes.pages.dev`

**Local Development:**
- `http://localhost:5173` (Vite)
- `http://localhost:3000` (Express)
- `http://localhost:8788` (Wrangler)
- `http://127.0.0.1:*` (all above)

### Credentials

CORS requests with credentials (`credentials: 'include'`) only allowed from approved origins.

---

## Deployment Security

### Environment Variables

**Required secrets in Cloudflare Pages (set via dashboard, never commit):**

```bash
CSRF_SECRET=<32+ byte random hex>          # HMAC key for CSRF tokens
MFA_ENCRYPTION_KEY=<32 byte hex>           # AES-256 key for TOTP secrets at rest
TURNSTILE_SECRET_KEY=<from Cloudflare>     # Bot protection for public forms
CF_PAGES_API_TOKEN=<from Cloudflare>       # CI deployment token (GitHub secret)
CF_ACCOUNT_ID=<from Cloudflare>            # CI deployment (GitHub secret)
```

**Optional:**
```bash
ENVIRONMENT=development   # Set in dev environment to relax __Host- cookie prefix
RESEND_API_KEY=<key>      # Email delivery for subscription notifications
```

### Database Setup

1. Create D1 database:
   ```bash
   wrangler d1 create settimes-db
   ```

2. Run migrations:
   ```bash
   wrangler d1 execute settimes-db --file=database/schema.sql
   wrangler d1 execute settimes-db --file=database/migration-rbac-sprint-1-1.sql
   wrangler d1 execute settimes-db --file=database/migration-invite-codes.sql
   ```

3. Create first admin invite:
   ```bash
   node scripts/create-admin-invite.js --prod
   wrangler d1 execute settimes-db --command="INSERT INTO invite_codes (code, role, expires_at, is_active) VALUES ('UUID-HERE', 'admin', datetime('now', '+7 days'), 1);"
   ```

4. Sign up with invite code at your production URL

### R2 Bucket (Band Photos)

```bash
wrangler r2 bucket create settimes-band-photos
```

Bind in Cloudflare Pages dashboard: Settings > Functions > R2 bucket bindings

---

## Security Best Practices

### For Developers

1. **Never commit secrets** - Use `.env`, `.dev.vars` (gitignored)
2. **Use parameterized queries** - Already implemented ✅
3. **Validate all inputs** - Server-side validation required
4. **Sanitize outputs** - Use DOMPurify or React's built-in escaping
5. **Review pull requests** - Security-focused code review
6. **Run security tests** - OWASP ZAP, penetration testing
7. **Update dependencies** - `npm audit`, Dependabot
8. **Follow principle of least privilege** - Minimal permissions
9. **Log security events** - Audit log already implemented ✅
10. **Test authentication flows** - Automated and manual testing

### For Administrators

1. **Use strong passwords** - 16+ characters, password manager
2. **Enable 2FA** - Use TOTP via the admin panel settings
3. **Rotate passwords** - Every 3-6 months
4. **Review audit logs** - Monthly security review
5. **Limit admin accounts** - Only trusted personnel
6. **Revoke access immediately** - When someone leaves
7. **Monitor failed logins** - Check `auth_attempts` table
8. **Secure invite codes** - Never share via email/SMS
9. **Use HTTPS always** - Never access admin panel over HTTP
10. **Keep backups** - Regular D1 database backups

---

## Security Incident Response

### If Breach Suspected

1. **Immediate Actions:**
   - Disable affected accounts
   - Rotate all passwords
   - Revoke all sessions
   - Review audit logs

2. **Investigation:**
   - Check `auth_attempts` table
   - Review `audit_log` table
   - Analyze access patterns
   - Identify attack vector

3. **Remediation:**
   - Patch vulnerabilities
   - Update dependencies
   - Strengthen affected controls
   - Deploy fixes

4. **Post-Incident:**
   - Document incident
   - Update security procedures
   - Train team
   - Notify affected users (if required)

---

## Security Checklist for Production

- [ ] All P0 security fixes applied
- [ ] Environment variables set in Cloudflare Pages
- [ ] Database migrations run
- [ ] First admin account created via invite code
- [ ] HTTPS enforced (automatic with Cloudflare)
- [ ] CSP enabled and tested
- [ ] CORS restricted to production domains
- [ ] Session cookies HTTPOnly
- [ ] CSRF protection enabled
- [ ] Audit logging working
- [ ] Rate limiting configured
- [ ] Dependencies updated
- [ ] Security testing completed
- [ ] Backup strategy implemented
- [ ] Incident response plan documented

---

## Future Security Enhancements

### Priority 1 (Next Sprint)
- [ ] Implement email verification
- [ ] Sliding session expiration
- [ ] Account lockout after failed logins
- [ ] Password complexity requirements (12+ chars, mixed case, numbers, symbols)

### Priority 2 (Next Month)
- [ ] DOMPurify for HTML sanitization
- [ ] Server-side input length limits
- [ ] Generic error messages (prevent email enumeration)
- [ ] Complete audit logging (all operations)
- [ ] API rate limiting per endpoint

### Priority 3 (Backlog)
- [ ] WebAuthn/Passkey support
- [ ] Security headers review
- [ ] Automated security scanning in CI/CD
- [ ] Penetration testing
- [ ] Bug bounty program

---

## Contact

**Security Issues:** Report to [security@settimes.ca] or create a private security advisory on GitHub.

**General Questions:** Create an issue on GitHub with the `security` label.

---

**Remember:** Security is a continuous process, not a one-time fix. Regularly review and update security measures.
