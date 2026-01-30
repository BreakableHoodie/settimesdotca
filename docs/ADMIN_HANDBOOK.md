# SetTimes Admin Handbook
**For System Administrators**

---

## Table of Contents

1. [Introduction](#introduction)
2. [System Architecture](#system-architecture)
3. [User Management](#user-management)
4. [Database Administration](#database-administration)
5. [Security & Access Control](#security--access-control)
6. [Monitoring & Logs](#monitoring--logs)
7. [Backup & Recovery](#backup--recovery)
8. [Performance Optimization](#performance-optimization)
9. [Troubleshooting](#troubleshooting)
10. [Maintenance Tasks](#maintenance-tasks)

---

## Introduction

This handbook is for system administrators managing the SetTimes platform. It covers:

- System architecture and components
- User and role management
- Database administration
- Security best practices
- Monitoring and maintenance

**Prerequisites:**
- Access to Cloudflare dashboard
- Database admin credentials
- Understanding of Cloudflare Workers/Pages
- Basic SQL knowledge

---

## System Architecture

### Technology Stack

**Frontend:**
- React 18 with Vite 5
- React Router v7
- Tailwind CSS 3
- Font Awesome icons
- Cloudflare Pages (hosting)

**Backend:**
- Cloudflare Workers (API layer)
- Cloudflare Pages Functions
- D1 (SQLite) database
- R2 (Object storage for photos - optional)

**Security:**
- Session-based authentication
- HTTPOnly cookies
- CSRF protection (double-submit pattern)
- Role-based access control (RBAC)

### Architecture Diagram

```
┌─────────────────────────────────────┐
│   Users (Browsers/Mobile)           │
└──────────────┬──────────────────────┘
               │
               │ HTTPS
               ▼
┌──────────────────────────────────────┐
│   Cloudflare CDN + WAF               │
└──────────────┬───────────────────────┘
               │
      ┌────────┴────────┐
      │                 │
      ▼                 ▼
┌──────────┐     ┌──────────────┐
│ Pages    │     │ Functions    │
│ (Static) │     │ (API Routes) │
└──────────┘     └──────┬───────┘
                        │
                        ▼
                 ┌──────────────┐
                 │  D1 Database │
                 └──────────────┘
```

### Component Responsibilities

**Cloudflare Pages** (`frontend/`):
- Serves static React application
- Handles routing (SPA)
- PWA service worker
- Cached assets

**Cloudflare Functions** (`functions/api/`):
- REST API endpoints
- Authentication & authorization
- Business logic
- Database queries

**D1 Database**:
- User accounts & sessions
- Events, venues, bands
- Performance schedules
- Audit logs

---

## User Management

### Creating User Accounts

**Via Invite Codes:**
1. Log in to admin panel
2. Go to Users tab
3. Click "Generate Invite Code"
4. Share code with new user
5. User signs up with code

**Direct Creation (Admin Only):**
```javascript
// Via admin API
POST /api/admin/users
{
  "email": "user@example.com",
  "name": "New User",
  "role": "editor",
  "password": "temporary123"
}
```

### Role Hierarchy

| Role | Level | Permissions |
|------|-------|-------------|
| **Admin** | 3 | Full system access, user management |
| **Editor** | 2 | Create/edit events, venues, bands |
| **Viewer** | 1 | Read-only access |

**Permission Model:**
- `checkPermission(request, env, requiredRole)`
- User role level must be ≥ required level
- Example: Admin (3) ≥ Editor (2) = Access granted

### Managing User Roles

**Promoting/Demoting Users:**
1. Users tab → Select user
2. Click "Edit"
3. Change role dropdown
4. Save changes

**Security Note:** Only admins can change roles.

### Disabling User Accounts

**Temporarily Disable:**
1. Users tab → Select user
2. Click "Toggle Status"
3. User cannot log in (session terminated)

**Permanently Delete:**
1. Users tab → Select user
2. Click "Delete" (requires confirmation)
3. User data removed (irreversible)

**Note:** Cannot delete users with active sessions unless force-logout is enabled.

### Password Management

**Reset User Password:**
1. Users tab → Select user
2. Click "Reset Password"
3. System generates temporary password
4. Send to user via secure channel
5. User must change on first login

**Password Requirements:**
- Minimum 8 characters
- Must include: uppercase, lowercase, number
- Hashed using bcrypt (cost factor: 10)

---

## Database Administration

### D1 Database Structure

**Tables:**
- `users` - User accounts
- `sessions` - Active user sessions
- `events` - Event definitions
- `venues` - Performance venues
- `bands` - Band profiles
- `audit_logs` - Security audit trail
- `invite_codes` - User invite system

**Schema Location:** `migrations/schema.sql`

### Accessing the Database

**Via Wrangler CLI:**
```bash
# List databases
wrangler d1 list

# Execute query
wrangler d1 execute settimes-db --command="SELECT * FROM users LIMIT 10"

# Run migration
wrangler d1 execute settimes-db --file=./migrations/001_initial_schema.sql
```

**Via Cloudflare Dashboard:**
1. Workers & Pages → D1
2. Select database: `settimes-db`
3. Console tab → Run queries

### Common Database Queries

**Check User Sessions:**
```sql
SELECT u.email, s.created_at, s.last_activity_at, s.ip_address
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE s.expires_at > datetime('now')
ORDER BY s.last_activity_at DESC;
```

**Event Statistics:**
```sql
SELECT
  e.name,
  e.date,
  COUNT(DISTINCT b.id) as band_count,
  COUNT(DISTINCT v.id) as venue_count
FROM events e
LEFT JOIN bands b ON e.id = b.event_id
LEFT JOIN venues v ON b.venue_id = v.id
GROUP BY e.id
ORDER BY e.date DESC;
```

**Audit Log Review:**
```sql
SELECT
  al.action,
  u.email,
  al.details,
  al.ip_address,
  al.created_at
FROM audit_logs al
JOIN users u ON al.user_id = u.id
WHERE al.created_at > datetime('now', '-7 days')
ORDER BY al.created_at DESC
LIMIT 100;
```

### Database Backups

**Automated Backups:**
- Cloudflare D1 automatically backs up databases
- Point-in-time recovery available (contact Cloudflare support)

**Manual Backup:**
```bash
# Export entire database
wrangler d1 export settimes-db --output=backup-$(date +%Y%m%d).sql
```

**Restore from Backup:**
```bash
# Restore database
wrangler d1 execute settimes-db --file=backup-20251119.sql
```

**Backup Schedule:**
- Daily automated backups (Cloudflare)
- Weekly manual export (recommended)
- Store backups securely off-platform

---

## Security & Access Control

### Authentication Flow

1. User submits email + password to `/api/admin/auth/login`
2. Backend verifies credentials (bcrypt)
3. Session created in `sessions` table
4. Session token returned in HTTPOnly cookie
5. All subsequent requests include cookie
6. Middleware validates session + checks RBAC

### Session Management

**Session Configuration:**
- Expiry: 24 hours (configurable)
- HTTPOnly: Yes (prevents XSS theft)
- Secure: Yes (HTTPS only)
- SameSite: Strict (CSRF protection)

**Session Cleanup:**
```sql
-- Remove expired sessions (run daily)
DELETE FROM sessions WHERE expires_at < datetime('now');
```

**Force Logout User:**
```sql
-- Terminate all sessions for a user
DELETE FROM sessions WHERE user_id = <user_id>;
```

### CSRF Protection

**Implementation:** Double-submit cookie pattern

**How it works:**
1. Server generates CSRF token
2. Token sent as cookie (readable by JS)
3. Client includes token in `X-CSRF-Token` header
4. Server verifies cookie matches header

**Location:** `functions/utils/csrf.js`

**Bypass (for testing only):**
```javascript
// Set in request header
X-CSRF-Token: <token_from_cookie>
```

### Audit Logging

**What's Logged:**
- User logins/logouts
- Event creation/modification/deletion
- Venue/band changes
- Role changes
- Failed login attempts

**Audit Log Retention:**
- Keep for 90 days minimum
- Archive older logs to R2/S3

**Review Logs Regularly:**
```sql
-- Failed logins (potential attacks)
SELECT * FROM audit_logs
WHERE action LIKE '%login%failed%'
AND created_at > datetime('now', '-1 day');

-- Admin actions
SELECT * FROM audit_logs al
JOIN users u ON al.user_id = u.id
WHERE u.role = 'admin'
ORDER BY al.created_at DESC
LIMIT 50;
```

### Security Best Practices

**Regular Tasks:**
- [ ] Review audit logs weekly
- [ ] Monitor failed login attempts
- [ ] Update dependencies monthly
- [ ] Rotate admin passwords quarterly
- [ ] Review user access permissions

**Access Control:**
- Principle of least privilege (grant minimum required role)
- Regular access reviews (quarterly)
- Remove inactive users (>90 days)
- Use strong passwords (enforce policy)

---

## Monitoring & Logs

### Cloudflare Analytics

**Access:**
1. Cloudflare Dashboard
2. Pages → settimes project
3. Analytics tab

**Key Metrics:**
- Page views
- Unique visitors
- Request rate
- Error rate (4xx, 5xx)
- Bandwidth usage

### Application Logs

**View Logs:**
```bash
# Real-time logs
wrangler tail

# Filter by status code
wrangler tail --status error
```

**Log Locations:**
- **API Logs**: Cloudflare Workers logs (via `wrangler tail`)
- **Audit Logs**: D1 `audit_logs` table
- **Error Logs**: Console errors (browser dev tools)

### Performance Monitoring

**Core Web Vitals:**
- LCP (Largest Contentful Paint): < 2.5s
- FID (First Input Delay): < 100ms
- CLS (Cumulative Layout Shift): < 0.1

**Check Performance:**
1. Use Lighthouse in Chrome DevTools
2. Run: `npm run lighthouse` in frontend/
3. Review PageSpeed Insights: `npm run psi`

### Alerting

**Set Up Alerts:**
1. Cloudflare Dashboard → Notifications
2. Configure alerts for:
   - High error rate (>5%)
   - Traffic spikes (unusual patterns)
   - DDoS attacks
   - SSL certificate expiration

---

## Backup & Recovery

### Database Backups

**Backup Strategy:**
- **Frequency**: Daily automated, weekly manual
- **Retention**: 30 days rolling
- **Storage**: Off-platform (S3/R2)

**Backup Command:**
```bash
# Create backup
wrangler d1 export settimes-db --output=backups/settimes-$(date +%Y%m%d-%H%M%S).sql

# Compress backup
gzip backups/settimes-*.sql
```

**Restore Database:**
```bash
# Restore from backup
gunzip backups/settimes-20251119.sql.gz
wrangler d1 execute settimes-db --file=backups/settimes-20251119.sql
```

### Disaster Recovery Plan

**Scenario: Database Corruption**
1. Stop all write operations
2. Assess damage (check audit logs)
3. Restore from latest backup
4. Verify data integrity
5. Resume operations
6. Document incident

**Scenario: Cloudflare Outage**
1. Check Cloudflare status page
2. Communicate to users (status page)
3. Wait for resolution (no action needed)
4. Verify functionality after recovery

**RTO/RPO:**
- Recovery Time Objective (RTO): 4 hours
- Recovery Point Objective (RPO): 24 hours

---

## Performance Optimization

### Frontend Optimization

**Build Optimization:**
- Vite code splitting
- Tree shaking enabled
- Asset compression (gzip/brotli)
- Image lazy loading
- React.memo for pure components

**Cache Strategy:**
```
/assets/*         → 1 year (immutable)
/*.html           → no-cache
/api/*            → no-store
Service Worker    → no-cache
```

### API Optimization

**Query Optimization:**
- Use indexes on foreign keys
- Avoid N+1 queries
- Limit results (`LIMIT` clause)
- Cache frequently accessed data

**Rate Limiting:**
- Implement Cloudflare Rate Limiting
- Login endpoint: 5 requests/minute/IP
- API endpoints: 100 requests/minute/IP

### Database Optimization

**Indexes:**
```sql
-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_bands_event_id ON bands(event_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
```

**Cleanup Old Data:**
```sql
-- Remove old sessions
DELETE FROM sessions WHERE expires_at < datetime('now', '-7 days');

-- Archive old audit logs
INSERT INTO audit_logs_archive SELECT * FROM audit_logs
WHERE created_at < datetime('now', '-90 days');

DELETE FROM audit_logs WHERE created_at < datetime('now', '-90 days');
```

---

## Troubleshooting

### Common Issues

**Issue: Users can't log in**

**Diagnosis:**
```sql
-- Check if user exists
SELECT * FROM users WHERE email = 'user@example.com';

-- Check if account is active
SELECT is_active FROM users WHERE email = 'user@example.com';

-- Check failed login attempts
SELECT * FROM audit_logs
WHERE action LIKE '%login%'
AND details LIKE '%user@example.com%'
ORDER BY created_at DESC LIMIT 10;
```

**Solutions:**
- Verify user exists and is active
- Reset password if forgotten
- Check for account lockout (not implemented yet)

---

**Issue: Events not appearing on public timeline**

**Diagnosis:**
```sql
-- Check event status
SELECT name, date, status, is_published FROM events WHERE id = <event_id>;

-- Check if bands assigned
SELECT COUNT(*) FROM bands WHERE event_id = <event_id>;
```

**Solutions:**
- Ensure `is_published = 1`
- Ensure `status != 'archived'`
- Verify bands are assigned to event
- Clear Cloudflare cache

---

**Issue: Slow API responses**

**Diagnosis:**
```bash
# Check API logs
wrangler tail --status slow

# Check query performance
wrangler d1 execute settimes-db --command="EXPLAIN QUERY PLAN <your_query>"
```

**Solutions:**
- Add missing indexes
- Optimize slow queries
- Implement caching
- Upgrade D1 plan if needed

---

### Debug Mode

**Enable Debug Logging:**
```javascript
// In functions/api/_middleware.js
console.log('[DEBUG]', { user, action, details });
```

**View Debug Logs:**
```bash
wrangler tail --format=pretty
```

---

## Maintenance Tasks

### Daily

- [ ] Review error logs
- [ ] Monitor API response times
- [ ] Check failed login attempts

### Weekly

- [ ] Review audit logs
- [ ] Export database backup
- [ ] Check disk usage (D1 limits)
- [ ] Review user access

### Monthly

- [ ] Update npm dependencies
- [ ] Security audit (run `npm audit`)
- [ ] Review and optimize slow queries
- [ ] Clean up expired sessions
- [ ] Test disaster recovery plan

### Quarterly

- [ ] Rotate admin passwords
- [ ] Review user roles and permissions
- [ ] Archive old audit logs
- [ ] Performance audit (Lighthouse)
- [ ] Update documentation

---

## Emergency Contacts

**Cloudflare Support:**
- Dashboard: cloudflare.com/support
- Enterprise: 24/7 phone support
- Community: community.cloudflare.com

**Development Team:**
- GitHub: github.com/BreakableHoodie/settimesdotca
- Issues: Create issue on GitHub

---

## Appendix

### Useful Commands

```bash
# Deploy to production
cd frontend && npm run deploy:prod

# Deploy to development
cd frontend && npm run deploy:dev

# Run migrations
wrangler d1 migrations apply settimes-db

# Check database size
wrangler d1 info settimes-db

# List all users
wrangler d1 execute settimes-db --command="SELECT email, role FROM users"

# Force logout all users
wrangler d1 execute settimes-db --command="DELETE FROM sessions"
```

### Environment Variables

**Required in wrangler.toml:**
```toml
[env.production.vars]
DATABASE_ID = "settimes-production-db"
ENVIRONMENT = "production"

[env.development.vars]
DATABASE_ID = "settimes-dev-db"
ENVIRONMENT = "development"
```

---

**Version**: 1.0
**Last Updated**: November 2025
**For**: SetTimes.ca Platform

---

**Questions?** Refer to the other guides or contact the development team.
