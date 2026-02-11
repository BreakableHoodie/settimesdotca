# SetTimes.ca - Event Schedule & Performance Management Platform

A comprehensive event management platform for organizing multi-venue music events with role-based access control, band profiles, and public discovery features. Built for organizers, venues, and music lovers.

## Overview

SetTimes.ca is designed to streamline the management of multi-venue music events (like music festivals and band crawls) while providing powerful discovery tools for attendees. The platform supports:

- **Multi-user RBAC** with admin, editor, and viewer roles
- **Band profile management** with photos, bios, and social links
- **Event scheduling** with automatic conflict detection
- **Public API** for schedule discovery and integration
- **Privacy-first analytics** for organizers

## Current Status

**Version:** 1.1.0 (Production)
**Next Event:** Long Weekend Band Crawl (February 15, 2026)

Core features complete:
- ✅ RBAC Implementation (Admin/Editor/Viewer)
- ✅ Event Management & Scheduling
- ✅ Band Profiles with Photos
- ✅ Public Discovery API
- ✅ Security Hardening
- ✅ MFA/2FA with TOTP (authenticator apps)
- ✅ Trusted Devices & Backup Codes
- ✅ Navigation with Breadcrumbs & Sticky Headers

## Features

### For Event Organizers (Admin/Editor)

- Password-protected admin interface at `/admin`
- Multi-event management (create, publish/unpublish)
- CRUD operations for Events, Venues, and Band Profiles
- Performance scheduling with conflict detection
- Bulk operations (move venue, change time, delete multiple)
- Visual checkbox multi-select with conflict preview
- User management with role-based permissions (admin only)
- Comprehensive audit logging for security

### For Attendees (Public)

- Browse all performances across multiple venues
- Build personalized schedules with localStorage persistence
- "Coming up in X minutes" countdown notifications
- Conflict detection for overlapping shows
- Quick copy buttons for schedules (clipboard-friendly)
- Mobile-first responsive design with adaptive header

### Security & Compliance

- **Invite-only signup system** - Prevents unauthorized account creation
- **HTTPOnly session cookies** - Protection against XSS attacks
- **CSRF token protection** - Prevents cross-site request forgery
- **Content Security Policy** - Strict CSP headers with HSTS
- **Strict CORS validation** - Rejects unauthorized origins
- **MFA/2FA with TOTP** - Authenticator app support (Google Authenticator, Authy)
- **Trusted Devices** - Remember devices for 30 days to skip MFA
- **Backup Codes** - 8 single-use recovery codes per user
- Rate limiting and brute force protection
- Comprehensive audit logging (GDPR-compliant)
- Master password recovery system
- Role-based access control (admin/editor/viewer)
- IP tracking and user agent logging

For detailed security documentation, see [SECURITY.md](SECURITY.md) and the [SQL Injection Audit Report](docs/security/SQL_INJECTION_AUDIT.md).

### Discovery Features

- **Public Events API** (`/api/events/public`) - no authentication required
- **Event Timeline API** (`/api/events/timeline`) - full schedule with venues and performances
- **Band Profile Pages** (`/band/:slug`) - individual artist pages with bios, photos, and social links
- **Analytics Dashboard** for organizer insights

## Tech Stack

- **Frontend:** React 18, Vite 7, Tailwind CSS 3, React Router 7
- **Backend:** Cloudflare Pages Functions (serverless edge)
- **Database:** Cloudflare D1 (distributed SQLite)
- **Testing:** Vitest with 200+ tests
- **Build:** GitHub Actions CI/CD
- **Auth:** Session-based with secure token management
- **CDN:** Cloudflare global network (190+ cities)

**Current Focus**: Production operations and February 2026 event support.

## Quick Start

### Prerequisites

- Node.js 20+
- Cloudflare account (free tier works)
- Wrangler CLI (`npm install -g wrangler`)

### Local Development

```bash
# Clone the repository
git clone https://github.com/BreakableHoodie/settimesdotca.git
cd settimesdotca

# Install dependencies
npm install

# Initialize local database
npm run migrate:local

# Start development server
npx wrangler pages dev public --binding DB=settimes-db

# Server runs at http://localhost:8788
```

### Database Setup

