# CLAUDE.md — Long Weekend Band Crawl

## Project Summary

A mobile-first web application for the Long Weekend Band Crawl music festival. Provides public event schedules, band profiles with stats, and a full-featured admin panel for event management.

**Current Status**: Sprint 1.3 complete - RBAC ✅, Band Performance History ✅ (88 passing tests, 100% pass rate). Sprint 1.2 Event Management ready to start. Targeting Nov 30, 2025 demo with comprehensive UI/UX redesign.

**Active Roadmap**: See sprint spec files in `docs/specs/` for detailed sprint planning and completion tracking.

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
- **Dev URL:** https://dev.settimes.pages.dev
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
cd settimes
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
   - Default admin user: `admin@pinklemonaderecords.com` / `admin123`
   - Full audit logging, RBAC, 2FA infrastructure, metrics

3. **UI/UX Redesign Planning**
   - Sprint 2.0 added to roadmap (1.5 days)
   - Design system foundation prioritized before implementation
   - Comprehensive component library planned (10+ base components)
   - Accessibility built-in (WCAG 2.1 AA compliance)
   - See `ROADMAP_TO_DEMO.md` for full scope

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
- **Test Credentials**: `docs/TEST_ADMIN_CREDENTIALS.md`
- **Database Entries**: `database/DATABASE_ENTRIES.md`
- **Cloudflare D1**: https://developers.cloudflare.com/d1/
- **Vitest**: https://vitest.dev/
- **React Testing Library**: https://testing-library.com/react

---

**Last Updated**: November 18, 2025
**Version**: 2.0 (Performers/Performances Architecture)
**Status**: Sprint 1.3 complete - RBAC ✅, Band Performance History ✅ (88 passing tests, 100% pass rate), targeting Nov 30 demo
**Roadmap**: See sprint spec files in `docs/specs/` for detailed sprint planning and completion tracking
