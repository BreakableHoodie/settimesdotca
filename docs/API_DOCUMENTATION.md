# SetTimes API Documentation
**RESTful API for Event Schedule Management**

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Authentication](#authentication)
4. [Rate Limiting & Security](#rate-limiting--security)
5. [Public API Endpoints](#public-api-endpoints)
6. [Admin API Endpoints](#admin-api-endpoints)
7. [Error Handling](#error-handling)
8. [Examples & Use Cases](#examples--use-cases)
9. [API Reference](#api-reference)

---

## Introduction

The SetTimes API provides programmatic access to event schedules, venues, and performer information. The API is divided into two main categories:

**Public API:**
- No authentication required
- Read-only access to published events
- Optimized for public consumption (cached responses)
- Used by the SetTimes frontend and embeds

**Admin API:**
- Requires authentication (session-based)
- Full CRUD operations for events, venues, and performers
- Role-based access control (RBAC)
- Audit logging for all state-changing operations

### Base URLs

- **Production:** `https://settimes.ca`
- **Development:** `https://dev.settimes.ca`
- **Local:** `http://localhost:5173`

### API Characteristics

- **Format:** JSON (application/json)
- **Protocol:** HTTPS (required in production)
- **Versioning:** Currently v1 (implicit in URLs)
- **CORS:** Enabled for specified origins
- **Caching:** Cloudflare CDN with custom cache rules

---

## Getting Started

### Prerequisites

**For Public API:**
- No authentication required
- No API key needed
- Subject to rate limiting (see below)

**For Admin API:**
- Active user account with editor or admin role
- Session cookie (obtained via login)
- CSRF token (for state-changing requests)

### Quick Start Example

**Fetch the current event schedule:**

```bash
curl https://settimes.ca/api/schedule?event=current
```

**Response:**
```json
[
  {
    "id": "the-sunset-trio-1",
    "name": "The Sunset Trio",
    "venue": "The Analog Cafe",
    "date": "2025-05-17",
    "startTime": "19:00",
    "endTime": "20:00",
    "url": "https://thesunsettrio.com"
  },
  {
    "id": "electric-dreams-2",
    "name": "Electric Dreams",
    "venue": "Black Cat Tavern",
    "date": "2025-05-17",
    "startTime": "20:30",
    "endTime": "21:30",
    "url": null
  }
]
```

---

## Authentication

### Session-Based Authentication

SetTimes uses **session-based authentication** with HTTPOnly cookies for security.

#### Login Flow

1. **POST** `/api/admin/auth/login` with credentials
2. Receive session cookie in response
3. Browser automatically includes cookie in subsequent requests
4. Session expires after 24 hours (configurable)

**Login Request:**
```bash
curl -X POST https://settimes.ca/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "your-password"}'
```

**Login Response (Success):**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "name": "Admin User",
    "role": "admin"
  }
}
```

**Session Cookie:**
```
Set-Cookie: session_token=abc123...; HttpOnly; Secure; SameSite=Strict; Max-Age=86400
```

### CSRF Protection

All state-changing requests (POST, PUT, DELETE, PATCH) require a CSRF token.

**How it works:**
1. Server sends CSRF token as a readable cookie
2. Client includes token in `X-CSRF-Token` header
3. Server validates cookie matches header

**Example Request with CSRF:**
```bash
curl -X POST https://settimes.ca/api/admin/events \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: csrf_abc123..." \
  -H "Cookie: session_token=abc123...; csrf_token=csrf_abc123..." \
  -d '{"name": "Spring Fest", "date": "2025-06-15", "slug": "spring-fest"}'
```

### Logout

**POST** `/api/admin/auth/logout` to terminate the session.

```bash
curl -X POST https://settimes.ca/api/admin/auth/logout \
  -H "Cookie: session_token=abc123..."
```

---

## Rate Limiting & Security

### Rate Limits

**Public API:**
- **100 requests/minute/IP** for schedule endpoints
- **No authentication required**
- Responses cached for 5 minutes (reduces load)

**Admin API:**
- **5 failed login attempts/10 minutes/IP** → 1 hour lockout
- **100 requests/minute/session** for authenticated endpoints
- **Audit logging** for all state-changing operations

### Security Features

**HTTPS/TLS:**
- All production traffic encrypted with TLS 1.3
- HSTS enabled (max-age=31536000)
- Automatic HTTP→HTTPS redirect

**Input Validation:**
- All inputs validated and sanitized
- Parameterized SQL queries (SQL injection prevention)
- React auto-escaping (XSS prevention)

**CSRF Protection:**
- Double-submit cookie pattern
- Required for POST/PUT/DELETE/PATCH
- Validated on all state-changing requests

**Role-Based Access Control (RBAC):**
- **Admin** (level 3) - Full system access
- **Editor** (level 2) - Create/edit events, venues, bands
- **Viewer** (level 1) - Read-only access to admin panel

**Audit Logging:**
- All logins/logouts logged
- All create/update/delete operations logged
- IP addresses tracked
- Timestamps recorded

---

## Public API Endpoints

### GET /api/schedule

Fetch the event schedule for public consumption.

**Authentication:** None required

**Query Parameters:**
- `event` (optional) - Event slug or "current" (default: "current")

**Examples:**

```bash
# Get the most recent published event
curl https://settimes.ca/api/schedule?event=current

# Get a specific event by slug
curl https://settimes.ca/api/schedule?event=spring-fest-2025
```

**Response (200 OK):**
```json
[
  {
    "id": "the-sunset-trio-1",
    "name": "The Sunset Trio",
    "venue": "The Analog Cafe",
    "date": "2025-05-17",
    "startTime": "19:00",
    "endTime": "20:00",
    "url": "https://thesunsettrio.com"
  }
]
```

**Response Headers:**
```
Cache-Control: public, max-age=300
Content-Type: application/json
```

**Error Responses:**

**404 Not Found** - Event doesn't exist or no published events
```json
{
  "error": "Event not found",
  "message": "No published events available"
}
```

**500 Internal Server Error** - Database error
```json
{
  "error": "Database error",
  "message": "Failed to fetch schedule"
}
```

---

## Admin API Endpoints

All admin endpoints require authentication (session cookie).

### Events

#### GET /api/admin/events

List all events (published and unpublished).

**Authentication:** Required (editor or admin)

**Response (200 OK):**
```json
{
  "events": [
    {
      "id": 1,
      "name": "Spring Music Fest 2025",
      "date": "2025-05-17",
      "slug": "spring-fest-2025",
      "is_published": 1,
      "created_at": "2025-01-15T10:30:00Z",
      "band_count": 25
    },
    {
      "id": 2,
      "name": "Summer Bash 2025",
      "date": "2025-07-20",
      "slug": "summer-bash-2025",
      "is_published": 0,
      "created_at": "2025-02-01T14:00:00Z",
      "band_count": 0
    }
  ]
}
```

---

#### POST /api/admin/events

Create a new event.

**Authentication:** Required (editor or admin)

**Request Body:**
```json
{
  "name": "Fall Festival 2025",
  "date": "2025-10-15",
  "slug": "fall-fest-2025",
  "isPublished": false
}
```

**Field Validation:**
- `name` (required) - Event name
- `date` (required) - YYYY-MM-DD format
- `slug` (required) - Lowercase, numbers, hyphens only (must be unique)
- `isPublished` (optional) - Default: false

**Response (201 Created):**
```json
{
  "success": true,
  "event": {
    "id": 3,
    "name": "Fall Festival 2025",
    "date": "2025-10-15",
    "slug": "fall-fest-2025",
    "is_published": 0,
    "created_at": "2025-03-15T12:00:00Z"
  }
}
```

**Error Responses:**

**400 Bad Request** - Validation error
```json
{
  "error": "Validation error",
  "message": "Slug must contain only lowercase letters, numbers, and hyphens"
}
```

**409 Conflict** - Slug already exists
```json
{
  "error": "Conflict",
  "message": "An event with this slug already exists"
}
```

---

#### PUT /api/admin/events/:id

Update an existing event.

**Authentication:** Required (editor or admin)

**Request Body:**
```json
{
  "name": "Fall Festival 2025 (Updated)",
  "date": "2025-10-16",
  "isPublished": true
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "event": {
    "id": 3,
    "name": "Fall Festival 2025 (Updated)",
    "date": "2025-10-16",
    "slug": "fall-fest-2025",
    "is_published": 1,
    "created_at": "2025-03-15T12:00:00Z"
  }
}
```

---

#### DELETE /api/admin/events/:id

Delete an event (and all associated performers).

**Authentication:** Required (admin only)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Event deleted successfully"
}
```

**Error Response:**

**403 Forbidden** - Insufficient permissions
```json
{
  "error": "Forbidden",
  "message": "Only admins can delete events"
}
```

---

### Venues

#### GET /api/admin/venues

List all venues.

**Authentication:** Required (editor or admin)

**Response (200 OK):**
```json
{
  "venues": [
    {
      "id": 1,
      "name": "The Analog Cafe",
      "address": "123 Main Street",
      "website": "https://analogcafe.com",
      "instagram": "analogcafe",
      "facebook": "analogcafe",
      "band_count": 15
    },
    {
      "id": 2,
      "name": "Black Cat Tavern",
      "address": "456 Queen Street",
      "website": null,
      "instagram": null,
      "facebook": null,
      "band_count": 12
    }
  ]
}
```

---

#### POST /api/admin/venues

Create a new venue.

**Authentication:** Required (editor or admin)

**Request Body:**
```json
{
  "name": "The Velvet Underground",
  "address": "789 King Street",
  "website": "https://velvetunderground.com",
  "instagram": "velvetunderground",
  "facebook": "velvetunderground"
}
```

**Field Validation:**
- `name` (required) - Venue name (must be unique)
- `address` (optional) - Full address
- `website` (optional) - Full URL
- `instagram` (optional) - Username without @
- `facebook` (optional) - Page name or full URL

**Response (201 Created):**
```json
{
  "success": true,
  "venue": {
    "id": 3,
    "name": "The Velvet Underground",
    "address": "789 King Street",
    "website": "https://velvetunderground.com",
    "instagram": "velvetunderground",
    "facebook": "velvetunderground"
  }
}
```

**Error Response:**

**409 Conflict** - Venue name already exists
```json
{
  "error": "Conflict",
  "message": "A venue with this name already exists"
}
```

---

#### PUT /api/admin/venues/:id

Update an existing venue.

**Authentication:** Required (editor or admin)

**Request Body:**
```json
{
  "name": "The Velvet Underground (Updated)",
  "address": "789 King Street West",
  "website": "https://velvetunderground.ca"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "venue": {
    "id": 3,
    "name": "The Velvet Underground (Updated)",
    "address": "789 King Street West",
    "website": "https://velvetunderground.ca",
    "instagram": "velvetunderground",
    "facebook": "velvetunderground"
  }
}
```

---

#### DELETE /api/admin/venues/:id

Delete a venue (only if no bands assigned).

**Authentication:** Required (admin only)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Venue deleted successfully"
}
```

**Error Response:**

**400 Bad Request** - Venue has assigned bands
```json
{
  "error": "Bad request",
  "message": "Cannot delete venue with assigned performances"
}
```

---

### Performers (Bands)

#### GET /api/admin/bands

List bands for a specific event.

**Authentication:** Required (editor or admin)

**Query Parameters:**
- `event_id` (required) - Event ID

**Example:**
```bash
curl https://settimes.ca/api/admin/bands?event_id=1 \
  -H "Cookie: session_token=abc123..."
```

**Response (200 OK):**
```json
{
  "bands": [
    {
      "id": 1,
      "event_id": 1,
      "venue_id": 1,
      "name": "The Sunset Trio",
      "start_time": "19:00",
      "end_time": "20:00",
      "url": "https://thesunsettrio.com",
      "instagram": "thesunsettrio",
      "facebook": null,
      "description": "Jazz fusion trio from Toronto",
      "created_at": "2025-01-15T10:30:00Z",
      "venue_name": "The Analog Cafe",
      "event_name": "Spring Music Fest 2025"
    }
  ]
}
```

---

#### POST /api/admin/bands

Create a new band/performance with conflict detection.

**Authentication:** Required (editor or admin)

**Request Body:**
```json
{
  "eventId": 1,
  "venueId": 1,
  "name": "Electric Dreams",
  "startTime": "20:30",
  "endTime": "21:30",
  "url": "https://electricdreams.com",
  "instagram": "electricdreamsband",
  "facebook": "electricdreams",
  "description": "Electronic dance music duo"
}
```

**Field Validation:**
- `eventId` (required) - Must exist in events table
- `venueId` (required) - Must exist in venues table
- `name` (required) - Band name
- `startTime` (required) - HH:MM format (24-hour)
- `endTime` (required) - HH:MM format (must be after startTime)
- `url` (optional) - Full URL
- `instagram` (optional) - Username without @
- `facebook` (optional) - Page name or full URL
- `description` (optional) - Band description (shown on profile page)

**Response (201 Created - No Conflicts):**
```json
{
  "success": true,
  "band": {
    "id": 2,
    "event_id": 1,
    "venue_id": 1,
    "name": "Electric Dreams",
    "start_time": "20:30",
    "end_time": "21:30",
    "url": "https://electricdreams.com",
    "instagram": "electricdreamsband",
    "facebook": "electricdreams",
    "description": "Electronic dance music duo",
    "created_at": "2025-01-15T11:00:00Z"
  }
}
```

**Response (201 Created - With Conflicts):**
```json
{
  "success": true,
  "band": {
    "id": 3,
    "event_id": 1,
    "venue_id": 1,
    "name": "Overlapping Band",
    "start_time": "20:00",
    "end_time": "21:00",
    "url": null,
    "created_at": "2025-01-15T12:00:00Z"
  },
  "conflicts": [
    {
      "id": 1,
      "name": "The Sunset Trio",
      "startTime": "19:00",
      "endTime": "20:00"
    },
    {
      "id": 2,
      "name": "Electric Dreams",
      "startTime": "20:30",
      "endTime": "21:30"
    }
  ],
  "warning": "This band overlaps with 2 other band(s) at the same venue"
}
```

**Note:** Conflicts are returned as warnings but do not prevent creation. The frontend highlights conflicts in red for admin review.

**Error Responses:**

**400 Bad Request** - Validation error
```json
{
  "error": "Validation error",
  "message": "End time must be after start time"
}
```

**404 Not Found** - Event or venue doesn't exist
```json
{
  "error": "Not found",
  "message": "Event not found"
}
```

---

#### PUT /api/admin/bands/:id

Update an existing band/performance.

**Authentication:** Required (editor or admin)

**Request Body:**
```json
{
  "name": "Electric Dreams (Updated)",
  "startTime": "21:00",
  "endTime": "22:00"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "band": {
    "id": 2,
    "event_id": 1,
    "venue_id": 1,
    "name": "Electric Dreams (Updated)",
    "start_time": "21:00",
    "end_time": "22:00",
    "url": "https://electricdreams.com",
    "created_at": "2025-01-15T11:00:00Z"
  },
  "conflicts": []
}
```

---

#### DELETE /api/admin/bands/:id

Delete a band/performance.

**Authentication:** Required (editor or admin)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Band deleted successfully"
}
```

---

## Error Handling

### Standard Error Format

All errors return JSON with the following structure:

```json
{
  "error": "Error type",
  "message": "Human-readable error message",
  "details": {
    "field": "Additional context (optional)"
  }
}
```

### HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| **200** | OK | Successful GET, PUT, DELETE |
| **201** | Created | Successful POST |
| **400** | Bad Request | Validation error, missing parameters |
| **401** | Unauthorized | Invalid credentials, session expired |
| **403** | Forbidden | Insufficient permissions (RBAC) |
| **404** | Not Found | Resource doesn't exist |
| **409** | Conflict | Duplicate slug/name, constraint violation |
| **429** | Too Many Requests | Rate limit exceeded |
| **500** | Internal Server Error | Database error, unexpected server error |

### Common Error Scenarios

**Invalid CSRF Token:**
```json
{
  "error": "CSRF validation failed",
  "message": "Invalid or missing CSRF token"
}
```

**Session Expired:**
```json
{
  "error": "Unauthorized",
  "message": "Session expired. Please log in again."
}
```

**Insufficient Permissions:**
```json
{
  "error": "Forbidden",
  "message": "This action requires admin permissions"
}
```

**Rate Limited:**
```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Please try again in 45 minutes.",
  "minutesRemaining": 45
}
```

---

## Examples & Use Cases

### Use Case 1: Building a Public Event Widget

**Scenario:** Embed SetTimes schedule on an external website.

**Implementation:**

```html
<!DOCTYPE html>
<html>
<head>
  <title>SetTimes Widget</title>
  <style>
    .band { margin: 10px 0; padding: 10px; border: 1px solid #ccc; }
    .band-name { font-weight: bold; }
    .venue { color: #666; }
  </style>
</head>
<body>
  <div id="schedule"></div>

  <script>
    fetch('https://settimes.ca/api/schedule?event=current')
      .then(response => response.json())
      .then(bands => {
        const scheduleDiv = document.getElementById('schedule');
        bands.forEach(band => {
          const bandDiv = document.createElement('div');
          bandDiv.className = 'band';
          bandDiv.innerHTML = `
            <div class="band-name">${band.name}</div>
            <div class="venue">${band.venue} - ${band.startTime} to ${band.endTime}</div>
          `;
          scheduleDiv.appendChild(bandDiv);
        });
      })
      .catch(error => console.error('Error:', error));
  </script>
</body>
</html>
```

---

### Use Case 2: Automated Event Creation

**Scenario:** Import events from an external system.

**Implementation:**

```javascript
// Login first
const loginResponse = await fetch('https://settimes.ca/api/admin/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@example.com',
    password: 'your-password'
  }),
  credentials: 'include' // Important: Include cookies
});

if (loginResponse.ok) {
  // Get CSRF token from cookies
  const csrfToken = document.cookie
    .split('; ')
    .find(row => row.startsWith('csrf_token='))
    .split('=')[1];

  // Create event
  const createResponse = await fetch('https://settimes.ca/api/admin/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    },
    credentials: 'include',
    body: JSON.stringify({
      name: 'Automated Event',
      date: '2025-08-15',
      slug: 'automated-event',
      isPublished: false
    })
  });

  const result = await createResponse.json();
  console.log('Event created:', result);
}
```

---

### Use Case 3: Conflict Detection Before Scheduling

**Scenario:** Check for scheduling conflicts before adding a band.

**Implementation:**

```javascript
async function addBandWithConflictCheck(bandData) {
  // Add band (conflicts are returned in response)
  const response = await fetch('https://settimes.ca/api/admin/bands', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    },
    credentials: 'include',
    body: JSON.stringify(bandData)
  });

  const result = await response.json();

  if (result.conflicts && result.conflicts.length > 0) {
    console.warn('Scheduling conflicts detected:');
    result.conflicts.forEach(conflict => {
      console.warn(`- ${conflict.name} (${conflict.startTime} - ${conflict.endTime})`);
    });

    // Prompt user for confirmation
    const confirmed = confirm(
      `This band overlaps with ${result.conflicts.length} other band(s). Continue anyway?`
    );

    if (!confirmed) {
      // Delete the band if user cancels
      await fetch(`https://settimes.ca/api/admin/bands/${result.band.id}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': csrfToken },
        credentials: 'include'
      });
      return null;
    }
  }

  return result.band;
}
```

---

## API Reference

### OpenAPI Specification

A complete OpenAPI 3.0 specification is available at:
- **File:** `docs/api-spec.yaml`
- **View:** Import into [Swagger UI](https://editor.swagger.io/) or [Postman](https://www.postman.com/)

**Note:** The OpenAPI spec may reference the old "Long Weekend Band Crawl" branding. All endpoints work with the current SetTimes platform.

### Postman Collection

A Postman collection is available for testing (coming soon):
- **File:** `docs/settimes-api-postman.json`

### Rate Limit Headers

All API responses include rate limit information:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1699564800
```