```bash
# Create D1 database
wrangler d1 create settimes-db

# Update wrangler.toml with database_id from output

# Apply migrations to local database
npx wrangler d1 execute settimes-db --local --file=database/schema-v2.sql
npx wrangler d1 execute settimes-db --local --file=migrations/legacy/migration-single-org.sql
npx wrangler d1 execute settimes-db --local --file=migrations/legacy/migration-2fa.sql
npx wrangler d1 execute settimes-db --local --file=migrations/legacy/migration-password-reset-reason.sql
npx wrangler d1 execute settimes-db --local --file=migrations/legacy/migration-rbac-sprint-1-1.sql
npx wrangler d1 execute settimes-db --local --file=migrations/legacy/migration-sprint-1-2-event-management.sql
npx wrangler d1 execute settimes-db --local --file=migrations/legacy/migration-subscriptions.sql
npx wrangler d1 execute settimes-db --local --file=migrations/legacy/migration-metrics.sql
npx wrangler d1 execute settimes-db --local --file=migrations/legacy/migration-events-theming.sql
npx wrangler d1 execute settimes-db --local --file=migrations/legacy/migration-invite-codes.sql

# One-off upgrade (only if schedule_builds has band_id, not performance_id)
./scripts/run-migrate-schedule-builds-performance-id.sh --local

# Apply to production database
npx wrangler d1 execute settimes-db --remote --file=database/schema-v2.sql
# ... repeat for other migrations (include migration-invite-codes.sql)

# One-off upgrade (only if schedule_builds has band_id, not performance_id)
./scripts/run-migrate-schedule-builds-performance-id.sh --remote

# Create first admin invite code
node scripts/create-admin-invite.js --local  # For local dev
node scripts/create-admin-invite.js --prod   # For production
```

See [docs/D1_SETUP.md](docs/D1_SETUP.md) for complete database setup instructions.

### Environment Configuration

Create `.dev.vars` file (gitignored) for local development:

```bash
ADMIN_PASSWORD=your-strong-admin-password-here
MASTER_PASSWORD=your-even-stronger-master-password-here
DEVELOPER_CONTACT=555-123-4567
```

For production, set these in Cloudflare Pages dashboard under **Settings → Environment Variables**.

## Project Structure

```sh
settimes/
├── frontend/                  # React + Vite + Tailwind
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── admin/             # Admin panel components
│   │   ├── App.jsx            # Main application
│   │   └── main.jsx           # React entry point
│   ├── public/                # Static assets
│   └── package.json
├── functions/                 # Cloudflare Pages Functions
│   ├── api/
│   │   ├── admin/             # Protected admin endpoints
│   │   │   ├── bands/         # Band management
│   │   │   ├── venues/        # Venue management
│   │   │   ├── events/        # Event management
│   │   │   ├── users/         # User management
│   │   │   └── analytics/     # Analytics endpoints
│   │   ├── events/            # Public event APIs
│   │   ├── feeds/             # iCal feed generation
│   │   ├── subscriptions/     # Email subscription management
│   │   └── auth/              # Authentication endpoints
│   └── _middleware.js         # RBAC & security middleware
├── database/
│   └── schema-v2.sql          # Base schema
├── migrations/                # Numbered schema migrations (0001–0024)
├── docs/
│   ├── CLAUDE.md              # Project context for AI assistants
│   ├── DEPLOYMENT.md          # Deployment guide
│   ├── DATABASE.md            # Database schema documentation
│   ├── D1_SETUP.md            # Database setup guide
│   └── BACKEND_FRAMEWORK.md   # API documentation
├── wrangler.toml              # Cloudflare configuration
└── package.json               # Root dependencies
```

Note: Tests are co-located with their source files in `__tests__/` directories throughout `functions/` and `frontend/src/`.

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Current status: 200+ tests passing
```

## Role-Based Access Control

### Roles & Permissions

| Role | Level | Permissions |
|------|-------|-------------|
| **Admin** | 3 | Full access - user management, venues (structural data), all content |
| **Editor** | 2 | Content management - bands, events, publishing (cannot modify venues/users) |
| **Viewer** | 1 | Read-only - analytics, metrics, event viewing (no modifications) |

### Test Users (Local Development)

See `.dev.vars.test-users` for credentials. Default users:

- `admin@settimes.ca` - System Administrator (admin)
- `sarah@settimes.ca` - Second Admin (admin)
- `editor@settimes.ca` - Content Editor (editor)
- `viewer@settimes.ca` - Analytics Viewer (viewer)
- `inactive@settimes.ca` - Inactive User (testing)

**Note:** Use strong passwords in production. See [docs/D1_SETUP.md](docs/D1_SETUP.md) for security best practices.

## Deployment

### Cloudflare Pages (Recommended)

1. **Connect GitHub Repository**
   - Go to Cloudflare Dashboard → Pages → Create a project
   - Connect to `BreakableHoodie/settimesdotca`
   - Set production branch: `main`, preview branches: `dev`

2. **Configure Build Settings**
   - Build command: `npm run build`
   - Build output directory: `frontend/dist`
   - Root directory: `/`
   - Environment variable: `NODE_VERSION=20`

3. **Configure Environment Variables**
   - Add `ADMIN_PASSWORD`, `MASTER_PASSWORD`, `DEVELOPER_CONTACT`
   - Settings → Environment Variables → Production

4. **Deploy**
   - Every push to `main` triggers production deployment
   - Every push to `dev` triggers preview deployment
   - Domain: `settimes.pages.dev` (custom domain: `settimes.ca`)

   **Manual Deployment (from project root):**
   ```bash
   npm run deploy:prod
   ```
   This command properly includes static assets from `frontend/dist` and Functions from `functions/`.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for complete deployment guide.

## Development Commands

```bash
# Database
npm run migrate:local           # Apply migrations to local DB
npm run validate:schema         # Validate schema consistency

