# SetTimes.ca

SetTimes.ca is a Cloudflare Pages application for managing and publishing multi-venue music events. This repository contains the React frontend, Cloudflare Pages Functions API, D1 schema and migrations, admin authentication flows, and deployment automation.

## Stack

- Frontend: React 19, Vite 8, Tailwind CSS 4, React Router 7
- Backend: Cloudflare Pages Functions with `nodejs_compat`
- Data: Cloudflare D1 and optional R2 photo storage
- Auth: Direct D1 server-side session manager with HttpOnly cookies and CSRF protection
- Testing: Vitest for unit/integration coverage and Playwright for end-to-end coverage

## What The App Supports

- Invite-based admin accounts with role-based access control
- Event, venue, band profile, and performance management
- Public event discovery, timeline, details, and calendar-feed endpoints
- MFA, trusted devices, backup codes, and session self-service flows
- Email activation, password reset, and subscription workflows

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- `sqlite3` CLI for the local database bootstrap scripts
- A Cloudflare account only if you need remote D1 or Pages deployment

### 1. Install dependencies

```bash
./setup.sh
```

Manual equivalent:

```bash
npm ci
npm --prefix frontend ci
```

### 2. Create local runtime variables

Copy the runtime example to `.dev.vars` for Wrangler:

```bash
cp .env.example .dev.vars
```

Important defaults for local development:

- `ENVIRONMENT=development`
- `PUBLIC_URL=http://localhost:8788`
- `PUBLIC_DATA_PUBLISH_ENABLED=false`

If you need activation, reset, or subscription email flows locally, also configure the email section in `.dev.vars`.

### 3. Build the frontend

```bash
npm --prefix frontend run build
```

Wrangler serves `frontend/dist`, so rebuild before restarting Wrangler after frontend changes.

### 4. Start the full local Pages runtime

```bash
npm run pages:dev
```

This runs the static app and Pages Functions together at `http://localhost:8788`.

If you need public discovery routes enabled locally without editing `.dev.vars`, use:

```bash
npm run pages:dev:public
```

That adds a temporary Wrangler binding for `PUBLIC_DATA_PUBLISH_ENABLED=true` while keeping the default local runtime private.

### 5. Bootstrap the local D1 database

In a second terminal, with Wrangler still running:

```bash
./scripts/setup-local-db.sh
```

That script loads `database/setup-complete.sql`, updates the seeded local users with fresh password hashes, and prints the generated credentials for:

- `admin@settimes.ca`
- `editor@settimes.ca`
- `viewer@settimes.ca`

### 6. Sign in

Open:

- App: `http://localhost:8788`
- Admin: `http://localhost:8788/admin`

Use one of the credentials printed by `./scripts/setup-local-db.sh`.

### One-command helper

If you want the repo to build, start Wrangler, and initialize the local database in one step:

```bash
./init-dev-db.sh
```

## Daily Commands

```bash
# Local schema maintenance
npm run migrate:local
npm run validate:schema

# Tests
npm test
npm run test:coverage

# Frontend build
npm --prefix frontend run build

# Manual Pages deploys
npm run deploy:dev
npm run deploy:prod

# Remote schema verification helper
npm run verify:schema:remote -- <d1_database_name>
```

## Testing

Vitest runs from the repo root:

```bash
npm test
```

Playwright uses Wrangler by default and expects a valid admin user. For local runs, export these shell variables before starting the suite:

```bash
export E2E_ADMIN_EMAIL=admin@settimes.ca
export E2E_ADMIN_PASSWORD='<password printed by setup-local-db.sh>'
```

Then run:

```bash
npx playwright test --project=chromium
```

## Deployment Overview

Production and development releases are driven by `.github/workflows/cloudflare-pages.yml`.

The workflow gates deployment in this order:

1. CI and validation
2. Release target resolution (`main` -> production, `dev` -> development)
3. Remote D1 migrations
4. Remote schema verification
5. Pages deploy
6. Post-deploy smoke checks

Required GitHub configuration is documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The key repository secrets and variables are:

- `CF_ACCOUNT_ID`
- `CF_PAGES_API_TOKEN`
- `CF_PAGES_PROJECT_NAME`
- `CF_D1_PRODUCTION_DATABASE_NAME`
- `CF_D1_DEVELOPMENT_DATABASE_NAME` (optional when using a separate dev DB)
- `CF_PRODUCTION_SMOKE_URL`
- `CF_DEVELOPMENT_SMOKE_URL`

Public discovery endpoints remain disabled until `PUBLIC_DATA_PUBLISH_ENABLED=true` is set explicitly in the target environment.

For local Pages development, prefer `npm run pages:dev:public` when you want to inspect real public routes without changing the repo-local default in `.dev.vars`.

## Repository Layout

```text
frontend/      React application and client-side tests
functions/     Cloudflare Pages Functions routes and shared server utilities
migrations/    Ordered D1 schema migrations
database/      Local bootstrap SQL, reference data, and historical exports
scripts/       Local setup, migration, validation, and maintenance helpers
docs/          Operator, developer, API, and architecture documentation
e2e/           Playwright end-to-end coverage
```

## More Documentation

- [docs/INDEX.md](docs/INDEX.md) - documentation hub
- [docs/D1_SETUP.md](docs/D1_SETUP.md) - local and remote D1 workflow
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - release pipeline and operator setup
- [docs/SESSION_MANAGEMENT.md](docs/SESSION_MANAGEMENT.md) - current session model
- [docs/DATABASE.md](docs/DATABASE.md) - schema overview and source of truth
- [SECURITY.md](SECURITY.md) - security posture and operational guidance

## License

AGPL-3.0. See [LICENSE](LICENSE).
