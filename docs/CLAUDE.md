# CLAUDE.md — Long Weekend Band Crawl

## Project Summary

A mobile-first web application for the Long Weekend Band Crawl music festival. Provides public event schedules, band profiles with stats, and a full-featured admin panel for event management.

**Current Status**: Production-ready with comprehensive database, admin tools, performer registry, and optimized performance.

## Visual Reference

Use `docs/schedule.webp` as the design inspiration:

- **Palette:** Deep navy (#1a1f36) / purple (#2d1b4e) background with bright neon accent colors (orange #ff6b35)
- **Typography:** Clean, legible sans-serif — Inter/system-ui
- **Layout:** Scrollable vertical timeline, with band blocks styled like event cards
- **Mood:** Playful but readable in low light (concert/nighttime aesthetic)

## Stack & Architecture

### Frontend
- **Framework:** React 18 + Vite
- **Routing:** React Router v7
- **Styling:** TailwindCSS with custom band-crawl theme
- **State:** React hooks (useState, useEffect)
- **Build:** Vite with code splitting and lazy loading
- **Performance:**
  - Lazy loaded routes (Admin, Band Profiles)
  - Error boundaries for graceful degradation
  - Bundle optimization (143KB main, gzipped 43KB)

### Backend
- **Runtime:** Cloudflare Pages Functions (serverless)
- **Database:** Cloudflare D1 (SQLite-based)
- **Auth:** JWT with 24-hour sessions
- **API:** RESTful endpoints with JOIN-optimized queries

### Database Schema
- **events**: Event metadata (name, date, slug, is_published)
- **venues**: Venue information (name, address, capacity)
- **performers**: Global performer registry (name, genre, origin, social links)
- **bands**: Performance records (event_id, performer_id, venue_id, times)
- **users**: Admin authentication
- **subscriptions**: Email notification system

### Deployment
- **Platform:** Cloudflare Pages
- **Prod URL:** https://lwbc.dredre.net
- **Dev URL:** https://dev.longweekend-bandcrawl.pages.dev
- **Local Dev:** wrangler pages dev on port 8788

## Core Features

### Public Features
- **Event Timeline**: Now/Upcoming/Past events with JOIN-optimized queries (no N+1)
- **Band Profiles**: Sports card-inspired profiles with performance stats
- **Embed Pages**: Shareable event schedules
- **Email Subscriptions**: Verified subscriber notifications (pending email service integration)
- **PWA Support**: Service worker ready (currently disabled in dev)

### Admin Features
- **Event Wizard**: Multi-step event creation with venue/performer pickers
- **Bulk Operations**: CSV import with preview, bulk edit, bulk delete
- **Performers Manager**: Global performer registry with reusable profiles
- **Venues Manager**: Venue database with history tracking
- **User Management**: Admin accounts, password reset, session management
- **Context Switching**: Breadcrumbs and banners for clear navigation

### Performance Optimizations
- ✅ N+1 query pattern eliminated (timeline endpoint)
- ✅ Code splitting (AdminApp, BandProfilePage)
- ✅ Zero production console.log statements
- ✅ 5-minute CDN cache on public endpoints
- ✅ React Error Boundaries for resilience

### Security
- ✅ JWT authentication with HttpOnly cookies
- ✅ SQL injection prevention (parameterized queries)
- ✅ Input validation on all forms
- ✅ Password hashing with bcrypt
- ✅ Session timeout (24h default)
- ✅ HTTPS-only in production (Cloudflare enforced)
- 📋 SQL Safety documentation: `docs/SQL_SAFETY.md`
- 📋 Session Management docs: `docs/SESSION_MANAGEMENT.md`

## Development Workflow

### Local Development
```bash
# Frontend dev server (Vite HMR)
cd frontend
npm install
npm run dev

# Full stack with Cloudflare Pages Functions
cd longweekendbandcrawl
npx wrangler pages dev frontend/dist --compatibility-date=2024-01-01 --local

# Remote access (Tailscale VPN)
npx wrangler pages dev frontend/dist --ip 0.0.0.0
# Access at: http://100.73.43.62:8788 (or local IP)

# Database migrations
sqlite3 .wrangler/state/v3/d1/*.sqlite < database/migration-file.sql
```

### Testing
```bash
# Run all tests (Vitest)
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage

# Accessibility tests
npm run test:a11y
```

### Build & Deploy
```bash
# Build production bundle
npm run build

# Deploy to dev branch
npm run deploy:dev

# Deploy to production
npm run deploy:prod
```

### Quality Commands
```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check

# Full quality check (lint + format + test + build)
npm run quality
```

## Project Structure

```
longweekendbandcrawl/
├── frontend/src/
│   ├── admin/              # Admin panel components
│   │   ├── AdminApp.jsx    # Lazy loaded admin routes
│   │   ├── EventWizard.jsx # Multi-step event creation
│   │   ├── BandsTab.jsx    # Bulk operations, CSV import
│   │   └── PerformersManager.jsx # Global performer registry
│   ├── components/
│   │   ├── ErrorBoundary.jsx     # React error boundaries
│   │   ├── EventTimeline.jsx     # Public timeline
│   │   └── BandCard.jsx          # Performance display
│   ├── pages/
│   │   ├── BandProfilePage.jsx   # Lazy loaded profiles
│   │   └── EmbedPage.jsx         # Shareable schedules
│   └── utils/
│       ├── performance.js        # DEV-only logging
│       └── validation.js         # Input validation
├── functions/api/           # Cloudflare Pages Functions
│   ├── events/
│   │   ├── timeline.js          # Optimized JOIN queries
│   │   └── public.js            # Public event listing
│   ├── admin/               # Protected admin endpoints
│   │   ├── bands.js         # CRUD operations
│   │   └── performers.js    # Performer registry
│   └── _middleware.js       # JWT authentication
├── database/
│   ├── schema-v2.sql        # Current database schema
│   └── migrations/          # Migration history
├── docs/
│   ├── SQL_SAFETY.md        # SQL security guidelines
│   ├── SESSION_MANAGEMENT.md # Session timeout policies
│   └── CLAUDE.md            # This file
└── tests/
    ├── functions/api/events/__tests__/timeline.test.js
    ├── frontend/src/components/__tests__/ErrorBoundary.test.jsx
    └── frontend/src/utils/__tests__/performance.test.js
```

## Recent Improvements (Nov 2025)

### Performance Optimization
1. **N+1 Query Fix** (`functions/api/events/timeline.js`)
   - Replaced sequential queries with JOIN-based approach
   - Reduced database calls from O(n) to O(1) per time period
   - Eliminated 100-300ms latency per request

2. **Code Splitting** (`frontend/src/main.jsx`)
   - Lazy loaded BandProfilePage (-9.48 KB from main bundle)
   - AdminApp already lazy loaded
   - Main bundle: 143.88 KB (43.47 KB gzipped)

3. **Console.log Removal** (`frontend/src/utils/performance.js`, `frontend/src/main.jsx`)
   - All debug logging wrapped in `import.meta.env.DEV` checks
   - Zero console output in production builds
   - Error logging preserved for monitoring

### Reliability
4. **React Error Boundaries** (`frontend/src/components/ErrorBoundary.jsx`)
   - Graceful error handling for entire app
   - Context-specific boundaries for Admin and Band Profiles
   - Dev-mode error details with stack traces
   - User-friendly recovery UI

### Documentation
5. **SQL Safety Guide** (`docs/SQL_SAFETY.md`)
   - Parameterized query patterns
   - Bulk operation safety
   - Input validation examples
   - Security checklist

6. **Session Management** (`docs/SESSION_MANAGEMENT.md`)
   - Current 24-hour timeout documented
   - Security features and UX improvements
   - Testing procedures

### Testing
7. **Comprehensive Test Suite**
   - Timeline API tests (19 tests, all passing)
   - ErrorBoundary component tests (comprehensive coverage)
   - Performance utilities tests (DEV/production validation)
   - Framework: Vitest + React Testing Library

## Data Model

### Performers/Performances Hybrid Architecture

**Design Philosophy**: Support both reusable performer profiles AND ad-hoc inline data.

- **Performers Table**: Global registry of bands/artists with social links, descriptions, photos
- **Bands Table**: Individual performances that MAY reference a performer_id OR contain inline data
- **Benefits**:
  - Recurring performers get rich profiles with stats
  - One-off performers don't require registry entries
  - Bulk operations preserve data integrity
  - Performance history tracking for popular bands

### Key Database Fields

**Events**: id, name, slug, date, is_published, created_at
**Venues**: id, name, address, capacity, created_at
**Performers**: id, name, genre, origin, description, photo_url, url, instagram, bandcamp, facebook
**Bands**: id, event_id, performer_id (nullable), venue_id, name (nullable), start_time, end_time, genre (nullable), origin (nullable), photo_url (nullable), url (nullable)

### Migration System

**Active Schema**: `database/schema-v2.sql` (performers/performances architecture)
**Migrations**: Located in `database/migrations/` with timestamps
**Apply**: `sqlite3 .wrangler/state/v3/d1/*.sqlite < migration.sql`
**Validate**: `npm run validate:schema`

## Design Guidance for Claude

When working on this project:

### UI/UX
- Match color palette: Navy (#1a1f36), Purple (#2d1b4e), Orange (#ff6b35)
- Use TailwindCSS utility classes (avoid custom CSS)
- Mobile-first responsive design (touch targets ≥44px)
- Dark theme optimized for low-light environments
- Error states with clear recovery actions

### Code Quality
- Follow existing patterns in components/utils
- Add JSDoc comments for complex functions
- Use descriptive variable names (no abbreviations)
- Validate all user inputs before database operations
- Wrap async operations in try-catch with error responses

### Performance
- Use lazy loading for non-critical routes
- Implement JOIN queries to avoid N+1 patterns
- Add error boundaries around feature boundaries
- Keep bundle sizes under 150KB (main chunk)
- Cache public endpoints (5-minute CDN cache)

### Security
- ALWAYS use parameterized queries (`.bind()`)
- Validate inputs against whitelist patterns
- Never expose SQL errors to users
- Use JWT for authentication, not sessions
- Log security events for monitoring

### Testing
- Write tests for new API endpoints
- Test error conditions and edge cases
- Use mocks for database/external dependencies
- Validate accessibility with `npm run test:a11y`
- Maintain >80% coverage on critical paths

## Admin Credentials (Development)

**Username**: admin
**Password**: admin123
**Access**: http://localhost:8788/admin

⚠️ **Production**: Change credentials immediately on first deployment.

## Known Issues & Future Work

### High Priority
- [ ] Integrate email service (SendGrid/Mailgun) for subscription verification
- [ ] Implement session timeout warning UI (15 min before expiry)
- [ ] Add rate limiting to public APIs

### Medium Priority
- [ ] Implement "Remember Me" (7-day sessions)
- [ ] Add 2FA for admin accounts
- [ ] Refactor BandsTab.jsx with useReducer (currently 800+ lines)
- [ ] Structured logger utility (replace console.error)

### Low Priority
- [ ] Server-side token revocation (requires Redis/KV)
- [ ] Session management UI (view/revoke active sessions)
- [ ] Bulk venue operations
- [ ] Advanced search/filtering on admin pages

## Claude Priorities

1. **Evidence-Based**: All performance claims must be measurable
2. **Security First**: Never compromise on SQL injection, XSS, or auth
3. **User Privacy**: No analytics, no trackers, minimal data collection
4. **Accessibility**: WCAG 2.1 AA compliance, keyboard navigation
5. **Documentation**: Update this file when architecture changes
6. **Testing**: Write tests for new features and bug fixes
7. **Performance**: Measure before optimizing, use profiling tools
8. **Simplicity**: Prefer boring solutions over clever ones

## Resources

- **Architecture Docs**: `docs/` directory
- **Test Credentials**: `docs/TEST_ADMIN_CREDENTIALS.md`
- **Database Entries**: `database/DATABASE_ENTRIES.md`
- **Cloudflare D1**: https://developers.cloudflare.com/d1/
- **Vitest**: https://vitest.dev/
- **React Testing Library**: https://testing-library.com/react

---

**Last Updated**: November 5, 2025
**Version**: 2.0 (Performers/Performances Architecture)
**Status**: Production-ready with comprehensive test coverage
