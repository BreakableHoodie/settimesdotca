# SetTimes Production Deployment Guide
**Deploying to Cloudflare Pages + Functions + D1**

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Initial Setup](#initial-setup)
4. [Database Setup](#database-setup)
5. [Environment Configuration](#environment-configuration)
6. [First Deployment](#first-deployment)
7. [Custom Domain Setup](#custom-domain-setup)
8. [Post-Deployment](#post-deployment)
9. [Continuous Deployment](#continuous-deployment)
10. [Rollback & Recovery](#rollback--recovery)
11. [Monitoring & Maintenance](#monitoring--maintenance)

---

## Overview

SetTimes is deployed as a full-stack application on Cloudflare's edge network:

**Architecture:**
- **Frontend:** React SPA built with Vite, hosted on Cloudflare Pages
- **Backend API:** Cloudflare Pages Functions (serverless)
- **Database:** Cloudflare D1 (SQLite at the edge)
- **CDN:** Cloudflare CDN (automatic)
- **SSL:** Automatic HTTPS with Cloudflare

**Deployment Targets:**
- **Production:** `settimes.ca` (main branch)
- **Development:** `dev.settimes.ca` (dev branch)
- **Preview:** Automatic preview deployments for PRs

**Deployment Method:**
- **Continuous Deployment:** Automatic on git push
- **Manual Deployment:** Via `wrangler` CLI
- **Rollback:** One-click in Cloudflare Dashboard

---

## Prerequisites

### Required Accounts & Access

- [ ] **Cloudflare Account** (with Pages enabled)
- [ ] **GitHub Account** (with repo access)
- [ ] **Domain** (e.g., settimes.ca) managed by Cloudflare DNS
- [ ] **Node.js 20+** installed locally
- [ ] **Wrangler CLI** installed (`npm install -g wrangler`)

### Install Wrangler

```bash
# Install globally
npm install -g wrangler

# Verify installation
wrangler --version

# Login to Cloudflare
wrangler login
```

---

## Initial Setup

### 1. Clone Repository

```bash
git clone https://github.com/BreakableHoodie/settimesdotca.git
cd settimesdotca
```

### 2. Install Dependencies

```bash
# Install frontend dependencies
cd frontend
npm install

# Return to root
cd ..
```

### 3. Verify Local Build

```bash
cd frontend
npm run build
```

**Expected output:**
```
✓ 1234 modules transformed.
dist/index.html                  1.23 kB
dist/assets/index-abc123.js      456.78 kB
✓ built in 12.34s
```

---

## Database Setup

### 1. Create Production Database

```bash
# Create production D1 database
wrangler d1 create settimes-production-db
```

**Output:**
```
✅ Successfully created DB 'settimes-production-db'

[[d1_databases]]
binding = "DATABASE"
database_name = "settimes-production-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Important:** Copy the `database_id` - you'll need it for `wrangler.toml`.

### 2. Create Development Database (Optional)

```bash
wrangler d1 create settimes-dev-db
```

### 3. Update wrangler.toml

Edit `wrangler.toml` in project root:

```toml
name = "settimes"
compatibility_date = "2025-01-01"

# Production environment
[env.production]
name = "settimes-production"

[env.production.vars]
ENVIRONMENT = "production"

[[env.production.d1_databases]]
binding = "DATABASE"
database_name = "settimes-production-db"
database_id = "YOUR_PRODUCTION_DB_ID_HERE"  # From step 1

# Development environment
[env.development]
name = "settimes-development"

[env.development.vars]
ENVIRONMENT = "development"

[[env.development.d1_databases]]
binding = "DATABASE"
database_name = "settimes-dev-db"
database_id = "YOUR_DEV_DB_ID_HERE"  # From step 2 (optional)
```

### 4. Run Database Migrations

```bash
# Apply migrations to production
wrangler d1 migrations apply settimes-production-db --env production

# Apply migrations to development (optional)
wrangler d1 migrations apply settimes-dev-db --env development
```

**Expected output:**
```
🌀 Applying migration 001_initial_schema.sql
🌀 Applying migration 002_add_audit_logs.sql
🌀 Applying migration 003_add_sessions.sql
✅ Successfully applied 3 migration(s)
```

### 5. Create Initial Admin User

```bash
# Connect to database
wrangler d1 execute settimes-production-db --env production --command="
INSERT INTO users (email, name, password_hash, role, is_active)
VALUES (
  'admin@settimes.ca',
  'Admin User',
  '\$2a\$10\$YourBcryptHashHere',  -- Generate using bcrypt
  'admin',
  1
)"
```

**Generate password hash:**
```javascript
// Use Node.js with bcrypt
const bcrypt = require('bcrypt');
const hash = bcrypt.hashSync('your-secure-password', 10);
console.log(hash);
```

---

## Environment Configuration

### Cloudflare Pages Environment Variables

**In Cloudflare Dashboard:**

1. Go to **Pages** → **Your Project** → **Settings** → **Environment Variables**

2. Add the following variables:

**Production:**
```
DATABASE_ID = your-production-db-id
ENVIRONMENT = production
SESSION_SECRET = random-64-char-string  # Generate securely
ADMIN_EMAIL = admin@settimes.ca
```

**Preview (optional):**
```
DATABASE_ID = your-dev-db-id
ENVIRONMENT = development
SESSION_SECRET = different-random-string
```

**Generate SESSION_SECRET:**
```bash
# Generate random 64-character string
openssl rand -base64 48
```

---

## First Deployment

### Option 1: Deploy via Cloudflare Dashboard (Recommended for first deploy)

1. **Go to Cloudflare Dashboard**
   - Navigate to **Pages**
   - Click **Create a project**

2. **Connect GitHub Repository**
   - Select **Connect to Git**
   - Authorize Cloudflare
   - Select repository: `BreakableHoodie/settimesdotca`

3. **Configure Build Settings**

   ```
   Production branch: main
   Preview branches: dev, develop

   Build command: cd frontend && npm install && npm run build
   Build output directory: frontend/dist
   Root directory: / (leave blank)

   Environment variables:
   - DATABASE_ID = [your-production-db-id]
   - ENVIRONMENT = production
   - SESSION_SECRET = [your-generated-secret]
   ```

4. **Configure Functions**
   - Functions directory: `functions` (auto-detected)
   - Compatibility date: `2025-01-01`

5. **Deploy**
   - Click **Save and Deploy**
   - Wait 2-3 minutes for build
   - Note the deployment URL: `settimes-xxx.pages.dev`

### Option 2: Deploy via Wrangler CLI

```bash
# Build frontend
cd frontend
npm run build
cd ..

# Deploy to production
wrangler pages deploy frontend/dist --project-name=settimes --branch=main

# Deploy to development
wrangler pages deploy frontend/dist --project-name=settimes --branch=dev
```

---

## Custom Domain Setup

### 1. Add Custom Domain

**In Cloudflare Dashboard:**

1. Go to **Pages** → **Your Project** → **Custom domains**
2. Click **Set up a custom domain**
3. Enter: `settimes.ca`
4. Click **Continue**

### 2. Configure DNS

Cloudflare will automatically configure DNS if domain is managed by Cloudflare:

**Automatic DNS Record:**
```
Type: CNAME
Name: settimes.ca
Target: settimes-xxx.pages.dev
Proxy: Enabled (orange cloud)
```

**If using external DNS:**
```
Type: CNAME
Name: settimes.ca (or www)
Target: settimes-xxx.pages.dev
```

### 3. Add www Subdomain (Optional)

```
Type: CNAME
Name: www
Target: settimes.ca
Proxy: Enabled
```

### 4. Configure Redirects

Create/update `frontend/public/_redirects`:

```
# Redirect www to non-www
https://www.settimes.ca/* https://settimes.ca/:splat 301!

# Redirect old domain (if applicable)
https://lwbc.dredre.net/* https://settimes.ca/:splat 301!

# SPA fallback (handle all routes)
/* /index.html 200
```

### 5. Verify SSL Certificate

- SSL certificate auto-provisioned by Cloudflare
- Usually takes 5-15 minutes
- Check: `https://settimes.ca` (should show padlock)

---

## Post-Deployment

### 1. Verify Deployment

**Check Frontend:**
```bash
curl https://settimes.ca
# Should return HTML
```

**Check API:**
```bash
curl https://settimes.ca/api/schedule?event=current
# Should return JSON (may be empty initially)
```

**Check Database:**
```bash
wrangler d1 execute settimes-production-db --env production --command="SELECT COUNT(*) FROM users"
# Should return count of users
```

### 2. Test Admin Login

1. Go to `https://settimes.ca/admin`
2. Log in with admin credentials
3. Verify dashboard loads
4. Create test event

### 3. Run Smoke Tests

**Checklist:**
- [ ] Homepage loads (/)
- [ ] Admin panel loads (/admin)
- [ ] Can log in successfully
- [ ] Can create event
- [ ] Can create venue
- [ ] Can create performer
- [ ] Can publish event
- [ ] Public schedule shows event (/api/schedule)
- [ ] Band profile pages work (/bands/[event]/[band])
- [ ] Mobile responsive (test on phone)
- [ ] PWA installable (mobile)
- [ ] HTTPS works (green padlock)
- [ ] www redirects to non-www

### 4. Configure Headers

Verify `frontend/public/_headers` is deployed correctly:

```bash
curl -I https://settimes.ca
# Check for:
# - Strict-Transport-Security
# - X-Frame-Options
# - Content-Security-Policy
```

### 5. Set Up Monitoring

**Enable Cloudflare Web Analytics:**

1. Go to **Analytics** → **Web Analytics**
2. Add site: `settimes.ca`
3. Copy tracking code
4. Add to `frontend/index.html` (if not already present)

**Configure Alerts:**

1. Go to **Notifications**
2. Create alerts for:
   - High error rate (>5%)
   - Traffic spike (unusual patterns)
   - SSL certificate expiration
   - Low performance score

---

## Continuous Deployment

### Automatic Deployments

**On Push to main:**
- Triggers production deployment
- Builds and deploys to `settimes.ca`
- Takes ~2-3 minutes

**On Push to dev:**
- Triggers development deployment
- Builds and deploys to `dev.settimes.ca`
- Takes ~2-3 minutes

**On Pull Request:**
- Creates preview deployment
- Unique URL: `pr-123-settimes.pages.dev`
- Auto-deleted when PR merged/closed

### Manual Deployment

**Via Wrangler:**
```bash
cd frontend
npm run build
cd ..

wrangler pages deploy frontend/dist --project-name=settimes --branch=main
```

**Via Git:**
```bash
git push origin main
# Wait for automatic deployment
```

### Deployment Status

**Check via Dashboard:**
- Go to **Pages** → **Your Project** → **Deployments**
- View build logs, deployment history

**Check via CLI:**
```bash
wrangler pages deployment list --project-name=settimes
```

---

## Rollback & Recovery

### Rollback to Previous Deployment

**Via Dashboard:**

1. Go to **Pages** → **Your Project** → **Deployments**
2. Find previous successful deployment
3. Click **⋯** → **Rollback to this deployment**
4. Confirm rollback

**Takes effect immediately** (no rebuild required).

### Rollback via CLI

```bash
# List deployments
wrangler pages deployment list --project-name=settimes

# Rollback to specific deployment
wrangler pages deployment rollback <deployment-id> --project-name=settimes
```

### Database Recovery

**Restore from Backup:**

```bash
# Export current database (backup)
wrangler d1 export settimes-production-db --output=backup-$(date +%Y%m%d).sql

# Restore from backup
wrangler d1 execute settimes-production-db --file=backup-20251119.sql
```

**Point-in-Time Recovery:**

Contact Cloudflare support for point-in-time recovery (Enterprise feature).

---

## Monitoring & Maintenance

### Daily Checks

```bash
# Check error logs
wrangler pages deployment tail --project-name=settimes --status error

# Check database size
wrangler d1 info settimes-production-db

# Check active sessions
wrangler d1 execute settimes-production-db --command="
  SELECT COUNT(*) FROM sessions WHERE expires_at > datetime('now')
"
```

### Weekly Maintenance

```bash
# Clean up expired sessions
wrangler d1 execute settimes-production-db --command="
  DELETE FROM sessions WHERE expires_at < datetime('now', '-7 days')
"

# Export database backup
wrangler d1 export settimes-production-db --output=backups/weekly-$(date +%Y%m%d).sql

# Review audit logs
wrangler d1 execute settimes-production-db --command="
  SELECT * FROM audit_logs
  WHERE created_at > datetime('now', '-7 days')
  ORDER BY created_at DESC LIMIT 100
" > logs/audit-$(date +%Y%m%d).log
```

### Monthly Maintenance

- [ ] Update npm dependencies (`npm update`)
- [ ] Run security audit (`npm audit`)
- [ ] Review Cloudflare analytics
- [ ] Test disaster recovery plan
- [ ] Archive old audit logs (>90 days)
- [ ] Review and optimize database queries
- [ ] Check SSL certificate status
- [ ] Review rate limiting effectiveness

### Performance Monitoring

**Core Web Vitals:**

```bash
# Run Lighthouse audit
cd frontend
npm run lighthouse
```

**API Performance:**

```bash
# Check API response times
curl -w "@curl-format.txt" -o /dev/null -s https://settimes.ca/api/schedule

# curl-format.txt contents:
# time_total:  %{time_total}s
# time_namelookup:  %{time_namelookup}s
# time_connect:  %{time_connect}s
```

---

## Troubleshooting Deployment Issues

### Build Fails

**Error:** "npm install failed"

**Solution:**
- Check Node version in Cloudflare settings (set to 20+)
- Verify `package.json` and `package-lock.json` are committed
- Check build logs for specific npm errors

---

**Error:** "Build command exited with code 1"

**Solution:**
- Run build locally: `cd frontend && npm run build`
- Fix any TypeScript/lint errors
- Check for missing dependencies

---

### Database Connection Issues

**Error:** "DATABASE binding not found"

**Solution:**
- Verify `wrangler.toml` has correct `d1_databases` binding
- Ensure `DATABASE` binding name matches code
- Redeploy after fixing `wrangler.toml`

---

**Error:** "no such table: users"

**Solution:**
- Run migrations: `wrangler d1 migrations apply settimes-production-db`
- Verify migrations ran successfully
- Check migration files in `migrations/` directory

---

### Domain & SSL Issues

**Error:** "This site can't provide a secure connection"

**Solution:**
- Wait 15 minutes for SSL provisioning
- Verify DNS is correctly configured
- Check Cloudflare SSL/TLS setting (should be "Full" or "Full (strict)")

---

**Error:** "DNS_PROBE_FINISHED_NXDOMAIN"

**Solution:**
- Verify CNAME record points to `settimes-xxx.pages.dev`
- Wait for DNS propagation (up to 48 hours, usually minutes)
- Use `dig settimes.ca` to check DNS resolution

---

### Function Errors

**Error:** "500 Internal Server Error" on API endpoints

**Solution:**
- Check function logs: `wrangler pages deployment tail`
- Verify environment variables are set
- Check database connection
- Review function code for errors

---

## Security Checklist

**Before Production:**

- [ ] SESSION_SECRET is strong and unique
- [ ] Admin password is strong (12+ characters)
- [ ] HTTPS is enabled (Cloudflare SSL)
- [ ] HSTS header is set (`_headers` file)
- [ ] CSP header is configured
- [ ] CSRF protection is enabled
- [ ] Rate limiting is configured
- [ ] Audit logging is enabled
- [ ] Database backups are automated
- [ ] No secrets in git repository

---

## Additional Resources

**Documentation:**
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)

**SetTimes Docs:**
- [Admin Handbook](./ADMIN_HANDBOOK.md) - System administration
- [User Guide](./USER_GUIDE.md) - For event organizers
- [API Documentation](./API_DOCUMENTATION.md) - API reference
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues

---

**Version:** 2.0
**Last Updated:** November 2025
**For:** SetTimes Platform (settimes.ca)

---

**Ready to deploy?** Follow this guide step-by-step for a successful production deployment!
