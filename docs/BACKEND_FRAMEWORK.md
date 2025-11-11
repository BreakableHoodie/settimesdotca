# Backend Development Framework

## Long Weekend Band Crawl - Multi-Event Architecture

**Last Updated:** 2025-10-25
**Purpose:** Establish scalable, maintainable backend architecture for future event iterations

**Target Users:** Non-technical event organizers
**Event Frequency:** 4-5 events per year (not annual)
**Priority:** User-friendly workflows over technical features

---

## Table of Contents

1. [Current Architecture Overview](#current-architecture-overview)
2. [Multi-Year Strategy](#multi-year-strategy)
3. [Core Patterns](#core-patterns)
4. [API Design Guidelines](#api-design-guidelines)
5. [Data Management](#data-management)
6. [Future Enhancements](#future-enhancements)
7. [Development Workflow](#development-workflow)

---

## Current Architecture Overview

### Technology Stack

| Layer               | Technology              | Purpose                               |
| ------------------- | ----------------------- | ------------------------------------- |
| **Runtime**         | Cloudflare Workers      | Edge computing, global distribution   |
| **Database**        | Cloudflare D1 (SQLite)  | Structured data, ACID compliance      |
| **Frontend**        | React + Vite            | SPA, mobile-first UI                  |
| **Deployment**      | Cloudflare Pages        | Static hosting + serverless functions |
| **Version Control** | Git (main/dev branches) | Code management                       |

### Data Model

```
┌─────────────┐
│   events    │──┐
│  (vol-5)    │  │
└─────────────┘  │
                 │ FK
                 ▼
┌─────────────┐  ┌──────────────┐
│   venues    │◄─┤    bands     │
│  (Room 47)  │  │ (schedules)  │
└─────────────┘  └──────────────┘

┌──────────────┐  ┌──────────────┐
│  auth_audit  │  │ rate_limit   │
│  (security)  │  │ (protection) │
└──────────────┘  └──────────────┘
```

**Key Tables:**

- `events` - Multi-event management (name, date, slug, is_published)
- `venues` - Reusable venues across events
- `bands` - Performance schedules with FK to events + venues
- `auth_audit` - Security logging for all auth attempts
- `rate_limit` - IP-based brute-force protection

**Relationships:**

- Events → Bands (1:N, CASCADE delete)
- Venues → Bands (1:N, RESTRICT delete)
- Events are independent (no FK between events)

### API Structure

```
/api/
├── schedule.js                  # Public API
│   GET ?event={slug|current}    # Returns band schedule
│
└── admin/
    ├── _middleware.js           # Auth + rate limiting
    ├── auth/
    │   ├── login.js             # Password verification
    │   └── reset.js             # Master password recovery
    ├── events.js                # CRUD events
    ├── events/[id].js           # Publish, duplicate
    ├── venues.js                # CRUD venues
    ├── venues/[id].js           # Edit, delete
    ├── bands.js                 # CRUD bands + conflicts
    └── bands/[id].js            # Edit, delete
```

**Pattern:** Cloudflare Pages Functions (file-based routing)

### Current Strengths

✅ **Multi-event capable** - Already supports multiple band crawls via `events` table
✅ **Secure by default** - Rate limiting, audit logs, password protection
✅ **Performance optimized** - Indexed queries, edge caching (5min TTL)
✅ **Conflict detection** - Automatic overlap detection for bands
✅ **Graceful degradation** - Fallback chain (D1 → static JSON → embedded)
✅ **RESTful design** - Standard HTTP methods, JSON responses

### Architectural Gaps (Prioritized for Non-Technical Users)

🔴 **CRITICAL:**

- **No event cloning** - Can't duplicate events (wastes hours per event)
- **No visual bulk ops** - Must edit bands one by one (tedious with 50+ bands)
- **Form-heavy workflows** - Multi-step forms slow down non-technical users

⚠️ **IMPORTANT:**

- **No mobile admin** - Desktop-only limits when/where work can happen
- **No image upload** - Event posters must be hosted externally
- **No preview mode** - Can't see attendee view before publishing

⚡ **NICE-TO-HAVE:**

- **No versioning** - API breaking changes would affect all clients
- **No archival** - Old events accumulate without cleanup strategy
- **No analytics** - No insights into popular bands or venue conflicts
- **No automation** - No scheduled tasks (cleanup, notifications)
- **No multi-tenancy** - Single admin password for all organizers

---

## Multi-Event Strategy

### Design Principles

1. **Event Isolation** - Each event (4-5 per year) is independent, can be archived/deleted
2. **Venue Reuse** - Venues persist across all events, shared resource (critical for frequency)
3. **Data Sovereignty** - Each event owns its data (bands, schedule)
4. **Rapid Duplication** - Clone previous event to create new one (saves hours per event)
5. **Visual Workflows** - Non-technical users need UI-based operations, not CSV/CLI
6. **Privacy First** - Minimal data collection, no user tracking

### Frequency Impact (4-5 Events/Year)

**Time Pressure:** With events every 2-3 months, setup must be fast

- **Critical:** Event cloning (copy Vol. 5 → Vol. 6 in minutes)
- **Critical:** Visual bulk operations (no CSV uploads)
- **Critical:** Mobile admin (work from anywhere)

**Venue Reuse:** Same venues used repeatedly

- Design: Shared venues table (don't duplicate)
- Benefit: Change venue address once, applies to all events

**Skill Level:** Non-technical organizers managing frequent events

- Design: No file uploads, no command line, no technical documentation
- Benefit: Anyone can manage events without training

### Event Lifecycle

```
┌──────────────┐
│   DRAFT      │  Admin creates event, unpublished
│ is_published │  Visible only in admin panel
│      = 0     │
└──────┬───────┘
       │ Admin clicks "Publish"
       ▼
┌──────────────┐
│  PUBLISHED   │  Public-facing, appears in API
│ is_published │  Attendees can view and build schedules
│      = 1     │
└──────┬───────┘
       │ Event date passes (manual or automated)
       ▼
┌──────────────┐
│   ARCHIVED   │  Optionally mark as archived (future enhancement)
│  archived_at │  No longer shown as "current" but accessible by slug
│  = timestamp │
└──────┬───────┘
       │ After retention period (future enhancement)
       ▼
┌──────────────┐
│   DELETED    │  Removed from database via CASCADE
│              │  Bands auto-deleted, venues remain
└──────────────┘
```

**Current State:** Events have `DRAFT` and `PUBLISHED` states only. Archive/delete is manual.

### Recommended Event Naming Convention

```
slug: "vol-{N}"           → Example: "vol-5", "vol-6"
name: "Long Weekend Band Crawl Vol. {N}"
date: "YYYY-MM-DD"        → ISO 8601 format
```

**Why slugs?**

- URL-friendly (`/api/schedule?event=vol-5`)
- Memorable for organizers
- Version-independent (doesn't expose internal IDs)

### Multi-Event Query Patterns

**Current Event (Default):**

```sql
SELECT * FROM events
WHERE is_published = 1
ORDER BY date DESC
LIMIT 1;
```

**Specific Event:**

```sql
SELECT * FROM events
WHERE slug = ? AND is_published = 1;
```

**All Published Events:**

```sql
SELECT id, name, date, slug
FROM events
WHERE is_published = 1
ORDER BY date DESC;
```

**Admin: All Events (Published + Draft):**

```sql
SELECT * FROM events
ORDER BY date DESC;
```

---

## Core Patterns

### 1. RESTful API Design

| Method   | Endpoint                     | Purpose         | Auth   |
| -------- | ---------------------------- | --------------- | ------ |
| `GET`    | `/api/schedule?event={slug}` | Fetch schedule  | Public |
| `GET`    | `/api/admin/events`          | List all events | Admin  |
| `POST`   | `/api/admin/events`          | Create event    | Admin  |
| `PUT`    | `/api/admin/events/{id}`     | Update event    | Admin  |
| `DELETE` | `/api/admin/events/{id}`     | Delete event    | Admin  |

**Response Format:**

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

**Error Format:**

```json
{
  "error": "Error type",
  "message": "Human-readable message",
  "details": { ... }
}
```

### 2. Middleware Pattern

**Execution Order:**

```
Request
  → /functions/_middleware.js       # Global CORS, error handling
  → /functions/api/admin/_middleware.js  # Auth, rate limiting
  → /functions/api/admin/events.js  # Business logic
  → Response
```

**Middleware Responsibilities:**

- **Global**: CORS headers, error boundaries, logging
- **Admin**: Password verification, IP rate limiting, audit logging
- **Route**: Business logic, database queries, validation

### 3. Security Model

**Authentication Flow:**

```
1. Admin enters password → frontend
2. Frontend sends X-Admin-Password header
3. Middleware checks password vs env.ADMIN_PASSWORD
4. Rate limit: 5 failed attempts in 10min = 1hr lockout
5. Audit log: All attempts logged with IP, timestamp, success
6. On success: Reset rate limit, proceed to handler
```

**Rate Limiting Logic:**

- Track by IP address (`CF-Connecting-IP` header)
- 5 failed attempts in 10-minute sliding window
- 1-hour lockout after threshold exceeded
- Auto-reset after lockout expires
- Manual reset via SQL if needed

**Audit Trail:**

```sql
SELECT timestamp, action, success, ip_address
FROM auth_audit
ORDER BY timestamp DESC
LIMIT 100;
```

### 4. Database Query Patterns

**Efficient Queries (Use Indexes):**

✅ Find published events:

```sql
SELECT * FROM events WHERE is_published = 1;  -- Uses idx_events_published
```

✅ Find event by slug:

```sql
SELECT * FROM events WHERE slug = ?;  -- Uses idx_events_slug
```

✅ Find bands for event:

```sql
SELECT * FROM bands WHERE event_id = ?;  -- Uses idx_bands_event
```

✅ Sort bands by time:

```sql
SELECT * FROM bands
WHERE event_id = ?
ORDER BY start_time;  -- Uses idx_bands_event_time
```

**Anti-Patterns (Avoid):**

❌ Full table scans:

```sql
SELECT * FROM bands;  -- No WHERE clause, scans entire table
```

❌ Unindexed WHERE clauses:

```sql
SELECT * FROM bands WHERE name LIKE '%foo%';  -- Can't use index
```

❌ Complex JOINs without indexes:

```sql
SELECT * FROM bands b
JOIN events e ON b.event_id = e.id
WHERE e.name = ?;  -- Use slug instead
```

### 5. Conflict Detection Algorithm

**Purpose:** Warn admins when two bands are scheduled at the same venue with overlapping times.

**Logic:**

```sql
SELECT b1.name as band1, b2.name as band2, v.name as venue
FROM bands b1
JOIN bands b2 ON
  b1.event_id = b2.event_id AND       -- Same event
  b1.venue_id = b2.venue_id AND       -- Same venue
  b1.id < b2.id AND                   -- Avoid duplicates
  b1.start_time < b2.end_time AND     -- Overlap condition
  b1.end_time > b2.start_time
JOIN venues v ON b1.venue_id = v.id
WHERE b1.event_id = ?;
```

**Implementation:** `functions/api/admin/bands.js:128-162`

**Behavior:**

- Returns array of conflict pairs
- Frontend highlights conflicts in red
- Admin can still save (warnings, not errors)
- Re-checked on every band edit

---

## API Design Guidelines

### Versioning Strategy (Future)

**Option 1: URL Versioning**

```
/api/v1/schedule?event=vol-5
/api/v2/schedule?event=vol-5
```

**Option 2: Header Versioning**

```
GET /api/schedule?event=vol-5
Accept: application/vnd.bandcrawl.v2+json
```

**Option 3: Query Parameter**

```
/api/schedule?event=vol-5&api_version=2
```

**Recommendation:** Start with **Option 1** (URL versioning) when v2 is needed.
**Current:** No versioning, assume v1 implicit.

### Breaking Changes

**Requires New Version:**

- Renaming fields in response JSON
- Changing data types (string → number)
- Removing endpoints
- Changing authentication method

**Safe Changes (No New Version):**

- Adding new optional fields
- Adding new endpoints
- Adding query parameters (optional)
- Improving error messages

### Response Caching

**Public API:**

```javascript
"Cache-Control": "public, max-age=300"  // 5 minutes
```

**Admin API:**

```javascript
"Cache-Control": "no-store"  // Never cache
```

**Cloudflare Edge:**

- Automatic edge caching based on headers
- Purge via Cloudflare dashboard or API
- Consider adding `stale-while-revalidate` for resilience

### Error Handling Best Practices

1. **Always return JSON** (even for errors)
2. **Use HTTP status codes correctly:**
   - `200` - Success
   - `201` - Created
   - `400` - Bad request (validation error)
   - `401` - Unauthorized (missing/invalid password)
   - `404` - Not found
   - `409` - Conflict (duplicate slug)
   - `429` - Rate limited
   - `500` - Server error (database failure)

3. **Include actionable messages:**

   ```json
   {
     "error": "Validation error",
     "message": "Event slug must be URL-friendly",
     "details": {
       "field": "slug",
       "reason": "Contains spaces"
     }
   }
   ```

4. **Never expose sensitive data** (passwords, internal IDs, stack traces)

---

## Data Management

### Backup Strategy

**Cloudflare D1 Backups:**

- Automatic daily backups (30-day retention)
- Manual export via `wrangler d1 export`
- Restore via `wrangler d1 execute --file=backup.sql`

**Recommended Backup Workflow:**

```bash
# Before major changes (event duplication, bulk edits)
wrangler d1 export bandcrawl-db --output=backup-$(date +%Y%m%d).sql

# Automated daily backups (via GitHub Actions)
# Store in secure location (S3, encrypted git repo)
```

### Data Migration Patterns

**From JSON to D1 (Already Implemented):**

```bash
node database/migrate-bands-json.js > migration.sql
wrangler d1 execute bandcrawl-db --file=migration.sql
```

**Future: CSV Import/Export**

```javascript
// POST /api/admin/import
// Body: CSV file with headers [name, venue, start_time, end_time, url]
// Returns: { imported: 50, errors: [] }

// GET /api/admin/export?event=vol-5
// Returns: CSV download of all bands for event
```

### Data Cleanup (Future Enhancement)

**Automated Cleanup (Cloudflare Cron Trigger):**

```javascript
// functions/scheduled/cleanup.js
export async function onSchedule(event) {
  const { env } = event;
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 2); // 2 years ago

  // Archive old events
  await env.DB.prepare(
    `
    UPDATE events
    SET archived_at = datetime('now')
    WHERE date < ? AND archived_at IS NULL
  `,
  )
    .bind(cutoffDate.toISOString())
    .run();

  // Delete old rate limit records
  await env.DB.prepare(
    `
    DELETE FROM rate_limit
    WHERE last_attempt < ?
  `,
  )
    .bind(cutoffDate.toISOString())
    .run();

  // Trim audit log (keep 1 year)
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  await env.DB.prepare(
    `
    DELETE FROM auth_audit
    WHERE timestamp < ?
  `,
  )
    .bind(oneYearAgo.toISOString())
    .run();
}
```

**Manual Cleanup Commands:**

```bash
# Delete unpublished events older than 30 days
wrangler d1 execute bandcrawl-db --command "
  DELETE FROM events
  WHERE is_published = 0
  AND created_at < datetime('now', '-30 days')
"

# Clear rate limits for specific IP
wrangler d1 execute bandcrawl-db --command "
  DELETE FROM rate_limit
  WHERE ip_address = '1.2.3.4'
"
```

### Schema Evolution

**Adding Columns (Non-Breaking):**

```sql
-- Safe: Default values allow existing code to work
ALTER TABLE events ADD COLUMN description TEXT DEFAULT '';
ALTER TABLE bands ADD COLUMN genre TEXT DEFAULT 'Unknown';
```

**Renaming Columns (Breaking):**

```sql
-- Step 1: Add new column
ALTER TABLE events ADD COLUMN event_name TEXT;

-- Step 2: Copy data
UPDATE events SET event_name = name;

-- Step 3: Update app code to use event_name

-- Step 4: Drop old column (after all clients updated)
ALTER TABLE events DROP COLUMN name;
```

**Migration Workflow:**

1. Create `database/migrations/YYYYMMDD_description.sql`
2. Test locally: `wrangler d1 execute bandcrawl-db --local --file=migrations/...sql`
3. Apply to production: `wrangler d1 execute bandcrawl-db --file=migrations/...sql`
4. Document in `CHANGELOG.md`

---

## Future Enhancements

### Priority 1: Data Portability

**CSV Import/Export**

- Endpoint: `POST /api/admin/import`, `GET /api/admin/export?event={slug}`
- Use case: Bulk entry from spreadsheet, backup to CSV
- Format: Standard CSV with headers
- Validation: Required fields, time format, venue matching

**Event Templates**

- Save event as template (venues + time slots, no bands)
- Duplicate from template for next year
- Use case: "Vol. 6" inherits "Vol. 5" structure

**Bulk Operations**

- Select multiple bands → change venue
- Select multiple bands → delete
- Copy bands from one event to another

### Priority 2: Asset Management

**Image Storage (Cloudflare R2)**

- Band photos, venue photos, event posters
- URL pattern: `https://cdn.bandcrawl.com/events/vol-5/bands/{band-id}.jpg`
- Admin upload: Drag-drop in admin panel
- Optimization: Cloudflare Images for resizing

**Schema Addition:**

```sql
ALTER TABLE events ADD COLUMN poster_url TEXT;
ALTER TABLE venues ADD COLUMN photo_url TEXT;
ALTER TABLE bands ADD COLUMN photo_url TEXT;
```

### Priority 3: Analytics & Insights

**User Behavior (Privacy-Preserving)**

- Track: Which bands are added to schedules (aggregate counts only)
- No user IDs, no IP tracking, no personal data
- Use case: Identify popular bands, venue traffic patterns

**Admin Dashboard**

- Total bands per event
- Venue utilization (bands per venue)
- Time conflict reports
- Busiest time slots

**Implementation:**

```sql
CREATE TABLE IF NOT EXISTS band_selections (
  band_id INTEGER NOT NULL,
  selection_count INTEGER NOT NULL DEFAULT 0,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (band_id) REFERENCES bands(id) ON DELETE CASCADE
);

-- Increment on user selection (client sends POST /api/track)
UPDATE band_selections
SET selection_count = selection_count + 1,
    last_updated = datetime('now')
WHERE band_id = ?;
```

### Priority 4: Automation

**Scheduled Tasks (Cloudflare Cron Triggers)**

```toml
# wrangler.toml
[triggers]
crons = ["0 2 * * *"]  # Daily at 2am UTC
```

**Use Cases:**

- Archive old events
- Clean up rate limit table
- Send reminders (email integration)
- Generate reports

**Email Notifications (Cloudflare Email Workers)**

- Password reset link (instead of phone call)
- Event published notification
- Conflict detection alerts

### Priority 5: Multi-Tenancy

**Use Case:** Different organizers run separate band crawls

**Schema Addition:**

```sql
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  subdomain TEXT UNIQUE,  -- e.g., "nashville" → nashville.bandcrawl.com
  admin_password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE events ADD COLUMN org_id INTEGER REFERENCES organizations(id);
```

**Routing:**

- Subdomain-based: `nashville.bandcrawl.com` → org_id = 1
- Or path-based: `bandcrawl.com/nashville/api/schedule`

---

## Development Workflow

### Branch Strategy

```
main (production)
  ↑
  └── dev (staging)
       ↑
       └── feature/event-templates
       └── feature/csv-import
       └── bugfix/rate-limit
```

**Rules:**

- All features → `dev` first
- Test on staging (preview deployment)
- Merge `dev` → `main` for production
- Tag releases: `v1.0.0`, `v1.1.0`

### Local Development

```bash
# Setup
cd frontend
npm install
wrangler d1 create bandcrawl-db
wrangler d1 execute bandcrawl-db --local --file=../database/schema.sql

# Development
npm run dev  # Vite dev server on :5173
# OR
npx wrangler pages dev dist --binding DB=bandcrawl-db  # Full stack

# Testing
npm run test        # Vitest unit tests
npm run test:a11y   # Accessibility tests
npm run lint        # ESLint
npm run build       # Production build
```

### Deployment Checklist

**Before Deploying:**

- [ ] Run tests: `npm run test`
- [ ] Run linter: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Test locally with production build: `npx wrangler pages dev dist`
- [ ] Review git diff for sensitive data (passwords, API keys)
- [ ] Update `CHANGELOG.md`

**Production Deployment:**

```bash
# Option 1: Automatic (GitHub push to main)
git push origin main

# Option 2: Manual
cd frontend
npm run build
npx wrangler pages deploy dist
```

**Post-Deployment:**

- [ ] Verify `/api/schedule?event=current` returns data
- [ ] Verify admin panel login works
- [ ] Check Cloudflare dashboard for errors
- [ ] Monitor D1 query performance

### Testing Strategy

**Unit Tests (Vitest):**

```javascript
// frontend/src/test/schedule.test.js
test('filters conflicts correctly', () => {
  const bands = [...];
  const conflicts = detectConflicts(bands);
  expect(conflicts).toHaveLength(2);
});
```

**Integration Tests (Playwright):**

```javascript
// tests/admin.spec.js
test("admin can create event", async ({ page }) => {
  await page.goto("/admin");
  await page.fill("input[name=password]", "test-password");
  await page.click('button:text("Login")');
  await page.click("text=Events");
  await page.click("text=Create New Event");
  // ...
});
```

**API Tests (Vitest + MSW):**

```javascript
// tests/api/schedule.test.js
test("GET /api/schedule returns current event", async () => {
  const response = await fetch("/api/schedule?event=current");
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toHaveLength(50);
});
```

### Monitoring & Debugging

**Cloudflare Logs:**

```bash
# Tail live logs
wrangler pages deployment tail

# View specific deployment logs
wrangler pages deployment list
wrangler pages deployment logs <deployment-id>
```

**D1 Query Logs:**

```bash
# Enable query logging in wrangler.toml
[env.production]
d1_databases = [
  { binding = "DB", database_id = "...", debug = true }
]
```

**Error Tracking:**

- Cloudflare Analytics → Workers & Pages → Errors
- Set up alerts for 5xx errors
- Monitor rate limit lockouts via `auth_audit` table

---

## SuperClaude Integration

### Recommended Commands for Implementation

**1. Architecture Analysis**

```bash
/sc:research "Cloudflare D1 multi-tenant architecture best practices"
/sc:research "Event management system database design patterns"
```

**2. Code Generation**

```bash
/sc:generate api-endpoint --type cloudflare-function --path functions/api/admin/export.js
/sc:generate database-migration --description "Add archived_at to events table"
```

**3. Testing**

```bash
/sc:test --coverage api/schedule.js
/sc:test --type integration admin-panel
```

**4. Documentation**

```bash
/sc:docs api --format openapi --output docs/api-spec.yaml
/sc:docs database --format erd --output docs/schema.png
```

**5. Security Review**

```bash
/sc:audit security functions/api/admin/_middleware.js
/sc:audit performance database/schema.sql
```

### Project-Specific Patterns

**Use Sequential MCP for:**

- Multi-step migrations (schema change → data migration → app update)
- Complex debugging (auth flow, rate limiting logic)
- Architectural analysis (event lifecycle, multi-tenancy design)

**Use Context7 MCP for:**

- Cloudflare Workers API reference
- D1 database best practices
- React patterns for admin panel

**Use Serena MCP for:**

- Project memory (store architecture decisions)
- Symbol operations (refactor API endpoints)
- Cross-session continuity (remember where you left off)

---

## Quick Reference

### Database Commands

```bash
# Create database
wrangler d1 create bandcrawl-db

# Execute SQL
wrangler d1 execute bandcrawl-db --file=schema.sql
wrangler d1 execute bandcrawl-db --command "SELECT * FROM events"

# Export/Import
wrangler d1 export bandcrawl-db --output=backup.sql
wrangler d1 execute bandcrawl-db --file=backup.sql

# List databases
wrangler d1 list
```

### API Endpoints

```
PUBLIC:
GET  /api/schedule?event={slug|current}

ADMIN (requires X-Admin-Password header):
GET    /api/admin/events
POST   /api/admin/events
PUT    /api/admin/events/{id}
DELETE /api/admin/events/{id}
POST   /api/admin/events/{id}/duplicate

GET    /api/admin/venues
POST   /api/admin/venues
PUT    /api/admin/venues/{id}
DELETE /api/admin/venues/{id}

GET    /api/admin/bands?event_id={id}
POST   /api/admin/bands
PUT    /api/admin/bands/{id}
DELETE /api/admin/bands/{id}
```

### File Structure

```
longweekendbandcrawl/
├── database/
│   ├── schema.sql           # Table definitions
│   ├── seed.sql             # Sample data
│   └── migrations/          # Future: versioned migrations
├── functions/
│   ├── _middleware.js       # Global CORS
│   └── api/
│       ├── schedule.js      # Public API
│       └── admin/           # Protected endpoints
├── frontend/src/
│   ├── components/          # React components
│   ├── admin/               # Admin panel
│   └── utils/               # API client
├── wrangler.toml            # Cloudflare config
└── docs/BACKEND_FRAMEWORK.md     # This file
```

---

## Appendix: Schema Reference

```sql
-- Complete schema (for reference)
-- See database/schema.sql for authoritative version

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  address TEXT
);

CREATE TABLE bands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  venue_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT
);

CREATE TABLE auth_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,
  success INTEGER NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  details TEXT
);

CREATE TABLE rate_limit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL UNIQUE,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  lockout_until TEXT,
  last_attempt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX idx_events_published ON events(is_published);
CREATE INDEX idx_events_slug ON events(slug);
CREATE INDEX idx_bands_event ON bands(event_id);
CREATE INDEX idx_bands_venue ON bands(venue_id);
CREATE INDEX idx_bands_event_time ON bands(event_id, start_time);
CREATE INDEX idx_auth_audit_timestamp ON auth_audit(timestamp);
CREATE INDEX idx_auth_audit_ip ON auth_audit(ip_address);
CREATE INDEX idx_rate_limit_ip ON rate_limit(ip_address);
```

---

**End of Backend Framework Documentation**

For questions or clarifications, refer to:

- `docs/D1_SETUP.md` - Database setup and admin panel usage
- `docs/CLAUDE.md` - Project overview and design guidance
- Cloudflare D1 Docs: <https://developers.cloudflare.com/d1/>
