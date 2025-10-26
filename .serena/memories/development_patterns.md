# Development Patterns

## File-Based Routing (Cloudflare Pages Functions)
- `functions/api/schedule.js` → `GET /api/schedule`
- `functions/api/admin/events.js` → `/api/admin/events`
- `functions/api/admin/events/[id].js` → `/api/admin/events/{id}`

## Middleware Pattern
1. Global: `functions/_middleware.js` (CORS, error handling)
2. Admin: `functions/api/admin/_middleware.js` (auth, rate limit)
3. Route: Business logic and database queries

## Database Query Best Practices
✅ Use indexed WHERE clauses (event_id, slug, is_published)
✅ Sort by indexed columns (start_time with event_id)
❌ Avoid full table scans without WHERE
❌ Avoid LIKE with leading wildcards ('%foo%')

## Security Model
- IP-based rate limiting: 5 attempts/10min → 1hr lockout
- Audit logging: All auth attempts with IP, timestamp, success
- Password verification: X-Admin-Password header vs env.ADMIN_PASSWORD
- Manual reset: SQL DELETE from rate_limit for emergency

## Testing Strategy
- Unit: Vitest for utility functions
- Integration: Playwright for admin panel workflows
- API: Vitest + MSW for endpoint testing
- Accessibility: Vitest for a11y compliance
