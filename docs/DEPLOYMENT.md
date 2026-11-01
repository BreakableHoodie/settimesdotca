# SetTimes Production Deployment Guide

SetTimes runs on Cloudflare Pages, Pages Functions, D1, and R2. The supported release path is a merge to `main` after CI passes.

## Targets

- `main` deploys production at `https://settimes.ca`.
- Other branches do not deploy from this repository.
- `.github/workflows/edge-e2e.yml` creates the dedicated preview used for edge authentication tests.

There is no supported `dev` branch or `dev.settimes.ca` environment. Do not configure production data or secrets for a branch preview.

## Prerequisites

- Node.js 22.12+ (or a version allowed by `package.json`)
- Cloudflare access to the Pages project and D1 database
- GitHub access to merge to `main`
- Wrangler, installed through the frontend dependencies

Install locally with:

```bash
npm ci
npm --prefix frontend ci
```

## Cloudflare Configuration

The top-level D1 binding in `wrangler.toml` is:

```toml
[[d1_databases]]
binding = "DB"
database_name = "settimes-production-db"
```

The production Pages project also binds the R2 bucket as `BAND_PHOTOS` and the Analytics Engine dataset as `ANALYTICS`.

### Production runtime variables

Set production runtime values in Cloudflare Pages **Settings -> Environment Variables**. Secrets must be entered as secrets, not committed to the repository:

```text
ENVIRONMENT=production
PUBLIC_URL=https://settimes.ca
PUBLIC_DATA_PUBLISH_ENABLED=true
CSRF_SECRET=<secret>
MFA_TOTP_ENCRYPTION_KEY=<secret; never rotate after encrypted TOTP data exists>
CRON_SECRET=<secret>
EMAIL_PROVIDER=postmark|mailchannels|resend
EMAIL_FROM=<sender address>
POSTMARK_API_TOKEN=<secret when using Postmark>
RESEND_API_KEY=<secret when using Resend>
CSP_ENFORCE=true
CORS_ALLOWED_ORIGINS=<optional comma-separated extra origins>
```

`ADMIN_EMAIL` is an optional fallback sender. `CF_ACCOUNT_ID` and `CF_PAGES_API_TOKEN` are GitHub Actions secrets, not application runtime variables. Do not add `DATABASE_ID` or `SESSION_SECRET`; the application reads neither.

The `[env.preview.vars]` block in `wrangler.toml` is reserved for the edge-E2E preview. A Wrangler deploy can replace dashboard plain-text variables, so production values that must survive deploys belong in the dashboard as secrets.

## Database Setup

The numbered files in `migrations/` are the authoritative schema. `database/setup-complete.sql` is the generated local bootstrap reference, not a production seed dump.

Production CI applies and verifies migrations before the Pages deploy:

```bash
wrangler d1 migrations apply settimes-production-db --remote
node scripts/verify-remote-d1-schema.mjs
```

The checked-in workflow performs those steps automatically. Do not apply old `database/schema.sql`, `database/migration-*.sql`, or a nonexistent `database/seed-production.sql`.

For local setup, use the repository's bootstrap script or the documented local D1 workflow:

```bash
npm run migrate:local
./scripts/setup-local-db.sh
```

Create accounts through invite codes. Do not insert password hashes manually. Passwords use PBKDF2-SHA256 through Web Crypto.

## Release Flow

1. Make the change on a branch.
2. Run `make gate`.
3. Open a pull request and wait for every check to pass.
4. Merge the pull request to `main`.
5. CI runs tests, builds the frontend, applies D1 migrations, verifies the schema, deploys Pages, and runs smoke checks.

The Pages deployment command used by CI is equivalent to:

```bash
./frontend/node_modules/.bin/wrangler pages deploy frontend/dist --project-name settimesdotca --branch main
```

Do not bypass the migration and verification stages with a manual production deploy.

## Post-Deploy Checks

The production smoke job verifies:

- `/` returns the public HTML shell
- `/admin` returns the admin shell
- `/api/events/timeline` returns valid JSON
- `/api/schedule?event=current` returns the expected 200, 404, or 503 state
- `scripts/smoke-probes.mjs` can read the iCal feed, sitemap, and SSR identity metadata

Useful read-only checks:

```bash
curl --fail https://settimes.ca
curl --fail https://settimes.ca/api/events/timeline
curl --fail https://settimes.ca/sitemap.xml
```

Do not use a smoke check to mutate production data.

## Rollback and Recovery

### Pages rollback

Use the Cloudflare Pages deployment history to roll back a bad asset release, or list and roll back with Wrangler:

```bash
wrangler pages deployment list --project-name settimesdotca
wrangler pages deployment rollback <deployment-id> --project-name settimesdotca
```

### D1 recovery

An exported SQL file is a backup artifact, not a safe restore procedure over live data. Use D1 Time Travel for production recovery:

```bash
wrangler d1 time-travel info settimes-production-db
wrangler d1 time-travel restore settimes-production-db --timestamp=<ISO-8601-timestamp>
```

See Cloudflare's D1 Time Travel documentation for the retention window available on your plan. Confirm the target and recovery point before restoring.

## Scheduled Maintenance

Cloudflare Pages does not provide native cron triggers for this project. `.github/workflows/scheduled-jobs.yml` calls `/api/internal/run-scheduled` daily with `CRON_SECRET`. The job runs popularity aggregation, retention cleanup, share-link expiry, schedule-build anonymisation, and announcement digest delivery.

The admin cleanup endpoint runs the same retention cleanup for expired sessions, MFA challenges, reset tokens, trusted devices, login attempts, unconfirmed consent rows, and short-lived API-key request audit rows. Retention is automatic: ordinary audit rows are kept for one year and `api_key.request` rows for 90 days.

Use `lucia_sessions` and Unix-epoch comparisons for session inspection:

```sql
SELECT COUNT(*)
FROM lucia_sessions
WHERE expires_at > unixepoch();
```

## Troubleshooting

### Missing D1 binding

The binding is `DB`, not `DATABASE`. Confirm the top-level `d1_databases` block in `wrangler.toml` and redeploy through CI.

### Missing table

Confirm that CI applied the numbered migrations and that the live database is `settimes-production-db`. Use the schema verification step rather than replaying an old SQL file.

### Function errors

Inspect the Pages deployment logs and confirm the production secrets above are present. `CSRF_SECRET`, `MFA_TOTP_ENCRYPTION_KEY`, and `CRON_SECRET` fail closed when required values are missing.

## Related Docs

- [D1 Setup](D1_SETUP.md)
- [Admin Handbook](ADMIN_HANDBOOK.md)
- [API Documentation](API_DOCUMENTATION.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Security](SECURITY.md)

**Last updated:** 2026-10-14
