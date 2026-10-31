# SetTimes API Documentation

Current API contract for the Cloudflare Pages Functions implementation in `functions/api`.

## Overview

SetTimes exposes two API surfaces:

- Public read endpoints for published schedules, events, bands, calendar feeds, and privacy-safe telemetry.
- Admin endpoints for invite-based account onboarding, session-backed authentication, MFA, and event/catalog administration.

### Base URLs

- Production: `https://settimes.ca`
- Local Pages development: `http://localhost:8788`
- Branch or preview deployments: the active Cloudflare Pages preview URL

### Common behavior

- JSON is the default response format unless a route explicitly returns HTML or `text/calendar`.
- Dates use `YYYY-MM-DD`; times use `HH:MM`.
- Public schedule and discovery routes fail closed when `PUBLIC_DATA_PUBLISH_ENABLED` is unset or falsey. In that state they return `503` with `Retry-After: 3600`.
- Some older compatibility handlers still exist for admin routes. The inventory below reflects the routes the current frontend and handler set expect.

## Authentication and Security

### Admin session model

SetTimes no longer uses the earlier shared-password admin flow. Admin access is per-user and invite-based:

1. `POST /api/admin/auth/signup` creates an inactive account from a valid invite code.
2. `POST /api/auth/activate` activates the account from the emailed activation token.
3. `POST /api/admin/auth/login` validates credentials.
4. If MFA is enabled, login returns `mfaRequired: true` plus a short-lived `mfaToken`, and the client completes `POST /api/admin/auth/mfa/verify`.
5. On success, the server sets a session cookie and a readable `csrf_token` cookie.

### Cookies and CSRF

- Local development uses `session_token`; deployed environments use `__Host-session_token`.
- Authenticated `POST`, `PUT`, `PATCH`, and `DELETE` admin requests must echo the `csrf_token` cookie value in the `X-CSRF-Token` header.
- Pre-session auth routes (`/api/admin/auth/login`, `/api/admin/auth/signup`, `/api/admin/auth/mfa/verify`) rely on same-origin validation instead of the double-submit token because no session cookie exists yet.
- `POST /api/admin/auth/logout` is fully CSRF-protected.

### Timeouts and roles

- Admin idle timeout: 15 minutes
- Admin absolute timeout: 8 hours
- Role hierarchy: `viewer` < `editor` < `admin`
- Non-production bearer-token header auth is only available when `ALLOW_HEADER_AUTH=true` and `ENVIRONMENT != production`; it is not part of the production contract.

## Public API

### Discovery and read endpoints