### Caching Headers

**Public API:**
```
Cache-Control: public, max-age=300
Vary: Origin
```

**Admin API:**
```
Cache-Control: no-cache, no-store, must-revalidate
```

---

## Best Practices

### Performance

**1. Use Caching Effectively:**
- Public schedule API is cached for 5 minutes
- Don't poll more frequently than cache TTL
- Use cache headers to avoid unnecessary requests

**2. Minimize Requests:**
- Batch operations when possible
- Use query parameters to filter results
- Don't fetch full lists repeatedly

**3. Handle Rate Limits:**
- Respect rate limit headers
- Implement exponential backoff for retries
- Cache responses on client side

### Security

**1. Protect Credentials:**
- Never expose passwords in client-side code
- Use environment variables for API credentials
- Rotate passwords regularly

**2. Validate Input:**
- Validate data client-side before sending
- Handle validation errors gracefully
- Sanitize user input

**3. Handle Sessions Properly:**
- Set `credentials: 'include'` in fetch() calls
- Store CSRF tokens securely
- Implement automatic session refresh

### Error Handling

**1. Always Check Response Status:**
```javascript
const response = await fetch(url);
if (!response.ok) {
  const error = await response.json();
  console.error('API Error:', error.message);
  throw new Error(error.message);
}
```

