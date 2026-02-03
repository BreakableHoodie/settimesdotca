# CLAUDE.md — SetTimes

## Project Summary

A mobile-first web application for live music event management. Provides public event schedules, band profiles with stats, and a full-featured admin panel for event management.

**Current Status**: Production (Q1 2026). All core features complete including MFA/2FA, trusted devices, navigation improvements. February 2026 event scheduled.

**Active Roadmap**: Production operations and maintenance for upcoming events.

## Visual Reference

Use `docs/schedule.webp` as the design inspiration:

- **Palette:** Deep navy (#0c0f1a) background with cyan (#0ea5e9) accent colors
- **Typography:** Clean, legible sans-serif — Inter/system-ui
- **Layout:** Scrollable vertical timeline, with band blocks styled like event cards
- **Mood:** Modern, readable in low light (concert/nighttime aesthetic)
- **Navigation:** Sticky header with SetTimes branding, contextual breadcrumbs

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
- **Auth:** Session-based with HTTPOnly cookies, CSRF protection
- **MFA:** TOTP-based 2FA with trusted devices and backup codes
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
- **Prod URL:** https://settimes.ca
- **Dev URL:** https://dev.settimes.pages.dev
- **Local Dev:** wrangler pages dev on port 8788
- **Manual Deploy:** `wrangler pages deploy frontend/dist --project-name settimesdotca --branch main` (from project root)

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

- ✅ Session-based authentication with HTTPOnly cookies
- ✅ CSRF token protection on all state-changing operations
- ✅ MFA/2FA with TOTP (Google Authenticator, Authy, etc.)
- ✅ Trusted devices (30-day remember) to skip MFA
- ✅ Backup codes (8 single-use recovery codes per user)
- ✅ SQL injection prevention (parameterized queries)
- ✅ Input validation on all forms
- ✅ Password hashing with bcrypt
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
cd settimes
npx wrangler pages dev frontend/dist --compatibility-date=2024-01-01 --local

# Remote access (Tailscale VPN)
npx wrangler pages dev frontend/dist --ip 0.0.0.0
# Access at: http://100.73.43.62:8788 (or local IP)

# Database migrations
sqlite3 .wrangler/state/v3/d1/*.sqlite < migrations/legacy/migration-file.sql
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
settimes/
├── frontend/src/
│   ├── admin/              # Admin panel components
│   │   ├── AdminApp.jsx    # Lazy loaded admin routes
│   │   ├── EventWizard.jsx # Multi-step event creation
│   │   ├── BandsTab.jsx    # Bulk operations, CSV import
│   │   └── PerformersManager.jsx # Global performer registry
│   ├── components/
│   │   ├── ErrorBoundary.jsx     # React error boundaries
│   │   ├── EventTimeline.jsx     # Public timeline
│   │   ├── BandCard.jsx          # Performance display
│   │   └── __tests__/            # Component tests
│   ├── pages/
│   │   ├── BandProfilePage.jsx   # Lazy loaded profiles
│   │   └── EmbedPage.jsx         # Shareable schedules
│   └── utils/
│       ├── performance.js        # DEV-only logging
│       ├── validation.js         # Input validation
│       └── __tests__/            # Utility tests
├── functions/api/           # Cloudflare Pages Functions
│   ├── events/
│   │   ├── timeline.js          # Optimized JOIN queries
│   │   ├── public.js            # Public event listing
│   │   └── __tests__/           # API tests
│   ├── admin/               # Protected admin endpoints
│   │   ├── bands.js         # CRUD operations
│   │   ├── performers.js    # Performer registry
│   │   └── __tests__/       # Admin API tests
│   └── _middleware.js       # RBAC authentication
├── database/
│   ├── schema-v2.sql        # Current database schema
│   └── migrations/          # Migration history
└── docs/
    ├── SQL_SAFETY.md        # SQL security guidelines
    ├── SESSION_MANAGEMENT.md # Session timeout policies
    └── CLAUDE.md            # This file
```

Note: Tests are co-located with source files in `__tests__/` directories.

## Recent Improvements

### Q1 2026: Security Hardening & Navigation ✅

1. **MFA/2FA Implementation**
   - TOTP-based multi-factor authentication with authenticator app support
   - Trusted devices feature (30-day remember)
   - 8 backup codes per user for account recovery
   - MFA settings modal in admin panel

2. **Navigation Improvements**
   - Sticky header on band profile pages with SetTimes branding
   - Contextual "My Schedule" link when user has saved bands
   - Breadcrumb navigation showing path: Events → Event Name → Band Name
   - localStorage-based schedule detection across events

3. **SPA Routing Fix**
   - Proper `_routes.json` configuration for Cloudflare Pages
   - Only `/api/*` routes to Functions, everything else to static files
   - Correct deployment command: `wrangler pages deploy frontend/dist`

4. **UI Updates**
   - New SetTimes favicon (cyan "S" + white "T" on navy background)
   - Band profile buttons in column layout
   - Updated color scheme: navy #0c0f1a, cyan #0ea5e9

### Sprint 1.3: Band Performance History (Nov 18, 2025) ✅

1. **Performance History Feature**
   - Modal component showing band statistics and chronological performance list
   - Statistics: totalShows, uniqueVenues, uniqueEvents
   - Full profile display: photo, description, genre, origin, social links
   - Event and venue details with formatted dates and times
   - FontAwesome icons for enhanced UI (faMusic, faCalendar, faMapMarkerAlt, faClock)
   - PropTypes validation for component interfaces

2. **Backend API** (`functions/api/admin/bands/stats/[name].js`)
   - GET /api/admin/bands/stats/{name} endpoint
   - JOIN-optimized queries preventing N+1 patterns
   - RBAC protected (viewer role required)
   - Profile data from most recent band entry
   - Chronological performance ordering (DESC by date, time)

3. **Test Suite** - 23 New Passing Tests
   - Authentication tests (2): RBAC enforcement
   - Basic functionality tests (3): band lookup, profile data, performance list
   - Statistics calculation tests (5): totalShows, uniqueVenues, uniqueEvents accuracy
   - Performance data tests (4): event/venue associations, chronological ordering
   - Profile data tests (2): photo_url, description, genre, origin, social_links
   - Edge cases tests (7): missing data, null handling, case sensitivity
   - **Total: 88 passing tests / 0 failing** (94 total with 6 todos)

4. **BandsTab Integration** (`frontend/src/admin/BandsTab.jsx`)
   - History button (📊) for each band
   - Modal state management with historyBandName
   - Social links serialization for band profiles

### Test Infrastructure & Database (Nov 13, 2025) ✅

5. **Complete Test Suite** - 100% Pass Rate Maintained
   - Fixed reset-password endpoint (direct password updates with validation)
   - Fixed signup endpoint (session creation in database)
   - Added RBAC protection to analytics endpoints (admin-only)
   - Test schema aligned with production (all columns and tables)
   - D1 API compatibility in mock database

2. **Database Initialization**
   - `database/longweekend.db` initialized from 0 bytes
   - 8 migrations applied in correct order (schema-v2 → events-theming)
   - 17 tables ready for Sprint 1.1-1.3 features
   - Default admin user: `admin@settimes.ca` / `LOCAL_ADMIN_PASSWORD`
   - Full audit logging, RBAC, 2FA infrastructure, metrics

3. **UI/UX Redesign Planning**
   - Sprint 2.0 added to roadmap (1.5 days)
   - Design system foundation prioritized before implementation
   - Comprehensive component library planned (10+ base components)
   - Accessibility built-in (WCAG 2.1 AA compliance)

### Performance Optimization (Nov 5, 2025)

4. **N+1 Query Fix** (`functions/api/events/timeline.js`)
   - Replaced sequential queries with JOIN-based approach
   - Reduced database calls from O(n) to O(1) per time period
   - Eliminated 100-300ms latency per request

5. **Code Splitting** (`frontend/src/main.jsx`)
   - Lazy loaded BandProfilePage (-9.48 KB from main bundle)
   - AdminApp already lazy loaded
   - Main bundle: 143.88 KB (43.47 KB gzipped)

6. **Console.log Removal** (`frontend/src/utils/performance.js`, `frontend/src/main.jsx`)
   - All debug logging wrapped in `import.meta.env.DEV` checks
   - Zero console output in production builds
   - Error logging preserved for monitoring

### Reliability (Nov 5, 2025)

7. **React Error Boundaries** (`frontend/src/components/ErrorBoundary.jsx`)
   - Graceful error handling for entire app
   - Context-specific boundaries for Admin and Band Profiles
   - Dev-mode error details with stack traces
   - User-friendly recovery UI

### Documentation (Nov 5, 2025)

8. **SQL Safety Guide** (`docs/SQL_SAFETY.md`)
   - Parameterized query patterns
   - Bulk operation safety
   - Input validation examples
   - Security checklist

9. **Session Management** (`docs/SESSION_MANAGEMENT.md`)
   - Current 24-hour timeout documented
   - Security features and UX improvements
   - Testing procedures

### Testing Framework (Nov 5, 2025)

10. **Comprehensive Test Suite**
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
**Migrations**: Located in `migrations/legacy/` with timestamps
**Apply**: `sqlite3 .wrangler/state/v3/d1/*.sqlite < migration.sql`
**Validate**: `npm run validate:schema`

## Design Guidance for Claude

When working on this project:

### UI/UX

- Match color palette: Navy (#0c0f1a), Cyan (#0ea5e9), White
- Use TailwindCSS utility classes (avoid custom CSS)
- Mobile-first responsive design (touch targets ≥44px)
- Dark theme optimized for low-light environments
- Error states with clear recovery actions
- Sticky navigation with contextual links
- Breadcrumb navigation for deep pages

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
- Use session cookies with CSRF protection (not JWT)
- Enforce MFA for admin accounts
- Log security events for monitoring

### Testing

- Write tests for new API endpoints
- Test error conditions and edge cases
- Use mocks for database/external dependencies
- Validate accessibility with `npm run test:a11y`
- Maintain >80% coverage on critical paths

## Admin Credentials (Development)

**Username**: admin
**Password**: LOCAL_ADMIN_PASSWORD
**Access**: http://localhost:8788/admin

⚠️ **Production**: Change credentials immediately on first deployment.

## Known Issues & Future Work

### High Priority

- [ ] Integrate email service (SendGrid/Mailgun) for subscription verification
- [ ] Implement session timeout warning UI (15 min before expiry)
- [ ] Add rate limiting to public APIs

### Medium Priority

- [ ] Refactor BandsTab.jsx with useReducer (currently 800+ lines)
- [ ] Structured logger utility (replace console.error)
- [ ] Enhanced analytics dashboard

### Low Priority

- [ ] Session management UI (view/revoke active sessions)
- [ ] Bulk venue operations
- [ ] Advanced search/filtering on admin pages

### Completed (Q1 2026)

- [x] Add 2FA for admin accounts (TOTP-based MFA)
- [x] Trusted devices feature (30-day remember)
- [x] Backup codes for account recovery
- [x] Navigation improvements (breadcrumbs, sticky header)
- [x] SPA routing fix for Cloudflare Pages

## Agent Utilization Strategy

**Priority**: Always leverage specialized agents for complex, multi-step operations to maximize efficiency and quality.

### Primary Agents for This Project

#### 1. **frontend-developer** (UI Implementation)
**Use For**:
- React component development (admin panels, event wizards, band profiles)
- TailwindCSS styling and responsive design
- Client-side routing and navigation patterns
- Form validation and error handling
- Frontend performance optimization

**Triggers**:
- Sprint 2.0-2.3 UI/UX redesign and implementation
- Component library creation
- Admin interface development
- Public timeline and band profile pages

**Example**: "Use frontend-developer agent to implement Sprint 2.0 design system with TailwindCSS"

#### 2. **deep-research-agent** (Investigation & Analysis)
**Use For**:
- Framework/library documentation research (React Router v7, Cloudflare D1 APIs)
- Best practices investigation (accessibility, performance patterns)
- Security vulnerability research (OWASP, Cloudflare security)
- Architecture pattern analysis (RBAC, session management)

**Triggers**:
- New feature planning requiring external research
- Security audit preparation
- Performance optimization investigation
- Technology upgrade decisions

**Example**: "Use deep-research-agent to investigate React 19 migration path and breaking changes"

#### 3. **refactoring-expert** (Code Quality)
**Use For**:
- BandsTab.jsx complexity reduction (currently 800+ lines)
- Component extraction and modularization
- Technical debt reduction
- Code smell elimination

**Triggers**:
- Code review findings
- Before major feature additions
- Performance bottleneck remediation

**Example**: "Use refactoring-expert to refactor BandsTab.jsx using useReducer pattern"

#### 4. **accessibility-specialist** (WCAG Compliance)
**Use For**:
- WCAG 2.1 AA compliance validation
- Keyboard navigation implementation
- ARIA attribute optimization
- Screen reader compatibility

**Triggers**:
- Sprint 2.0 component library creation
- Before demo (Sprint 3.3)
- Accessibility audit (Sprint 3.1)

**Example**: "Use accessibility-specialist to audit EventWizard.jsx for keyboard navigation"

#### 5. **debugger** (Error Investigation)
**Use For**:
- Test failure investigation
- Runtime error debugging
- Performance regression analysis
- Build failure troubleshooting

**Triggers**:
- Test failures in CI/CD
- Production bugs reported
- Unexpected behavior in admin panel

**Example**: "Use debugger agent to investigate why subscription analytics tests are failing"

### Agent Workflow Patterns

#### Pattern 1: Feature Development
```
1. deep-research-agent → Research best practices and patterns
2. frontend-developer → Implement UI components
3. accessibility-specialist → Validate WCAG compliance
4. debugger → Fix any test failures
5. code-reviewer → Final quality check
```

#### Pattern 2: Refactoring
```
1. refactoring-expert → Analyze code and propose improvements
2. code-reviewer → Review proposed changes
3. debugger → Verify tests still pass
```

#### Pattern 3: UI/UX Redesign (Sprint 2.0)
```
1. deep-research-agent → Research design system patterns
2. ui-ux-designer → Create design specifications
3. frontend-developer → Implement component library
4. accessibility-specialist → Validate accessibility
5. code-reviewer → Review implementation quality
```

### Agent Selection Guidelines

**✅ DO Use Agents For**:
- Multi-step operations (>3 steps)
- Specialized domain knowledge (UI/UX, accessibility, security)
- Complex debugging requiring systematic investigation
- Research requiring multiple information sources
- Code quality improvements across multiple files

**❌ DON'T Use Agents For**:
- Simple single-file edits
- Quick bug fixes (<5 lines of code)
- Basic documentation updates
- Straightforward configuration changes

### Sprint-Specific Agent Recommendations

**Sprint 1.1-1.3** (RBAC, Event Management, Band Profiles):
- `refactoring-expert` for auth middleware optimization
- `debugger` for RBAC permission test failures
- `code-reviewer` for security validation

**Sprint 2.0** (UI/UX Redesign):
- `ui-ux-designer` for design system creation
- `frontend-developer` for component library implementation
- `accessibility-specialist` for WCAG compliance
- `deep-research-agent` for modern CSS patterns

**Sprint 2.1-2.3** (Timeline, Profiles, Polish):
- `frontend-developer` for feature implementation
- `accessibility-specialist` for mobile navigation
- `performance-engineer` for bundle optimization
- `code-reviewer` for quality gates

**Sprint 3.1** (Testing & Bug Fixes):
- `debugger` for systematic bug investigation
- `accessibility-specialist` for WCAG audit
- `performance-engineer` for load time optimization
- `error-detective` for production error analysis

## Claude Priorities

1. **Agent-First Approach**: Delegate complex tasks to specialized agents
2. **Evidence-Based**: All performance claims must be measurable
3. **Security First**: Never compromise on SQL injection, XSS, or auth
4. **User Privacy**: No analytics, no trackers, minimal data collection
5. **Accessibility**: WCAG 2.1 AA compliance, keyboard navigation
6. **Documentation**: Update this file when architecture changes
7. **Testing**: Write tests for new features and bug fixes
8. **Performance**: Measure before optimizing, use profiling tools
9. **Simplicity**: Prefer boring solutions over clever ones

## Resources

- **Architecture Docs**: `docs/` directory
- **Database Entries**: `database/DATABASE_ENTRIES.md`
- **Test Credentials**: See `.dev.vars.test-users` (local dev only)
- **Cloudflare D1**: https://developers.cloudflare.com/d1/
- **Vitest**: https://vitest.dev/
- **React Testing Library**: https://testing-library.com/react

---

**Last Updated**: January 31, 2026
**Version**: 2.1 (MFA & Navigation Updates)
**Status**: Production - All core features complete, February 2026 event scheduled
**Roadmap**: Production operations and maintenance