# Testing
npm test                        # Run all tests
npm run test:watch              # Watch mode
npm run test:coverage           # Coverage report

# Deploy (always from repo root so Functions are included)
npm run deploy:dev
npm run deploy:prod

# Local Development
npx wrangler pages dev public --binding DB=settimes-db  # Start dev server
npx wrangler d1 execute settimes-db --local --command "SELECT * FROM users"  # Query local DB

# Production Database
npx wrangler d1 execute settimes-db --remote --file=database/migration.sql  # Apply migration
npx wrangler d1 export settimes-db --output=backup.sql  # Backup database
```

## API Documentation

### Public Endpoints (No Auth)

- `GET /api/events/public` - List all published events
- `GET /api/events/timeline` - Full schedule with venues and performances
- `GET /api/events/:id/details` - Event details with full lineup
- `POST /api/metrics` - Privacy-first analytics beacon
- `GET /api/auth/activate?token=xxx` - Activate new account
- `POST /api/auth/reset-password` - Request password reset
- `POST /api/auth/reset-password-complete` - Complete password reset
- `POST /api/auth/resend-activation` - Resend activation email

### Protected Endpoints (Authentication Required)

All admin endpoints require authentication and appropriate role:

- `POST /api/admin/auth/login` - Login with email/password
- `POST /api/admin/auth/logout` - End session
- `POST /api/admin/auth/signup` - Register with invite code
- `POST /api/admin/auth/mfa/verify` - Verify MFA code
- `GET /api/admin/events` - List events (viewer+)
- `POST /api/admin/events` - Create event (editor+)
- `GET /api/admin/bands` - List bands (viewer+)
- `POST /api/admin/bands` - Create band (editor+)
- `GET /api/admin/venues` - List venues (viewer+)
- `POST /api/admin/venues` - Create venue (admin only)
- `GET /api/admin/users` - List users (admin only)
- `POST /api/admin/users` - Invite user (admin only)
- `GET /api/admin/analytics/*` - Analytics endpoints (viewer+)
- `GET /api/admin/audit-log` - Audit log (admin only)

See [docs/BACKEND_FRAMEWORK.md](docs/BACKEND_FRAMEWORK.md) for complete API reference.

## Contributing

This is a private project for SetTimes.ca. For issues or questions:

- **Technical Issues:** Create a GitHub issue
- **Security Concerns:** Email security@settimes.ca
- **General Questions:** hello@settimes.ca

## Roadmap

**Completed (2025):**
- ✅ RBAC with admin/editor/viewer roles
- ✅ Event management with conflict detection
- ✅ Band profiles with photos and bios
- ✅ Public discovery API
- ✅ Security hardening (HTTPOnly cookies, CSRF, CSP)
- ✅ Mobile-responsive design

**Completed (Q1 2026):**
- ✅ MFA/2FA with TOTP authenticator support
- ✅ Trusted Devices (30-day remember)
- ✅ Backup codes for account recovery
- ✅ Improved navigation (breadcrumbs, sticky header)
- ✅ Band profile UX improvements

**Current (2026):**
- Production operations for February 2026 event

**Upcoming:**
- Email subscriptions with city/genre filtering (backend ready, frontend integration pending)
- iCal feed integration for calendar apps (backend ready, frontend integration pending)
- Event theming and colour customization from admin backend
- Performance monitoring and optimization

## Design

Interface inspired by modern event aesthetic:
- Deep navy (#0c0f1a) background
- Cyan (#0ea5e9) accent colors for actions and branding
- White text for high contrast and readability
- Mobile-first responsive layout
- Desktop: Multi-column grid by venue
- Mobile: Single column chronological list
- Sticky navigation header with contextual "My Schedule" link
- Breadcrumb navigation on band profile pages

## Browser Support

Modern browsers with ES2020+ support:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Credits

Platform developed for event management needs, inspired by the Long Weekend Band Crawl events presented by Fat Scheid & Pink Lemonade Records.

## License

MIT — see [LICENSE](LICENSE)