| Route                           | Method | Notes                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/schedule`                 | `GET`  | Returns `{ event, bands }` for `event=current` or a specific event slug. Archived events are readable by slug. When `event=current` has no published current or upcoming event, the route returns `404` with `{ error: "Event not found", message: "No published events available" }`. Cache TTL comes from `SCHEDULE_CACHE_TTL_SECONDS` and defaults to 60 seconds. |
| `/api/events/public`            | `GET`  | Public event listing with filters for `city`, `genre`, `limit` (max 100), and `upcoming` (defaults to true). Returns `{ events, filters, count, generated_at }`.                                                                                                                                                                                                     |
| `/api/events/timeline`          | `GET`  | Grouped timeline response with `now`, `upcoming`, and `past`. Supports `now`, `upcoming`, `past`, `includeBands`, and `pastLimit` (1-100, default 10).                                                                                                                                                                                                               |
| `/api/events/{id}/details`      | `GET`  | Returns one published or archived event with `bands`, `venues`, `band_count`, and `venue_count`. `{id}` must be numeric.                                                                                                                                                                                                                                             |
| `/api/bands/{name}`             | `GET`  | Returns a public band profile plus published performance history. `{name}` may be a numeric band ID or a normalized band name.                                                                                                                                                                                                                                       |
| `/api/events/{id}/recap`        | `GET`  | Returns `{ event, stats, bands }` for an **archived** event. `{id}` may be numeric or a slug. `stats` aggregates `total_sets`, `venue_count`, `first_timers`, and `returning_acts`. Gated by `PUBLIC_DATA_PUBLISH_ENABLED`; cacheable for 1 hour.                                                                                                                    |
| `/api/bands/stats/{name}`       | `GET`  | Extended band profile endpoint with aggregate stats, upcoming shows, and history across published and archived events.                                                                                                                                                                                                                                               |
| `/api/artists/shuffle`          | `GET`  | Five randomly chosen artists from the public roster, for the `/artists` showcase. Sends `Cache-Control: no-store` rather than the shared browse tier, because a 300s cache would serve everyone the same five for five minutes. Gated by `PUBLIC_DATA_PUBLISH_ENABLED`.                                                                                              |
| `/api/artists/one-of-one`       | `GET`  | Genres represented by exactly one artist across published or archived events. Gated by `PUBLIC_DATA_PUBLISH_ENABLED`; cached 5 minutes.                                                                                                                                                                                                                              |
| `/api/bands/{name}/stage-mates` | `GET`  | Co-performers on shared events, most-shared first, capped at 20. `{name}` is spelled that way because sibling follow routes already bind the parameter and Pages cannot host `[name]/` and `[id]/` at one level; the VALUE is the canonical `band_profiles.id`, and a slug is also accepted. On a staged-reveal event both sides of the join must be announced.      |
| `/api/feeds/ical`               | `GET`  | Returns `text/calendar` content. Supports `city` and `genre` (both default to `all`) and `band` (a `band_profiles.id`: one artist's upcoming sets, named "<artist> on settimes.ca"; malformed id 400, unknown 404, no upcoming sets a valid empty calendar).                                                                                                                                                                                                                                                                                 |
| `/api/metrics`                  | `POST` | Privacy-safe metrics ingestion. Accepts up to 50 events per batch and always answers `200 OK` on malformed or rejected payloads.                                                                                                                                                                                                                                     |
| `/api/schedule/build`           | `POST` | Records schedule-build analytics. Requires `event_id`, `user_session`, and `performance_ids` or the legacy `band_ids` alias.                                                                                                                                                                                                                                         |
| `/api/schedule/share`           | `POST` | Persists a selected lineup and returns `{ slug }` reachable at `/s/{slug}`. Body: `{ event_id, event_slug, performance_ids[], band_names[] }` (`band_names` same length as `performance_ids`, up to 50). Snapshots expire after 30 days.                                                                                                                             |
| `/api/schedule/share/{slug}`    | `GET`  | Returns a stored share snapshot `{ slug, event_slug, event_name, performance_ids, band_names }` if unexpired. Increments a best-effort view counter unless `?import=1`.                                                                                                                                                                                              |
| `/api/stats/public`             | `GET`  | Privacy-safe aggregate platform stats: counts/sums for bands, venues, published events, performances, shared routes + views, and page views, plus up to 8 top bands by popularity. Aggregate-only — never PII. Gated by `PUBLIC_DATA_PUBLISH_ENABLED`; cached 5 minutes.                                                                 |
| `/api/history` | `GET` | Every published or archived edition (poster, concluded flag, counted set and venue totals), the artists who have played 2 or more editions (at most 24), and every venue with its edition count. A counted set is not cancelled and passes the reveal-mode gate. Gated by `PUBLIC_DATA_PUBLISH_ENABLED`; show-critical cache tier. |

### Account activation and recovery

| Route                               | Method | Notes                                                                                                                                                                                   |
| ----------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/auth/activate`                | `POST` | Body: `{ token }`. Activates an invited user account.                                                                                                                                   |
| `/api/auth/resend-activation`       | `POST` | Body: `{ email }`. Always returns a generic success payload to avoid account enumeration.                                                                                               |
| `/api/auth/reset-password/validate` | `POST` | Body: `{ token }`. Validates a reset token without placing it in the URL.                                                                                                               |
| `/api/auth/reset-password`          | `POST` | Body: `{ token, newPassword }`. Consumes the token, rotates the password, revokes sessions, and clears trusted devices.                                                                 |
| `/api/auth/reset-password`          | `GET`  | Intentionally unsupported. Returns `405` so reset tokens are never validated through query strings.                                                                                     |
| `/api/auth/reset-password-complete` | `POST` | Canonical reset-completion handler. `/api/auth/reset-password` (POST) re-exports it, so both URLs accept `{ token, newPassword }` and behave identically.                               |

