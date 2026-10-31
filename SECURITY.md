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

**Current posture:** CSP is configured for both document and API responses, with separate policies for each response layer.

**Solution:** Enabled strict CSP with minimal unsafe directives.

**Files Changed:**
- `frontend/public/_headers` - document CSP for static and HTML responses
- `functions/_middleware.js` - API response CSP

The exact directives are maintained in those two files. The document policy
includes Turnstile support and a hash allowlist for the theme-flash script;
keep it strict and do not add `unsafe-inline` to script execution.

### P1-8: Fixed CORS Validation

**Problem:** CORS middleware set `Access-Control-Allow-Origin` even for invalid origins.

**Solution:** Strict origin validation - only allowed origins receive CORS headers.

**Files Changed:**
- `functions/_middleware.js` - Validate origin before setting headers

**Allowed Origins:**
- Production: `https://settimes.ca`, `https://www.settimes.ca`
- Preview: none built in. A preview's own alias is added through `CORS_ALLOWED_ORIGINS` (edge E2E uses `https://edge-e2e.longweekend-bandcrawl.pages.dev`).
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
| **editor** | Create/edit events and bands, create venues, archive events; cannot edit or delete existing venues, delete events, or manage users |
| **viewer** | Read-only access to admin panel |

### Role Hierarchy

```text
admin (level 3) > editor (level 2) > viewer (level 1)
```

Higher roles inherit lower role permissions.

### Permission Checks

All admin endpoints use `checkPermission()` middleware:

```javascript
const permCheck = await checkPermission(context, "editor");
if (permCheck.error) {
  return permCheck.response; // 401 or 403
}
```

---

## Session Management

### Session Cookies

Sessions use the direct D1 session manager in `functions/utils/auth.js`, backed by `lucia_sessions`.

| Property | Value |
|----------|-------|
| **Production cookie name** | `__Host-session_token` |
| **Dev cookie name** | `session_token` |
| **HTTPOnly** | Yes (not accessible to JavaScript) |
| **Secure** | Yes in production (enforced by `__Host-` prefix) |
| **SameSite** | Strict (prevents CSRF) |
| **Expiry** | Admins: 15 minutes idle / 8 hours absolute. Other users: 30 minutes idle / 30 days absolute. |

The `__Host-` prefix also enforces `Path=/` and prohibits a `Domain` attribute, preventing subdomain injection attacks.

### MFA & Trusted Devices

When TOTP MFA is enabled, login is a two-step flow:
1. Password check → issues a short-lived `mfa_challenges` token (5 minutes)
2. TOTP/backup-code verification → issues the full D1 session

Optionally, users can choose "Remember this device" to skip MFA for 30 days. Trusted device tokens are stored as `__Host-trusted_device` (SHA-256 hashed in DB) and validated against the stored SHA-256 hashes of the IP address and User-Agent string from when the device was registered.

### Session Lifecycle

1. **Creation:** Successful MFA verification calls the direct D1 session manager
2. **Storage:** Session ID stored in `lucia_sessions` table with IP + UA metadata
3. **Validation:** `_middleware.js` reads and validates the session ID on every admin request
4. **Activity:** `last_activity_at` is updated on successful validation
5. **Expiration:** Admin sessions expire after 15 minutes idle or 8 hours absolute; other sessions after 30 minutes idle or 30 days absolute
6. **Logout:** The session row is deleted and cookies are cleared

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
- Password length (12+ characters)
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

The browser-enforced document policy is in `frontend/public/_headers`. API JSON responses receive the separate policy from `functions/_middleware.js`.

The document policy is maintained in `_headers`; do not describe it as a Helmet or Express configuration.

### Notes

- The document policy includes the Turnstile origins and a hash allowlist for the theme-flash script.
- API responses use the policy assembled by `functions/_middleware.js`.

---

## CORS Configuration

### Allowed Origins

Configured in: `functions/_middleware.js`

**Production:**
- `https://settimes.ca`
- `https://www.settimes.ca`

**Preview:** none built in. Each preview environment adds its own alias through `CORS_ALLOWED_ORIGINS`. Never list a `*.pages.dev` name we do not own: anyone can claim an unused one and would get credentialed CORS (#1310).

**Local Development:**
- `http://localhost:5173` (Vite)
- `http://localhost:3000` (Express)
- `http://localhost:8788` (Wrangler)
- `http://127.0.0.1:5173`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:8788`

`CORS_ALLOWED_ORIGINS` adds comma-separated origins to this fixed list.

### Credentials

CORS requests with credentials (`credentials: 'include'`) only allowed from approved origins.

---

## Deployment Security

### Environment Variables

**Production secrets in Cloudflare Pages (set in the dashboard, never commit):**

```bash
CSRF_SECRET=<secret>                       # Required; CSRF HMAC key
MFA_TOTP_ENCRYPTION_KEY=<secret>            # Required for encrypted TOTP secrets; never rotate after use
TURNSTILE_SECRET_KEY=<secret>              # Required; production bot protection fails closed when absent
CRON_SECRET=<secret>                       # Required by the scheduled-job endpoint
PUBLIC_URL=https://settimes.ca
EMAIL_PROVIDER=postmark|mailchannels|resend
EMAIL_FROM=<sender address>
POSTMARK_API_TOKEN=<secret>                # If EMAIL_PROVIDER=postmark
RESEND_API_KEY=<secret>                    # If EMAIL_PROVIDER=resend
PUBLIC_DATA_PUBLISH_ENABLED=true
CORS_ALLOWED_ORIGINS=<comma-separated extras> # Optional
ENVIRONMENT=production
```

`CF_PAGES_API_TOKEN` and `CF_ACCOUNT_ID` are GitHub Actions secrets, not application runtime variables. Keep all production variables that are configured in Pages as secrets. A deploy using `wrangler.toml` can replace dashboard plain-text variables; the preview block documents this behavior.

### Database Setup

Follow [the deployment guide](DEPLOYMENT.md) for database creation and migration operations. The schema source is the numbered files in `migrations/`; the production workflow applies them before deploying and verifies the live schema. `database/setup-complete.sql` is the consolidated local bootstrap reference. Do not apply ad-hoc legacy schema files to production.

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

- WebAuthn/passkey support
- Additional penetration testing
- Further least-privilege and audit coverage as new features land

---

## Contact

**Security Issues:** Prefer GitHub's private vulnerability reporting. You can also report to `security@settimes.ca`.

**General Questions:** Create an issue on GitHub with the `security` label.

---

**Remember:** Security is a continuous process, not a one-time fix. Regularly review and update security measures.
