# Backend Architecture

**Stack:** Cloudflare Workers + D1 (SQLite) + Pages Functions
**Pattern:** RESTful API with file-based routing and middleware
**Database:** Multi-event architecture via `events` table with slugs

## Key Design Decisions

1. **Multi-Event Support:** Events table with `slug` routing enables multiple years
2. **Security:** Rate limiting (5 attempts/10min), audit logs, password protection
3. **Data Model:** Events → Bands (CASCADE delete), Venues → Bands (RESTRICT delete)
4. **Conflict Detection:** Automatic overlap detection for same venue/time
5. **Graceful Degradation:** D1 → static JSON → embedded fallback

## API Structure

- Public: `GET /api/schedule?event={slug|current}`
- Admin: `/api/admin/*` with X-Admin-Password header
- Middleware: Global CORS → Admin auth/rate limit → Route handlers

## Critical Files

- `database/schema.sql` - Table definitions with indexes
- `functions/api/admin/_middleware.js` - Auth and rate limiting
- `functions/api/schedule.js` - Public schedule endpoint
- `wrangler.toml` - D1 bindings and environment config