**2. Implement Retry Logic:**
```javascript
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status === 429) {
        // Rate limited - wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
      }
    } catch (error) {
      if (i === retries - 1) throw error;
    }
  }
}
```

**3. Show User-Friendly Errors:**
```javascript
try {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    showUserError(data.message);
    return;
  }

  // Success
} catch (error) {
  showUserError('Network error. Please check your connection.');
}
```

---

## Support & Resources

### Documentation

- **User Guide:** [USER_GUIDE.md](./USER_GUIDE.md) - For event organizers
- **Admin Handbook:** [ADMIN_HANDBOOK.md](./ADMIN_HANDBOOK.md) - For system administrators
- **Quick Start:** [QUICK_START.md](./QUICK_START.md) - 10-minute setup tutorial
- **Troubleshooting:** [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues

### Contact

- **GitHub Issues:** [github.com/BreakableHoodie/settimesdotca/issues](https://github.com/BreakableHoodie/settimesdotca/issues)
- **API Questions:** Tag issues with `api` label

### Changelog

**v1.0 (November 2025):**
- Initial API release
- Public schedule endpoint
- Admin CRUD operations
- Session-based authentication
- CSRF protection
- Rate limiting
- Conflict detection

---

**Version:** 1.0
**Last Updated:** November 2025
**For:** SetTimes Platform (settimes.ca)

---

**Ready to integrate?** Check out the [OpenAPI spec](./api-spec.yaml) and start building!
