# Contributing to SetTimes.ca

## Prerequisites

- Node.js 20+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (installed via `npm ci` in the frontend)
- A Cloudflare account with a D1 database bound for local dev (or use the local SQLite emulator)

## Local setup

```bash
# 1. Install root dependencies (backend tests, scripts)
npm ci

# 2. Install frontend dependencies (also installs wrangler)
cd frontend && npm ci && cd ..

# 3. Create local dev vars (never commit this file)
cp .dev.vars.example .dev.vars   # then fill in CSRF_SECRET, etc.

# 4. Apply migrations to the local SQLite emulator
npm run migrate:local

# 5. Start the local full-stack server (Pages Functions + Vite HMR)
cd frontend && npx wrangler pages dev --port 8788
```

The admin panel is at `http://localhost:8788/admin`. Create a first admin user with:

```bash
node scripts/seed-e2e-admin.mjs --email you@example.com --password yourpassword \
  | xargs -I{} npx wrangler d1 execute settimes-production-db --local --command="{}"
```

## Running tests

```bash
# Backend unit tests
npm test

# Frontend unit + accessibility tests
cd frontend && npm test

# Frontend linting + formatting check
cd frontend && npm run lint && npm run format:check

# All quality gates in one command
cd frontend && npm run quality
```

E2E tests run against a live local server and require the Pages dev server to be running (see `e2e-tests.yml` for the full CI setup).

## Database migrations

Migrations live in the top-level `migrations/` directory and are numbered sequentially (`0001_*.sql`, `0002_*.sql`, …). This is the authoritative location — do not add migrations to `database/`.

- **Local:** `npm run migrate:local` applies all pending migrations to `.wrangler/state`
- **Remote (CI only):** Wrangler applies migrations from `migrations/` automatically during the `migrate-and-verify-d1` CI job on push to `main`/`dev`

To add a migration, create the next numbered file in `migrations/` and run `npm run validate:schema` to verify the schema snapshot is still consistent.

## Pull requests

1. Branch from `main` (for features/fixes) or `dev` (for staged rollout).
2. Keep PRs focused — one logical change per PR makes review easier.
3. All CI checks must pass: tests, lint, format, OpenAPI validation, and build.
4. Security-sensitive files (auth, CSRF, migrations, CI workflows) require owner review per `CODEOWNERS`.
5. Write a clear PR description explaining *why*, not just what changed.

## Code style

- **Formatting:** Prettier (run `npm run format` to auto-fix)
- **Linting:** ESLint with the project config
- **Comments:** Only when the *why* is non-obvious; avoid restating what the code does
- **No `window.confirm`/`window.alert`:** Use `ConfirmDialog` / toast instead
- **Accessibility:** ARIA roles, focus management, and live regions are required for dynamic UI

## Reporting security issues

Please do **not** open a public issue for security vulnerabilities. Use GitHub's private security advisory feature or email the address listed in `SECURITY.md`.