### Retired email-update links

settimes.ca no longer sends email updates (band follows, event subscriptions and announcement emails were removed). Links in old emails still land on a static page: `GET` and `POST` to each of `/api/bands/{name}/unfollow`, `/api/bands/{name}/confirm-follow`, `/api/bands/confirm-follow-batch`, `/api/subscriptions/unsubscribe` and `/api/subscriptions/verify` answer `410 Gone` with a short HTML notice, read no token and touch no data; any other method is `405`.

### Public request notes

- `POST /api/metrics` only persists allow-listed analytics events: `page_view`, `event_view`, `artist_profile_view`, `social_link_click`, `ticket_click`, `visit` (a coarse referrer bucket, once per browser session), and `turnstile_error`.
- `POST /api/schedule/build` accepts at most 50 performance IDs and validates `user_session` against a restricted `[A-Za-z0-9_-]+` pattern.
- All public discovery routes listed in the first table are gated by `PUBLIC_DATA_PUBLISH_ENABLED`.

### Example: current schedule

```bash
curl "https://settimes.ca/api/schedule?event=current"
```

```json
{
  "event": {
    "id": 12,
    "name": "Winter Crawl 2026",
    "date": "2026-01-17",
    "slug": "winter-crawl-2026",
    "ticket_url": "https://tickets.example.com/winter-crawl-2026",
    "is_archived": false,
    "theme_colors": "{\"v\":1,\"source\":\"poster\",\"poster\":\"https://band-photos.settimes.ca/event-posters/1700000000000-winter-crawl.jpg\",\"light\":{\"ground\":\"#f6efe3\",\"ink\":\"#2a1d12\",\"accent\":\"#9a3d0c\",\"nowFill\":\"#f2c48d\"},\"dark\":{\"ground\":\"#1d1510\",\"ink\":\"#f3e9dc\",\"accent\":\"#f0a05e\",\"nowFill\":\"#5a3417\"}}",
    "venue_info": null,
    "social_links": null
  },
  "bands": [
    {
      "id": "the-sunset-trio-41",
      "performance_id": 41,
      "band_profile_id": 7,
      "name": "The Sunset Trio",
      "venue": "The Analog Cafe",
      "date": "2026-01-17",
      "startTime": "19:00",
      "endTime": "20:00",
      "url": "https://thesunsettrio.com"
    }
  ]
}
```

## Admin API

All admin routes require a valid session cookie. State-changing routes also require `X-CSRF-Token` after the session is established.

### Authentication and self-service

