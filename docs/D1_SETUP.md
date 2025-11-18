# D1 Database and Admin Panel Setup Guide

Complete setup instructions for the Long Weekend Band Crawl admin panel with Cloudflare D1 database.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Production Deployment](#production-deployment)
- [Admin Panel Usage](#admin-panel-usage)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Node.js 18+ installed
- Cloudflare account with Pages enabled
- Wrangler CLI installed: `npm install -g wrangler`
- Authenticated with Wrangler: `wrangler login`

---

## Local Development Setup

### 1. Create D1 Database

```bash
# Create the database
wrangler d1 create settimes-db

# Output will show:
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` from the output.

### 2. Update wrangler.toml

Edit `wrangler.toml` and replace `YOUR_DATABASE_ID_HERE` with your actual database ID:

```toml
[[d1_databases]]
binding = "DB"
database_name = "settimes-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # Your actual ID
```

### 3. Initialize Database Schema

```bash
# Create tables
wrangler d1 execute settimes-db --file=database/schema.sql --local

# Add sample data (optional)
wrangler d1 execute settimes-db --file=database/seed.sql --local
```

### 4. Set Up Environment Variables

```bash
# Copy example file
cp .env.example .dev.vars

# Edit .dev.vars and set strong passwords
# NEVER commit .dev.vars to git (it's in .gitignore)
```

Example `.dev.vars`:

```env
ADMIN_PASSWORD=your-strong-admin-password-16-chars-minimum
MASTER_PASSWORD=your-even-stronger-master-password-20-chars-minimum
DEVELOPER_CONTACT=555-123-4567
```

### 5. Migrate Existing Data (Optional)

If you have existing `bands.json` data:

```bash
# Generate migration SQL
node database/migrate-bands-json.js > database/migration.sql

# Execute migration
wrangler d1 execute settimes-db --local --file=database/migration.sql
```

### 6. Run Local Development Server

```bash
# Start Wrangler dev server (includes Pages Functions + D1)
cd frontend
npx wrangler pages dev dist --binding DB=settimes-db --local

# Or use Vite dev server (API calls will proxy to port 3000)
npm run dev
```

Access the app:

- Main app: <http://localhost:5173>
- Admin panel: <http://localhost:5173/admin>

---

## Production Deployment

### 1. Create Production D1 Database

```bash
# Create production database (different from local)
wrangler d1 create settimes-db-production

# Note the database_id for production
```

### 2. Update Cloudflare Pages D1 Binding

In Cloudflare dashboard:

1. Go to **Workers & Pages** > Your project
2. Click **Settings** > **Functions**
3. Scroll to **D1 database bindings**
4. Add binding:
   - **Variable name**: `DB`
   - **D1 database**: Select your production database

### 3. Initialize Production Database

```bash
# Execute schema on production database
wrangler d1 execute settimes-db-production --file=database/schema.sql

# Optionally add seed data
wrangler d1 execute settimes-db-production --file=database/seed.sql

# Or migrate existing bands.json
node database/migrate-bands-json.js > database/migration.sql
wrangler d1 execute settimes-db-production --file=database/migration.sql
```

### 4. Set Environment Variables in Cloudflare Pages

In Cloudflare dashboard:

1. Go to **Workers & Pages** > Your project
2. Click **Settings** > **Environment Variables**
3. Add three variables:
   - `ADMIN_PASSWORD` - Strong password (16+ characters)
   - `MASTER_PASSWORD` - Emergency recovery password (20+ characters)
   - `DEVELOPER_CONTACT` - Your phone number

**Important:** Set these for both **Production** and **Preview** environments (use different passwords for preview).

### 5. Deploy

```bash
cd frontend
npm run build
npx wrangler pages deploy dist
```

Or push to GitHub if you have automatic deployments configured.

Access your admin panel at: `https://yourdomain.com/admin`

---

## Admin Panel Usage

### Accessing the Admin Panel

1. Navigate to `https://yourdomain.com/admin`
2. Enter the `ADMIN_PASSWORD`
3. You're now logged in (session persists until browser close)

### Managing Events

**Create New Event:**

1. Go to **Events** tab
2. Click **Create New Event**
3. Fill in:
   - Name (e.g., "Long Weekend Band Crawl Vol. 5")
   - Date (YYYY-MM-DD format)
   - Slug (URL-friendly, e.g., "vol-5")
   - Publish status (optional)
4. Click **Create**

**Duplicate Event:**

1. Find the event you want to duplicate
2. Click **Duplicate**
3. Enter new name, date, and slug
4. All bands and venues will be copied to the new event

**Publish/Unpublish:**

- Toggle the publish button to make events visible to the public
- Only published events appear on the main schedule

### Managing Venues

**Add Venue:**

1. Go to **Venues** tab
2. Fill in venue name and address
3. Click **Add Venue**

**Edit Venue:**

1. Click **Edit** on the venue
2. Update name/address
3. Click **Save**

**Delete Venue:**

- Only venues with 0 bands can be deleted
- Delete all bands at the venue first

### Managing Bands

**Add Band:**

1. Go to **Bands** tab
2. Select an event from the dropdown
3. Fill in:
   - Band name
   - Venue (dropdown)
   - Start time (HH:MM format, 24-hour)
   - End time
   - URL (optional)
4. Click **Add Band**

**Conflict Detection:**

- System automatically detects overlapping times at the same venue
- Conflicts are highlighted in red
- You can still save conflicting bands (warnings only)

**Edit Band:**

1. Click **Edit** on the band
2. Update details
3. Conflicts are re-checked on save

---

## Security Best Practices

### Invite-Only Signup System

**NEW:** The platform now uses an invite-only signup system to prevent unauthorized account creation.

**Creating Admin Invite Codes:**

```bash
# For local development
node scripts/create-admin-invite.js --local

# For production
node scripts/create-admin-invite.js --prod
```

**Invite Code Best Practices:**

- Generate unique invite codes for each new user
- Set appropriate expiration times (default: 7 days)
- Store invite codes securely (password manager)
- Never share via unsecured channels (email, SMS)
- Invite codes are single-use only
- Revoke unused codes if needed via `/api/admin/invite-codes/:code` (DELETE)

**First Admin Setup:**

1. Run migration: `wrangler d1 execute settimes-db --local --file=database/migration-invite-codes.sql`
2. Generate admin invite: `node scripts/create-admin-invite.js --local`
3. Insert code into database using the provided command
4. Use the code during signup at `/admin`

### Password Management

**User Passwords:**

- 8+ characters minimum (enforced)
- Mix of letters, numbers, symbols recommended
- Password strength validation during signup
- PBKDF2 hashing with 100,000 iterations

**MASTER_PASSWORD (if configured):**

- 20+ characters minimum
- ONLY stored in developer's password manager
- NEVER shared with organizers
- Used only for emergency password recovery
- Rotate annually

### Rate Limiting

The system automatically protects against brute force:

- 5 failed login attempts in 10 minutes = 1 hour IP lockout
- All auth attempts logged in `auth_audit` table
- Friendly lockout messages shown to users

### Audit Logging

All authentication events are logged:

```sql
SELECT * FROM auth_audit ORDER BY timestamp DESC LIMIT 100;
```

Monitor for:

- Repeated failed attempts from same IP
- Successful logins at unusual times
- Password reset requests

### Access Control

- Only access admin panel over HTTPS
- Avoid using public WiFi for admin access
- Consider VPN for additional security
- Rotate admin password when personnel changes
- Review audit logs periodically

### Environment Variable Security

- Never commit `.dev.vars` to git (it's in `.gitignore`)
- Use different passwords for dev/staging/production
- Set environment variables as encrypted secrets in Cloudflare
- Never send passwords via email or SMS
- Use password manager to generate and store

---

## Troubleshooting

### "Event not found" or "No published events"

**Problem:** API returns 404 when fetching schedule

**Solutions:**

1. Check that at least one event is published:

   ```bash
   wrangler d1 execute settimes-db --command "SELECT * FROM events WHERE is_published = 1"
   ```

2. Publish an event via admin panel or SQL:

   ```bash
   wrangler d1 execute settimes-db --command "UPDATE events SET is_published = 1 WHERE id = 1"
   ```

### "Database error" in admin panel

**Problem:** D1 database not bound correctly

**Solutions:**

1. Check `wrangler.toml` has correct database_id
2. Verify D1 binding in Cloudflare Pages dashboard
3. Ensure database exists:

   ```bash
   wrangler d1 list
   ```

### "Unauthorized" when accessing admin endpoints

**Problem:** Password not set or incorrect

**Solutions:**

1. Check environment variables in Cloudflare dashboard
2. For local dev, ensure `.dev.vars` exists with correct passwords
3. Restart Wrangler dev server after changing `.dev.vars`

### Admin panel shows empty/no data

**Problem:** Database tables are empty

**Solutions:**

1. Run schema creation:

   ```bash
   wrangler d1 execute settimes-db --file=database/schema.sql
   ```

2. Add seed data or migrate:

   ```bash
   wrangler d1 execute settimes-db --file=database/seed.sql
   ```

### "IP locked out" message

**Problem:** Too many failed login attempts

**Solutions:**

1. Wait 1 hour for automatic unlock
2. Or manually reset in database:

   ```bash
   wrangler d1 execute settimes-db --command "DELETE FROM rate_limit WHERE ip_address = 'your.ip.here'"
   ```

3. Use master password to retrieve admin password if forgotten

### Forgot admin password

**Solutions:**

1. Click "Forgot password?" on login screen
2. Contact developer using phone number shown
3. Or use master password to retrieve admin password

### Local development - API not working

**Problem:** Functions not running locally

**Solutions:**

1. Use `wrangler pages dev` instead of `npm run dev`
2. Or ensure Vite proxy is configured (already set up in `vite.config.js`)
3. Check that D1 binding is correct:

   ```bash
   npx wrangler pages dev dist --binding DB=settimes-db --local
   ```

---

## Database Queries (Advanced)

### Useful SQL Queries

**List all events with band counts:**

```sql
SELECT e.*, COUNT(b.id) as band_count
FROM events e
LEFT JOIN bands b ON e.id = b.event_id
GROUP BY e.id;
```

**Find time conflicts:**

```sql
SELECT b1.name as band1, b2.name as band2, v.name as venue,
       b1.start_time, b1.end_time, b2.start_time, b2.end_time
FROM bands b1
JOIN bands b2 ON b1.event_id = b2.event_id
  AND b1.venue_id = b2.venue_id
  AND b1.id < b2.id
  AND b1.start_time < b2.end_time
  AND b1.end_time > b2.start_time
JOIN venues v ON b1.venue_id = v.id
WHERE b1.event_id = 1;
```

**View recent auth attempts:**

```sql
SELECT timestamp, action, success, ip_address
FROM auth_audit
ORDER BY timestamp DESC
LIMIT 50;
```

**Check current rate limits:**

```sql
SELECT * FROM rate_limit
WHERE lockout_until > datetime('now')
ORDER BY last_attempt DESC;
```

### Execute Queries

```bash
# Production
wrangler d1 execute settimes-db --command "YOUR SQL HERE"

# Local
wrangler d1 execute settimes-db --local --command "YOUR SQL HERE"
```

---

## Architecture Overview

### Data Flow

```
User → Frontend (React) → API (/api/schedule?event=current)
                        → D1 Database → Returns published event data

Admin → Admin Panel → Auth (/api/admin/auth/login)
                   → CRUD APIs (/api/admin/events, venues, bands)
                   → D1 Database (with password protection + rate limiting)
```

### Fallback Strategy

The app uses a three-tier fallback:

1. Try `/api/schedule?event=current` (D1 database)
2. If fails, try `/bands.json` (static file)
3. If fails, use embedded fallback (compiled into app)

This ensures the app works even if:

- D1 database is not set up yet
- API is temporarily down
- Network connectivity issues

### File Structure

```
settimes/
├── database/
│   ├── schema.sql              # D1 table definitions
│   ├── seed.sql                # Sample data
│   └── migrate-bands-json.js   # Migration script
├── functions/
│   ├── _middleware.js          # CORS + error handling
│   └── api/
│       ├── schedule.js         # Public API
│       └── admin/
│           ├── _middleware.js  # Auth + rate limiting
│           ├── auth/
│           │   ├── login.js
│           │   └── reset.js
│           ├── events.js       # Events CRUD
│           ├── events/[id].js  # Publish/duplicate
│           ├── venues.js       # Venues CRUD
│           ├── venues/[id].js  # Edit/delete venue
│           ├── bands.js        # Bands CRUD + conflicts
│           └── bands/[id].js   # Edit/delete band
├── frontend/src/
│   ├── admin/
│   │   ├── AdminApp.jsx        # Auth wrapper
│   │   ├── AdminLogin.jsx      # Login + forgot password
│   │   ├── AdminPanel.jsx      # Main panel + tabs
│   │   ├── EventsTab.jsx       # Events management
│   │   ├── VenuesTab.jsx       # Venues management
│   │   └── BandsTab.jsx        # Bands + conflicts
│   └── utils/
│       └── adminApi.js         # API client functions
├── wrangler.toml               # D1 bindings + config
└── .env.example                # Environment variable template
```

---

## Support

For issues or questions:

1. Check this guide and troubleshooting section
2. Review Cloudflare D1 documentation: <https://developers.cloudflare.com/d1/>
3. Contact developer at the phone number in your admin panel "Forgot Password" screen

---

## Changelog

**2025-10-15:** Initial D1 admin panel implementation

- Complete CRUD operations for events, venues, and bands
- Password-protected admin panel with rate limiting
- Time conflict detection for band scheduling
- Master password emergency recovery
- Comprehensive audit logging
- Migration script for existing data
