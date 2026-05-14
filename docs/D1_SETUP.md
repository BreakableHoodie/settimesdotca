# D1 Setup and Local Database Workflow

This guide documents the current database workflow for SetTimes.

Use this document for:

- local development bootstrap
- local schema migration and validation
- remote D1 creation and wiring
- release-time migration and schema verification

The current app uses a single top-level `DB` binding in `wrangler.toml`. Do not follow older docs that refer to a `DATABASE` binding or shared admin-password environment variables.

## Prerequisites

- Node.js 20+
- npm
- `sqlite3` CLI for local bootstrap scripts
- Cloudflare account and `wrangler` access only when working with remote D1 databases

Install dependencies first:

```bash
./setup.sh
```

## Local Development Database

### Recommended two-terminal flow

1. Copy the runtime example:

```bash
cp .env.example .dev.vars
```

1. Build the frontend bundle that Pages serves locally:

```bash
npm --prefix frontend run build
```

1. Start Wrangler in one terminal:

```bash
./frontend/node_modules/.bin/wrangler pages dev frontend/dist --port 8788 --persist-to .wrangler/state
```

1. In a second terminal, initialize the local database:

```bash
./scripts/setup-local-db.sh
```

What `./scripts/setup-local-db.sh` does:

- finds the active local SQLite file under `.wrangler/state/v3/d1/miniflare-D1DatabaseObject`
- loads `database/setup-complete.sql`
- refreshes the seeded local user passwords
- prints the generated credentials for the built-in local accounts

Seeded local users:

- `admin@settimes.ca`
- `editor@settimes.ca`
- `viewer@settimes.ca`

### One-command helper

If you want to build, start Wrangler, and initialize the database in one step:

```bash
./init-dev-db.sh
```

### Local runtime variables

Local Wrangler reads `.dev.vars`. Start from `.env.example`.

Most local workflows only need:

```env
ENVIRONMENT=development
PUBLIC_URL=http://localhost:8788
PUBLIC_DATA_PUBLISH_ENABLED=false
```

Notes:

- public discovery endpoints stay disabled until `PUBLIC_DATA_PUBLISH_ENABLED=true`
- local development can use the built-in CSRF fallback secret
- production must set `CSRF_SECRET`
- set `MFA_TOTP_ENCRYPTION_KEY` in `.dev.vars` before enabling or verifying TOTP MFA locally
- production must set `MFA_TOTP_ENCRYPTION_KEY` before enabling or verifying TOTP MFA
- email settings are only required if you are testing activation, reset, or subscription delivery flows

## Local Schema Changes

When you add or modify a migration:

```bash
npm run migrate:local
npm run validate:schema
```

`npm run migrate:local` applies the numbered SQL files in `migrations/` to every local SQLite file under `.wrangler/state/...` so Wrangler and local CLI workflows stay consistent.

After applying migrations, restart Wrangler.

## Remote D1 Databases

### Create a database

Create the production database:

```bash
./frontend/node_modules/.bin/wrangler d1 create settimes-production-db
```

Optional development database:

```bash
./frontend/node_modules/.bin/wrangler d1 create settimes-development-db
```

Update the `[[d1_databases]]` block in `wrangler.toml` with the correct `database_name` and `database_id` for the project you are operating.

### Cloudflare Pages binding

In the Cloudflare Pages project:

1. Open Settings -> Functions
2. Add or confirm the D1 binding
3. Use binding name `DB`

If you use R2 band-photo uploads, also add the `BAND_PHOTOS` binding in the same area.

### Runtime environment variables

Set runtime variables in Cloudflare Pages -> Settings -> Environment Variables.

Key values:

- `ENVIRONMENT=production` or `development`
- `PUBLIC_URL=https://settimes.ca` or the development host
- `PUBLIC_DATA_PUBLISH_ENABLED=false` until public data is intentionally released
- `CSRF_SECRET=<strong random value>`
- `MFA_TOTP_ENCRYPTION_KEY=<strong stable random value>`
- `EMAIL_PROVIDER`, `EMAIL_FROM`, and provider secret when email delivery is enabled
- `CSP_ENFORCE=true` in production unless you are intentionally running report-only

See [.env.example](../.env.example) and [docs/DEPLOYMENT.md](DEPLOYMENT.md) for the complete runtime list.

## Remote Migrations and Release Flow

The supported release path is the GitHub Actions workflow in `.github/workflows/cloudflare-pages.yml`.

That workflow performs:

1. CI and validation
2. remote D1 migrations
3. remote schema verification via `scripts/verify-remote-d1-schema.mjs`
4. Pages deploy
5. smoke checks

Manual commands are still available when you need them:

```bash
./frontend/node_modules/.bin/wrangler d1 migrations apply settimes-production-db --remote
npm run verify:schema:remote -- settimes-production-db
```

Prefer the workflow for normal releases so database and deploy checks stay coupled.

## Troubleshooting

### No local database files exist

Start Wrangler first:

```bash
npm run pages:dev
```

Then rerun:

```bash
./scripts/setup-local-db.sh
```

### Public endpoints return 503 locally

That is expected until you enable public data for the local Pages session.

For a temporary local override, run:

```bash
npm run pages:dev:public
```

If you want the setting to persist across local runs, set:

```env
PUBLIC_DATA_PUBLISH_ENABLED=true
```

Only enable it when you intentionally want the public routes live.

### Production requests fail with CSRF errors

Confirm `CSRF_SECRET` is set in the target Pages environment. Local fallback behavior does not apply in production.

### Local schema looks inconsistent across tools

Run:

```bash
npm run migrate:local
npm run validate:schema
```

Wrangler can create multiple local SQLite files; the migration helper updates all of them.

## Related Docs

- [../README.md](../README.md)
- [DEPLOYMENT.md](DEPLOYMENT.md)
- [SESSION_MANAGEMENT.md](SESSION_MANAGEMENT.md)
- [DATABASE.md](DATABASE.md)