| Route                            | Method   | Minimum role | Notes                                                                                                        |
| -------------------------------- | -------- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| `/api/admin/auth/signup`         | `POST`   | none         | Invite-only signup. The request role is ignored; the invite code determines the role.                        |
| `/api/admin/auth/login`          | `POST`   | none         | Body: `{ email, password }`. Returns either a session success response or `{ mfaRequired, mfaToken, user }`. |
| `/api/admin/auth/mfa/verify`     | `POST`   | none         | Body: `{ mfaToken, code, rememberDevice? }`. Completes login and can create a trusted-device cookie.         |
| `/api/admin/auth/logout`         | `POST`   | viewer       | Invalidates the current session and clears session and CSRF cookies.                                         |
| `/api/admin/me`                  | `GET`    | viewer       | Returns `{ user, session, authenticated: true }` with safe session metadata only.                            |
| `/api/admin/sessions`            | `GET`    | viewer       | Lists the current user's active sessions.                                                                    |
| `/api/admin/sessions`            | `DELETE` | viewer       | Body: `{ sessionId }`. Revokes one of the current user's sessions.                                           |
| `/api/admin/sessions/revoke-all` | `POST`   | viewer       | Revokes all sessions for the current user and issues a fresh current-session cookie.                         |
| `/api/admin/trusted-devices`     | `GET`    | viewer       | Lists active trusted devices for the current user.                                                           |
| `/api/admin/trusted-devices`     | `DELETE` | viewer       | Body: `{ deviceId }`. Revokes one trusted device.                                                            |
| `/api/admin/mfa/status`          | `GET`    | viewer       | Returns `totpEnabled`, `setupPending`, and `hasBackupCodes`.                                                 |
| `/api/admin/mfa/setup`           | `POST`   | viewer       | Generates a new TOTP secret and returns `{ secret, otpauthUrl }`.                                            |
| `/api/admin/mfa/enable`          | `POST`   | viewer       | Body: `{ code }`. Verifies the code, enables TOTP, and returns new backup codes.                             |
| `/api/admin/mfa/backup-codes`    | `POST`   | viewer       | Body: `{ code }`. Regenerates backup codes after verifying a TOTP code.                                      |
| `/api/admin/mfa/disable`         | `POST`   | viewer       | Body: `{ code }`. Accepts a TOTP or backup code and disables MFA.                                            |
| `/api/admin/mfa/step-up` | `POST` | viewer | Body: `{ code }` (a current TOTP code or an unused backup code, which is spent). Stamps the calling session for 5 minutes so identity-changing routes stop answering `403 STEP_UP_REQUIRED`. A wrong code is `400 INVALID_MFA_CODE`. API keys are refused. |

### Content, roster, and media

