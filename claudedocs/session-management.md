# Session Management and Expiration

## Overview

The application implements secure session management with automatic expiration and redirect to prevent unauthorized access after sessions expire.

## Session Configuration

### Backend (functions/api/admin/auth/login.js)

**Session Duration**: 30 minutes (line 153)
```javascript
const expiresAt = new Date(Date.now() + 30 * 60000).toISOString(); // 30 min default
```

**Session Validation** (functions/api/admin/_middleware.js):
- Checks `sessions.expires_at > datetime('now')` (line 26)
- Updates `last_activity_at` on each request (line 35)
- Returns 401 Unauthorized when session is invalid or expired (line 84)

## Frontend Session Handling

### Automatic Redirect on Expiration (frontend/src/utils/adminApi.js)

**Implementation** (lines 22-32):
```javascript
async function handleResponse(response) {
  // Check for 401 Unauthorized - session expired
  if (response.status === 401) {
    // Clear session storage
    window.sessionStorage.clear()

    // Redirect to login page
    window.location.href = '/admin/login'

    // Throw error to prevent further processing
    throw new Error('Session expired. Please log in again.')
  }
  // ... rest of response handling
}
```

### What Happens When Session Expires

1. **User Action**: User attempts any admin operation after 30 minutes of session creation
2. **Backend Response**: Server returns 401 with message "Valid session required"
3. **Frontend Detection**: `handleResponse()` catches the 401 status code
4. **Session Cleanup**: All session data cleared from `sessionStorage`
5. **Automatic Redirect**: User immediately redirected to `/admin/login`
6. **User Experience**: User sees login screen and can log in again

## Security Benefits

✅ **Automatic Cleanup**: Session data removed immediately on expiration
✅ **No Lingering Access**: Users cannot continue using expired sessions
✅ **Clear UX**: Automatic redirect prevents confusing error messages
✅ **Secure by Default**: No manual intervention required from users

## Session Storage Data

When authenticated, the following data is stored in `sessionStorage`:
- `sessionToken`: UUID for session identification
- `userEmail`: User's email address
- `userName`: User's display name
- `userRole`: User's role (e.g., "admin")

All of this data is cleared on:
- Session expiration (automatic)
- Manual logout
- 401 response from any API call

## Testing Session Expiration

To test session expiration behavior:

1. Log in to the admin panel
2. Wait 30 minutes (or manually expire session in database)
3. Attempt any admin operation (edit band, create event, etc.)
4. **Expected Result**: Immediate redirect to login screen

## Future Enhancements

Potential improvements:
- Configurable session duration per user role
- "Remember me" option for longer sessions
- Activity-based extension (extend session on activity)
- Session timeout warning (notify before expiration)
- Refresh token mechanism for seamless re-authentication
