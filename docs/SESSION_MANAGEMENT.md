# Session Management and Timeout Policy

This document describes the current session model used by the SetTimes admin experience.

## Current Session Architecture

SetTimes uses Lucia-backed server-side sessions stored in D1.

- Server-side session store: `lucia_sessions`
- Session cookie: `__Host-session_token` in production, `session_token` in local development
- CSRF cookie: `csrf_token` for the double-submit CSRF pattern
- Client-side persistence: localStorage stores display-only user fields such as email, name, and role. It does not store the session secret.

The session identifier remains in an HttpOnly cookie and is not available to JavaScript.

Key implementation references:

- `functions/utils/auth.js`
- `functions/api/admin/_middleware.js`
- `functions/api/admin/me.js`
- `frontend/src/utils/adminApi.js`
- `frontend/src/admin/hooks/useAdminAuthSession.js`

## Timeout Policy

The timeout model is server-driven.

### Admin sessions

- Idle timeout: 15 minutes
- Absolute maximum lifetime: 8 hours

### Non-admin authenticated sessions

- Idle timeout: 30 minutes
- Absolute maximum lifetime: 30 days

The middleware checks both limits on every authenticated `/api/admin/*` request. If either limit is exceeded, the server invalidates the session and clears the session cookie.

## Client Behavior

The admin frontend checks the current session via `GET /api/admin/me`.

- A valid response refreshes the local UI state and updates session-timing headers.
- A `401` response is treated as a real authentication failure and logs the user out.
- A temporary `5xx`, parse failure, or network problem is treated as a transient verification failure and should not immediately sign out a user who already has valid local admin state.

This distinction exists to avoid losing in-progress admin work during temporary Cloudflare, D1, or connectivity faults.

## Idle Warning and Logout UX

The admin UI displays a warning dialog shortly before enforced logout.

- Warning lead time: 5 minutes before the current server-reported expiry window
- Warning actions: `Stay signed in` or `Log out`
- If the user is logged out for inactivity, the login screen shows: `You were signed out due to inactivity. Please sign in again.`

`Stay signed in` triggers a fresh session verification. If that verification fails transiently, the UI keeps the existing admin state instead of treating the failure as an immediate logout.

## Session Security Properties

- Session cookies are HttpOnly
- Production cookies use the `__Host-` prefix and `SameSite=Strict`
- CSRF protection uses a double-submit token cookie plus `X-CSRF-Token`
- Session expiry enforcement happens server-side, not only in the browser
- The session metadata returned to the browser excludes raw session identifiers

## Session-Related Endpoints

These routes are currently used for authenticated self-service inside the admin portal namespace:

- `GET /api/admin/me`: returns authenticated user info and safe session expiry metadata
- `GET /api/admin/sessions`: returns safe session metadata for the current user without raw session IDs
- `DELETE /api/admin/sessions`: revokes a specific session when a server-known session ID is supplied
- `POST /api/admin/sessions/revoke-all`: revokes all other sessions and rotates the current session
- `GET /api/admin/trusted-devices`: lists trusted devices for the current user
- `DELETE /api/admin/trusted-devices`: revokes a trusted device

## Operational Notes

- Temporary server or network failures should be investigated as availability problems, not assumed to be session expiry.
- Session cleanup for expired rows is handled by the maintenance cleanup flow against `lucia_sessions`.
- If an account is deactivated, subsequent authenticated requests fail even if the cookie is still present.

## Testing Guidance

Useful checks when changing session behavior:

1. Verify that `GET /api/admin/me` returns safe session metadata only.
2. Verify that `GET /api/admin/sessions` does not expose raw `lucia_sessions.id` values.
3. Verify that transient `5xx` failures during session verification do not immediately sign out an already authenticated admin.
4. Verify that real `401` responses still clear admin state and redirect to login.
5. Verify that idle warning timing matches server-provided expiry headers.

## Related Docs

- `docs/ADMIN_HANDBOOK.md`
- `docs/TROUBLESHOOTING.md`
- `SECURITY.md`