| Route                                | Method   | Minimum role | Notes                                                                                                                                                                  |
| ------------------------------------ | -------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/events`                  | `GET`    | viewer       | Lists events. Supports `archived=true`, `limit`, and `offset`.                                                                                                         |
| `/api/admin/events`                  | `POST`   | editor       | Creates an event from the validated event schema. Admins may create archived events directly; editors may not.                                                         |
| `/api/admin/events/{id}`             | `PATCH`  | editor       | General event update route used by the current frontend. `slug` cannot be changed here.                                                                                |
| `/api/admin/events/{id}`             | `DELETE` | admin        | Deletes an event. If performances exist, repeat with `confirmCascade=true` in the body or query string.                                                                |
| `/api/admin/events/{id}/edit`        | `PUT`    | editor       | Narrow event-edit route for `{ name, date, slug, ticket_url }`.                                                                                                        |
| `/api/admin/events/{id}/publish`     | `POST`   | editor       | Body: `{ publish: boolean }`. Refuses to publish an event with no performances.                                                                                        |
| `/api/admin/events/{id}/archive`     | `POST`   | editor       | Sets `status = 'archived'` and stamps `archived_at`. One-way: no route un-archives an event. 409 if it was archived concurrently.                                      |
| `/api/admin/events/{id}/metrics`     | `GET`    | viewer       | Schedule-build analytics for one event.                                                                                                                                |
| `/api/admin/events/{id}/duplicate`   | `POST`   | editor       | Body: `{ name, date, slug }`. Copies the event's performances into a new unpublished draft.                                                                            |
| `/api/admin/events/wizard`           | `POST`   | editor       | One-shot creation of a draft event, its venues (find-or-create by name), and lineup. Body: `{ event, venues[], bands[] }`; each `bands[].venueIndex` indexes `venues`. |
| `/api/admin/events/{id}/reveal-mode` | `POST`   | editor       | Body: `{ reveal_mode: boolean }`. Toggles the lineup embargo flag for the event.                                                                                       |
| `/api/admin/events/posters` | `POST` | editor | `multipart/form-data` upload with `poster` and optional `event_id`. Stores the image in R2 under `event-posters/` and, with `event_id`, updates `poster_url` at once. |
| `/api/admin/events/posters` | `GET` | editor | Query: `url`. Returns the bytes of a stored `event-posters/<key>` image from this origin so the browser can read its pixels for the palette; any other URL is `400`. |
| `/api/admin/events/{id}/venue-delays` | `GET` | viewer | Every venue with a set at the event and its cumulative running-late minutes (0 when on time), read fresh. |
| `/api/admin/events/{id}/venues/{venueId}/delay` | `POST` | editor | Body: `{ minutes }` (non-zero, -180 to 180). Shifts every remaining, non-cancelled set at the venue and adds to its fan-banner delay, in one batch. `409 SHIFT_CROSSES_FESTIVAL_DAY` if a set would cross 06:00; `409 DELAY_CHANGED` if a concurrent shift won. |
| `/api/admin/events/{id}/venues/{venueId}/delay` | `DELETE` | editor | Venue back on time: clears the banner and leaves the set times as they are. |
| `/api/admin/venues`                  | `GET`    | viewer       | Lists venues with band counts. Contact details are redacted for viewers.                                                                                               |
| `/api/admin/venues`                  | `POST`   | editor       | Creates a new venue.                                                                                                                                                   |
| `/api/admin/venues/{id}`             | `PUT`    | admin        | Updates a venue.                                                                                                                                                       |
| `/api/admin/venues/{id}`             | `DELETE` | admin        | Deletes a venue.                                                                                                                                                       |
| `/api/admin/bands`                   | `GET`    | viewer       | Lists performances. Supports `event_id`, `limit`, and `offset`. Without `event_id`, profile-only rows are returned as synthetic IDs like `profile_123`.                |
| `/api/admin/bands`                   | `POST`   | editor       | Creates a performance plus band profile data, or a profile-only record when `eventId` is omitted.                                                                      |
| `/api/admin/bands/{id}`              | `PUT`    | editor       | Updates a performance or a profile-only row. `{id}` may be a performance ID or a `profile_{id}` synthetic identifier.                                                  |
| `/api/admin/bands/{id}`              | `DELETE` | editor       | Deletes one performance or one profile-only row, subject to archived-event protections.                                                                                |
| `/api/admin/bands/bulk-preview`      | `POST`   | editor       | Preview bulk venue moves, time changes, or deletions before applying them.                                                                                             |
| `/api/admin/bands/bulk`              | `POST`   | editor       | Adds existing band profiles to an event lineup. Body: `{ band_profile_ids, event_id, venue_id, start_time?, end_time? }`.                                              |
| `/api/admin/bands/bulk`              | `DELETE` | editor       | Bulk deletes performances or profile-only rows. Body: `{ band_ids }`.                                                                                                  |
| `/api/admin/bands/bulk`              | `PATCH`  | editor       | Bulk updates performance fields such as venue, time, announcement, or cancellation state.                                                                              |
| `/api/admin/bands/photos`            | `POST`   | editor       | `multipart/form-data` upload with `photo` and optional `band_id`. Stores assets in R2 and can update `photo_url`.                                                      |
| `/api/admin/bands/stats/{name}`      | `GET`    | viewer       | Internal stats and history view for a band profile.                                                                                                                    |

### User administration, invites, analytics, and maintenance

| Route                                     | Method       | Minimum role    | Notes                                                                                                                                                                                                       |
| ----------------------------------------- | ------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/users`                        | `GET`        | admin           | Lists all users, excluding password hashes.                                                                                                                                                                 |
| `/api/admin/users`                        | `POST`       | admin           | Creates an invite-backed user invitation and optionally emails the signup URL.                                                                                                                              |
| `/api/admin/users/{id}`                   | `PATCH`      | admin           | Updates role and display-name fields. Prevents demoting the last active admin.                                                                                                                              |
| `/api/admin/users/{id}`                   | `DELETE`     | admin           | Removes a user.                                                                                                                                                                                             |
| `/api/admin/users/{id}/reset-password`    | `POST`       | admin           | Body: `{ reason? }`. Creates a reset token, revokes sessions, clears trusted devices, and emails the reset URL.                                                                                             |
| `/api/admin/users/{id}/toggle-status`     | `POST`       | admin           | Activates or deactivates a user account. Deactivation revokes sessions.                                                                                                                                     |
| `/api/admin/users/{id}/reset-mfa` | `POST` | admin | Clears the target's second factor, backup codes, sessions, trusted devices and API keys (lost authenticator). Refuses the caller's own account (`400 CANNOT_RESET_OWN_MFA`). |
| `/api/admin/invite-codes`                 | `GET`        | admin           | Lists invite codes (prefix and status only; never the code).                                                                                                                                                |
| `/api/admin/invite-codes`                 | `POST`       | admin           | Body: `{ email?, role = "editor", expiresInDays = 7 }`. Creates an open or email-restricted invite.                                                                                                         |
| `/api/admin/invite-codes/{id}`            | `DELETE`     | admin           | Revokes an invite code.                                                                                                                                                                                     |
| `/api/admin/audit-log`                    | `GET`        | admin           | Query: `user_id`, `action`, `resource_type`, `limit` (max 100), and `offset`.                                                                                                                               |
| `/api/admin/maintenance/cleanup-sessions` | `POST`       | admin           | Runs the full retention cleanup for expired sessions, MFA challenges, reset tokens, trusted devices, login attempts, unconfirmed sign-ups, and security telemetry.                                          |
| `/api/admin/api-keys`                     | `GET`/`POST` | admin           | Lists API-key metadata or creates a key. The plaintext key is returned exactly once and cannot be recovered.                                                                                                |
| `/api/admin/events/{id}/schedule`         | `PUT`        | editor          | Atomically updates multiple schedule rows and checks the final merged state for conflicts.                                                                                                                  |
| `/api/internal/run-scheduled`             | `POST`       | internal secret | Runs the full scheduled job. Returns `200 { ok: true, ranAt, durationMs }`; failed steps return `500 { ok: false, failedSteps, ranAt, durationMs }`.                                                        |

