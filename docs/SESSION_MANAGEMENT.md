# Session Management and Timeout Policy

This document describes session handling, authentication, and timeout policies for the Long Weekend Band Crawl application.

## Current Implementation

### Session Storage

**JWT-based authentication** with sessions stored in:

- **Client**: `localStorage` (auth token, user info)
- **Server**: Stateless JWT validation (no server-side session storage)

### Session Timeout

**Default timeout: 24 hours**

Sessions automatically expire after 24 hours from login. This is enforced through JWT token expiration.

```javascript
// Backend: functions/_middleware.js
const token = jwt.sign(
  { userId: user.id },
  env.JWT_SECRET,
  { expiresIn: "24h" }, // ← Session timeout
);
```

### Token Refresh

**Current behavior**: No automatic token refresh. Users must re-login after 24 hours.

**Recommended improvement**: Implement sliding session (refresh on activity).

## Security Features

### Token Invalidation

Tokens are invalidated on:

- ✅ Manual logout (client clears localStorage)
- ✅ Token expiration (24h)
- ✅ Password reset (server invalidates old tokens)
- ❌ No server-side token revocation (stateless design)

### Session Hijacking Protection

Current protections:

- ✅ HTTPS-only in production (Cloudflare Pages enforces TLS)
- ✅ HttpOnly cookies would be better (future improvement)
- ✅ JWT signature validation prevents tampering
- ⚠️ No IP binding (mobile users change IPs frequently)

### Concurrent Sessions

**Current behavior**: Multiple sessions allowed. Users can log in from multiple devices simultaneously.

**Security trade-off**: Convenience vs security. No session limit currently enforced.

## User Experience

### Timeout Warning

**Current behavior**: ❌ No warning before session expiration.

**Recommended**: Add countdown notification at 23:45 (15 minutes before expiry).

```javascript
// Recommended implementation
function checkSessionExpiry() {
  const token = localStorage.getItem("auth_token");
  if (!token) return;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const expiresAt = payload.exp * 1000; // Convert to milliseconds
    const now = Date.now();
    const timeLeft = expiresAt - now;

    if (timeLeft < 15 * 60 * 1000 && timeLeft > 0) {
      // Show warning: "Session expires in 15 minutes"
      showSessionWarning(timeLeft);
    }
  } catch (e) {
    console.error("Failed to parse token:", e);
  }
}

// Check every 5 minutes
setInterval(checkSessionExpiry, 5 * 60 * 1000);
```

### Auto-Logout on Expiry

**Current behavior**: ❌ UI doesn't detect expired sessions automatically.

Users only discover session expiry when API calls fail with 401.

**Recommended**: Add expiry check on app initialization and periodic intervals.

### Remember Me

**Current behavior**: ❌ Not implemented.

**Recommended**: Offer extended session option (7 days) with explicit user consent.

```javascript
// Recommended implementation
function login(email, password, rememberMe = false) {
  const expiresIn = rememberMe ? "7d" : "24h";

  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn });

  return { token, expiresIn };
}
```

## Admin Sessions

### Shorter Timeout for Admins

**Recommended**: Reduce admin session timeout to 4-8 hours for enhanced security.

```javascript
// Recommended middleware enhancement
function createSession(user) {
  const isAdmin = user.role === "admin";
  const expiresIn = isAdmin ? "4h" : "24h";

  return jwt.sign({ userId: user.id, role: user.role }, env.JWT_SECRET, {
    expiresIn,
  });
}
```

### Force Re-Authentication for Sensitive Actions

**Current behavior**: ❌ No re-authentication required for destructive actions.

**Recommended**: Require password confirmation for:

- Bulk delete operations
- User management changes
- Publishing/unpublishing events

## Session Security Checklist

### Current Status

- [x] JWT-based authentication
- [x] 24-hour session timeout
- [x] HTTPS in production
- [x] Token expiration validation
- [ ] Session timeout warning UI
- [ ] Sliding session (refresh on activity)
- [ ] HttpOnly cookies (more secure than localStorage)
- [ ] Remember Me option
- [ ] Admin session timeout (shorter than regular users)
- [ ] Re-authentication for sensitive actions
- [ ] Server-side token revocation

### Priority Improvements

**HIGH (Next Sprint)**:

1. Add session timeout warning (15 minutes before expiry)
2. Auto-logout on token expiry with redirect to login
3. Sliding session refresh on API activity

**MEDIUM (Future)**: 4. Implement "Remember Me" with 7-day option 5. Reduce admin session timeout to 4 hours 6. Require re-authentication for destructive bulk operations

**LOW (Long-term)**: 7. Migrate from localStorage to HttpOnly cookies 8. Implement server-side token revocation list (Redis/KV) 9. Add session management UI (view/revoke active sessions)

## Testing Session Behavior

### Manual Testing

```bash
# Test session expiry
1. Login to admin panel
2. Wait 24 hours (or modify JWT expiresIn to '1m' for testing)
3. Attempt API operation
4. Expected: 401 Unauthorized

# Test logout
1. Login to admin panel
2. Check localStorage: auth_token should exist
3. Click logout
4. Check localStorage: auth_token should be removed
5. Attempt to access admin routes
6. Expected: Redirect to login
```

### Automated Testing

```javascript
// Recommended test suite
describe("Session Management", () => {
  it("should expire session after 24 hours", async () => {
    const expiredToken = jwt.sign(
      { userId: 1 },
      JWT_SECRET,
      { expiresIn: "-1h" }, // Already expired
    );

    const response = await fetch("/api/admin/bands", {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });

    expect(response.status).toBe(401);
  });

  it("should clear token on logout", () => {
    localStorage.setItem("auth_token", "test_token");
    logout();
    expect(localStorage.getItem("auth_token")).toBeNull();
  });
});
```

## References

- JWT specification: https://jwt.io/introduction
- OWASP Session Management: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- Project auth middleware: `functions/_middleware.js`
- Admin login component: `frontend/src/admin/Login.jsx`