## Error handling

Common status codes used across the API:

- `400 Bad Request`: validation failure, missing required fields, or malformed path, query, or body data
- `401 Unauthorized`: missing or invalid credentials, an invalid code at the login MFA step, expired challenge token. Every other MFA endpoint (step-up, enable, disable, backup-codes) answers a wrong code with `400 INVALID_MFA_CODE`, because a 401 signs the user out
- `403 Forbidden`: authenticated but insufficient role, failed CSRF validation, or origin validation failure
- `404 Not Found`: missing record or unknown route segment
- `409 Conflict`: uniqueness conflicts, invalid state transitions, or confirmation-required destructive actions
- `429 Too Many Requests`: login or MFA rate limit exceeded
- `503 Service Unavailable`: public data publishing is disabled for gated read routes

## Example: admin login with optional MFA

```bash
curl -X POST "https://settimes.ca/api/admin/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"editor@example.com","password":"correct horse battery staple"}'
```

A successful direct login returns `success: true` and sets the session and CSRF cookies. If MFA is enabled for the account, the same endpoint returns:

```json
{
  "mfaRequired": true,
  "mfaToken": "8e8d0f1e-....",
  "user": {
    "email": "editor@example.com",
    "name": "Editor Example",
    "firstName": "Editor",
    "lastName": "Example",
    "role": "editor"
  }
}
```

The client then completes `POST /api/admin/auth/mfa/verify` with `{ mfaToken, code, rememberDevice? }`.
