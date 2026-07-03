# Database Schema

**Type:** Cloudflare D1 (SQLite-compatible)

This document describes the schema produced by replaying `migrations/` in
order — which, since #506, is exactly what `database/setup-complete.sql`
contains: its schema section is **generated** by
`scripts/regenerate-setup-complete.mjs` and CI verifies the two never diverge
(`scripts/check-schema-drift.mjs` in `quality.yml`). To change the schema,
add a migration, regenerate the bootstrap, and update this document together.

## Overview

Schema is managed two ways:

- **`migrations/NNNN_*.sql`** — numbered, sequential migrations. These are
  applied to the production D1 database automatically on deploy by the
  "Apply remote D1 migrations" step in `.github/workflows/cloudflare-pages.yml`
  (`wrangler d1 migrations apply <db> --remote`). Do not apply them manually.
- **`database/setup-complete.sql`** — a full bootstrap script (every
  `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, plus three
  seeded test-account rows) used to build a fresh database in one shot for
  local dev and CI/E2E. It must stay in sync with the cumulative effect of
  `migrations/`.
- **`database/seed-test-data.sql`** — additional venues/events/band test data
  layered on top of `setup-complete.sql` for local dev and E2E.

### Local setup

Copied from the `Initialize D1 database with schema` step in
`.github/actions/e2e-env/action.yml`, which is how CI provisions D1 for E2E:

```bash
npx wrangler d1 execute settimes-production-db --local --persist-to .wrangler/state \
  --file=database/setup-complete.sql

npx wrangler d1 execute settimes-production-db --local --persist-to .wrangler/state \
  --file=database/seed-test-data.sql
```

(`settimes-production-db` is the `database_name` bound to `env.DB` — see
`wrangler.toml`.)

## Conventions & gotchas

These are project-wide invariants; see `CLAUDE.md` for the full detail behind
each one.

- **Datetime format:** stored timestamps use SQLite's `datetime('now')` format,
  `YYYY-MM-DD HH:MM:SS` (space separator) — **not** JS `toISOString()`'s
  `T`-separated format. Always normalize with `toSqliteDateTime()`
  (`functions/utils/authAttempts.js:55`) before writing a computed timestamp.
- **Exception:** `lucia_sessions.expires_at` is `INTEGER` (Unix epoch seconds),
  the only `expires_at` column that isn't `TEXT`. Compare with
  `row.expires_at * 1000 < Date.now()` in JS or `WHERE expires_at > unixepoch()`
  in SQL — never `datetime('now')`.
- **Foreign-key enforcement is guaranteed by the middleware, not assumed:**
  `functions/_middleware.js` runs `PRAGMA foreign_keys = ON` before every
  mutating request rather than relying on driver defaults (GET/HEAD are
  skipped as read-only and cannot violate a constraint). Unit tests set the
  PRAGMA unconditionally in `functions/api/test-utils.js`.
- **No transactions:** the D1 binding has no `BEGIN`/`COMMIT`. Use
  `env.DB.batch([...])` for atomic multi-statement writes (all-or-nothing), or
  compensating deletes when a batch isn't possible — e.g. the event-duplication
  handler (`functions/api/admin/events/[id]/duplicate.js`) deletes the
  just-created event row if copying its performances fails, since it can't wrap
  both inserts in one transaction.
- **Password hashing is PBKDF2-SHA256, not bcrypt** (`functions/utils/crypto.js`).
  Current hashes are stored in `users.password_hash` as
  `pbkdf2$<iterations>$<salt-b64>$<hash-b64>`. `verifyPassword()` also accepts
  a legacy `<salt-b64>:<hash-b64>` format at 100k iterations for hashes written
  before the `pbkdf2$` format existed — the three seeded test accounts at the
  bottom of `setup-complete.sql` are still in that legacy format.

## Tables by domain

### Core event data

#### `events`

One row per band-crawl event (e.g. Vol. 16, Vol. 17).

| Column               | Type    | Notes                                                                                                             |
| -------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `id`                 | INTEGER | PK, autoincrement                                                                                                 |
| `name`               | TEXT    | NOT NULL                                                                                                          |
| `date`               | TEXT    | NOT NULL, `YYYY-MM-DD`                                                                                            |
| `end_date`           | TEXT    | Nullable; added in migration 0038 for multi-day events                                                            |
| `slug`               | TEXT    | NOT NULL, UNIQUE                                                                                                  |
| `is_published`       | INTEGER | NOT NULL, DEFAULT 0 (0 = draft, 1 = published)                                                                    |
| `status`             | TEXT    | DEFAULT `'draft'` (e.g. also takes `'archived'`)                                                                  |
| `archived_at`        | TEXT    | Nullable                                                                                                          |
| `description`        | TEXT    | Nullable                                                                                                          |
| `city`               | TEXT    | Nullable                                                                                                          |
| `ticket_url`         | TEXT    | Nullable                                                                                                          |
| `venue_info`         | TEXT    | Nullable (JSON)                                                                                                   |
| `social_links`       | TEXT    | Nullable (JSON)                                                                                                   |
| `theme_colors`       | TEXT    | Nullable (JSON)                                                                                                   |
| `reveal_mode`        | INTEGER | NOT NULL, DEFAULT 0 — added in migration 0034; gates whether unannounced performances show in the public schedule |
| `created_by_user_id` | INTEGER | Nullable, no FK constraint                                                                                        |
| `updated_by_user_id` | INTEGER | Nullable, no FK constraint                                                                                        |
| `created_at`         | TEXT    | NOT NULL, DEFAULT `datetime('now')`                                                                               |
| `updated_at`         | TEXT    | DEFAULT `datetime('now')`                                                                                         |

Indexes: `idx_events_published(is_published)`, `idx_events_slug(slug)`,
`idx_events_status(status)`.

#### `venues`

Shared physical venues, reused across events.

| Column          | Type    | Notes                                                                                 |
| --------------- | ------- | ------------------------------------------------------------------------------------- |
| `id`            | INTEGER | PK, autoincrement                                                                     |
| `name`          | TEXT    | NOT NULL, UNIQUE                                                                      |
| `address`       | TEXT    | Nullable                                                                              |
| `address_line1` | TEXT    | Nullable                                                                              |
| `address_line2` | TEXT    | Nullable                                                                              |
| `city`          | TEXT    | Nullable — added in migration 0021                                                    |
| `region`        | TEXT    | Nullable                                                                              |
| `postal_code`   | TEXT    | Nullable                                                                              |
| `country`       | TEXT    | Nullable                                                                              |
| `capacity`      | INTEGER | Nullable                                                                              |
| `website`       | TEXT    | Nullable                                                                              |
| `instagram`     | TEXT    | Nullable — added in migration 0010                                                    |
| `facebook`      | TEXT    | Nullable — added in migration 0010                                                    |
| `phone`         | TEXT    | Nullable                                                                              |
| `contact_email` | TEXT    | Nullable                                                                              |
| `latitude`      | REAL    | Nullable — added in migration 0043, seeded for the 6 Vol. 17 King St N venues in 0044 |
| `longitude`     | REAL    | Nullable — same as above                                                              |
| `created_at`    | TEXT    | NOT NULL, DEFAULT `datetime('now')`                                                   |

No indexes beyond the implicit one on the `UNIQUE` `name` column.

#### `band_profiles`

The reusable band identity — separate from any single event's schedule.

| Column                | Type    | Notes                                                                            |
| --------------------- | ------- | -------------------------------------------------------------------------------- |
| `id`                  | INTEGER | PK, autoincrement                                                                |
| `name`                | TEXT    | NOT NULL — display name, preserves artistic capitalization                       |
| `name_normalized`     | TEXT    | NOT NULL, UNIQUE — lowercased/trimmed form used for duplicate detection          |
| `description`         | TEXT    | Nullable                                                                         |
| `genre`               | TEXT    | Nullable                                                                         |
| `origin`              | TEXT    | Nullable                                                                         |
| `origin_city`         | TEXT    | Nullable — added in migration 0020                                               |
| `origin_region`       | TEXT    | Nullable — added in migration 0020                                               |
| `contact_email`       | TEXT    | Nullable                                                                         |
| `is_active`           | INTEGER | NOT NULL, DEFAULT 1                                                              |
| `social_links`        | TEXT    | Nullable (JSON)                                                                  |
| `photo_url`           | TEXT    | Nullable                                                                         |
| `photo_alt_text`      | TEXT    | Nullable — added in migration 0042                                               |
| `url`                 | TEXT    | Nullable — legacy compat column                                                  |
| `band_name`           | TEXT    | Nullable — legacy compat column                                                  |
| `bio`                 | TEXT    | Nullable — legacy compat column                                                  |
| `genres`              | TEXT    | Nullable — legacy compat column                                                  |
| `hometown`            | TEXT    | Nullable — legacy compat column                                                  |
| `formed_year`         | INTEGER | Nullable                                                                         |
| `website`             | TEXT    | Nullable                                                                         |
| `total_views`         | INTEGER | DEFAULT 0 — aggregated by `functions/scheduled/aggregate-stats.js`               |
| `total_social_clicks` | INTEGER | DEFAULT 0 — same aggregation job                                                 |
| `popularity_score`    | REAL    | DEFAULT 0 — `page_views*1 + social_clicks*3` (formula updated in migration 0048) |
| `created_at`          | TEXT    | NOT NULL, DEFAULT `datetime('now')`                                              |
| `updated_at`          | TEXT    | DEFAULT `datetime('now')`                                                        |

Indexes: `idx_band_profiles_name(name)`,
`idx_band_profiles_normalized(name_normalized)` (UNIQUE),
`idx_band_profiles_genre(genre)`.

#### `performances`

Links a `band_profiles` row to an `events` row with scheduling detail — the
event-specific "who's playing when/where."

| Column                 | Type    | Notes                                                                                                                                                                                                                                         |
| ---------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                   | INTEGER | PK, autoincrement                                                                                                                                                                                                                             |
| `event_id`             | INTEGER | NOT NULL, FK → `events(id)` ON DELETE CASCADE                                                                                                                                                                                                 |
| `band_profile_id`      | INTEGER | NOT NULL, FK → `band_profiles(id)` ON DELETE RESTRICT                                                                                                                                                                                         |
| `venue_id`             | INTEGER | Nullable, FK → `venues(id)` ON DELETE SET NULL                                                                                                                                                                                                |
| `start_time`           | TEXT    | Nullable (made optional in migration 0032)                                                                                                                                                                                                    |
| `end_time`             | TEXT    | Nullable (made optional in migration 0032)                                                                                                                                                                                                    |
| `notes`                | TEXT    | Nullable                                                                                                                                                                                                                                      |
| `band_id`              | INTEGER | Nullable, FK → `bands(id)` ON DELETE SET NULL — legacy compat, see `bands` below                                                                                                                                                              |
| `band_name`            | TEXT    | Nullable — legacy compat column                                                                                                                                                                                                               |
| `stage`                | TEXT    | Nullable                                                                                                                                                                                                                                      |
| `is_announced`         | INTEGER | NOT NULL, DEFAULT 1 — gates the public schedule and triggers follower emails on 0→1                                                                                                                                                           |
| `band_follow_notified` | INTEGER | NOT NULL, DEFAULT 0                                                                                                                                                                                                                           |
| `created_at`           | TEXT    | NOT NULL, DEFAULT `datetime('now')`                                                                                                                                                                                                           |
| `created_by_user_id`   | INTEGER | Nullable, FK → `users(id)`                                                                                                                                                                                                                    |
| `updated_by_user_id`   | INTEGER | Nullable, FK → `users(id)`                                                                                                                                                                                                                    |
| `updated_at`           | TEXT    | DEFAULT `datetime('now')`, bumped on UPDATE by the `update_performances_timestamp` trigger defined in `migrations/0033_restore_performances_trigger.sql` (not present in `setup-complete.sql` — see "Schema drift worth knowing about" below) |

Indexes: `idx_performances_event(event_id)`,
`idx_performances_band(band_profile_id)`, `idx_performances_venue(venue_id)`,
`idx_performances_event_time(event_id, start_time)`.

The table was dropped and recreated in migration 0032 (SQLite has no
`ALTER COLUMN`) to make `venue_id`/`start_time`/`end_time` nullable for
schedule-first entry flows.

### Legacy / compatibility

#### `bands` and `rate_limit` (removed from the bootstrap, #506)

Two pre-v2 tables (`bands`: event-scoped band+performance rows, superseded by
`band_profiles` + `performances`; `rate_limit`: one-row-per-IP limiter,
superseded by `rate_limits` in migration 0028) existed **only** in the
hand-maintained bootstrap — no migration creates them, production does not
have them, and no code reads or writes them. They were removed from
`database/setup-complete.sql` when it was regenerated from the migrations
replay (#506).

#### `sessions`

A pre-Lucia-migration session table. Still created by `setup-complete.sql`
but no current endpoint reads from or writes to it — session management now
goes entirely through `lucia_sessions` (see below and
`functions/utils/auth.js`).

| Column             | Type    | Notes                                        |
| ------------------ | ------- | -------------------------------------------- |
| `id`               | INTEGER | PK, autoincrement                            |
| `session_token`    | TEXT    | UNIQUE, NOT NULL                             |
| `user_id`          | INTEGER | NOT NULL, FK → `users(id)` ON DELETE CASCADE |
| `ip_address`       | TEXT    | Nullable                                     |
| `user_agent`       | TEXT    | Nullable                                     |
| `remember_me`      | INTEGER | DEFAULT 0                                    |
| `created_at`       | TEXT    | NOT NULL, DEFAULT `datetime('now')`          |
| `last_activity_at` | TEXT    | NOT NULL, DEFAULT `datetime('now')`          |
| `expires_at`       | TEXT    | NOT NULL                                     |

Indexes: `idx_sessions_token(session_token)`, `idx_sessions_user(user_id)`.

### Fan engagement

#### `band_follows`

A fan's follow of a band (double opt-in — see `CLAUDE.md` "Band Announcements").
Added in migration 0035.

| Column               | Type    | Notes                                                                                                                                                                    |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                 | INTEGER | PK, autoincrement                                                                                                                                                        |
| `email`              | TEXT    | NOT NULL                                                                                                                                                                 |
| `band_profile_id`    | INTEGER | NOT NULL, FK → `band_profiles(id)` ON DELETE CASCADE                                                                                                                     |
| `verified`           | INTEGER | NOT NULL, DEFAULT 0 — set to 1 only via `confirm-follow`                                                                                                                 |
| `verification_token` | TEXT    | UNIQUE, nullable — cleared once confirmed                                                                                                                                |
| `unsubscribe_token`  | TEXT    | UNIQUE, NOT NULL                                                                                                                                                         |
| `created_at`         | TEXT    | NOT NULL, DEFAULT `datetime('now')`                                                                                                                                      |
| `consent_ip`         | TEXT    | Nullable — added in migration 0045                                                                                                                                       |
| `consent_method`     | TEXT    | NOT NULL, DEFAULT `'web_form'` — added in migration 0045                                                                                                                 |
| `batch_token`        | TEXT    | Nullable — added in migration 0047; ties together rows from one batch-follow submission so a multi-band follow sends a single confirmation email instead of one per band |

Constraint: `UNIQUE(email, band_profile_id)`. Indexes:
`idx_band_follows_band(band_profile_id)`, `idx_band_follows_email(email)`,
`idx_band_follows_batch_token(batch_token)`.

#### `band_follow_notifications`

Per-follower delivery tracking for "this band just got announced" emails.
Added in migration 0041 to replace a fire-once latch that silently dropped
fans whose first send failed.

| Column           | Type    | Notes                                               |
| ---------------- | ------- | --------------------------------------------------- |
| `id`             | INTEGER | PK, autoincrement                                   |
| `performance_id` | INTEGER | NOT NULL, FK → `performances(id)` ON DELETE CASCADE |
| `band_follow_id` | INTEGER | NOT NULL, FK → `band_follows(id)` ON DELETE CASCADE |
| `notified_at`    | TEXT    | NOT NULL, DEFAULT `datetime('now')`                 |

Constraint: `UNIQUE(performance_id, band_follow_id)` — an `INSERT OR IGNORE`
against this constraint is how `notifyBandFollowers()`
(`functions/utils/bandFollowNotify.js`) atomically claims a follower before
sending, and deletes the row again if the send fails so a later resend can
retry. Index: `idx_band_follow_notifications_performance(performance_id)`.

#### `band_announce_queue`

Queue of per-follower "band announced" events awaiting a digest send. Added in
migration 0046.

| Column            | Type    | Notes                                                           |
| ----------------- | ------- | --------------------------------------------------------------- |
| `id`              | INTEGER | PK, autoincrement                                               |
| `band_follow_id`  | INTEGER | NOT NULL, FK → `band_follows(id)` ON DELETE CASCADE             |
| `performance_id`  | INTEGER | NOT NULL, FK → `performances(id)` ON DELETE CASCADE             |
| `event_id`        | INTEGER | NOT NULL — **no FK constraint** (denormalized snapshot)         |
| `band_name`       | TEXT    | NOT NULL — denormalized snapshot of the band name at queue time |
| `event_name`      | TEXT    | NOT NULL — denormalized snapshot                                |
| `event_slug`      | TEXT    | NOT NULL — denormalized snapshot                                |
| `band_profile_id` | INTEGER | NOT NULL — **no FK constraint** (denormalized snapshot)         |
| `queued_at`       | TEXT    | NOT NULL, DEFAULT `datetime('now')`                             |

Constraint: `UNIQUE(band_follow_id, performance_id)`. Indexes:
`idx_band_announce_queue_event(event_id)`,
`idx_band_announce_queue_follow(band_follow_id)`.

#### `share_links`

Server-side snapshot backing a shareable `/s/[slug]` schedule link. Added in
migration 0037; `view_count` added in migration 0040.

| Column            | Type    | Notes                                                                                                                              |
| ----------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | INTEGER | PK, autoincrement                                                                                                                  |
| `slug`            | TEXT    | NOT NULL, UNIQUE                                                                                                                   |
| `event_id`        | INTEGER | NOT NULL, FK → `events(id)` ON DELETE CASCADE                                                                                      |
| `event_slug`      | TEXT    | NOT NULL                                                                                                                           |
| `performance_ids` | TEXT    | NOT NULL (JSON array)                                                                                                              |
| `band_names`      | TEXT    | NOT NULL (JSON array)                                                                                                              |
| `created_at`      | TEXT    | NOT NULL, DEFAULT `datetime('now')`                                                                                                |
| `expires_at`      | TEXT    | NOT NULL                                                                                                                           |
| `view_count`      | INTEGER | NOT NULL, DEFAULT 0 — best-effort increment on preview view, not on the post-import refetch (see `GET /api/schedule/share/[slug]`) |

Indexes: `idx_share_links_slug(slug)`, `idx_share_links_expires_at(expires_at)`.
Per `CLAUDE.md`, `share_links` — not telemetry events — is the source of truth
for share create/view counts.

### Subscriptions & schedule builds

These four tables are live and queried (`functions/api/subscriptions/*`,
`functions/api/schedule/build.js`, `functions/api/admin/events/[id]/metrics.js`,
`functions/api/admin/analytics/subscriptions.js`) but are created only by
`migrations/0006_migration-subscriptions.sql` and
`migrations/0007_migration-metrics.sql` — not by `database/setup-complete.sql`
(tracked in issue #506). Columns below reflect their final form after later
ALTERs (migrations 0027 and 0045).

#### `email_subscriptions`

City/genre email digest subscriptions, double opt-in via a verification link.
Created by `POST /api/subscriptions/subscribe`.

| Column               | Type    | Notes                                                                  |
| -------------------- | ------- | ---------------------------------------------------------------------- |
| `id`                 | INTEGER | PK, autoincrement                                                      |
| `email`              | TEXT    | NOT NULL                                                               |
| `city`               | TEXT    | NOT NULL — city name or `'all'`                                        |
| `genre`              | TEXT    | NOT NULL — genre or `'all'`                                            |
| `frequency`          | TEXT    | NOT NULL, DEFAULT `'weekly'` — `daily` \| `weekly` \| `monthly`        |
| `verified`           | BOOLEAN | NOT NULL, DEFAULT 0 — declared BOOLEAN in the migration; stored as 0/1 |
| `verification_token` | TEXT    | UNIQUE, nullable                                                       |
| `unsubscribe_token`  | TEXT    | UNIQUE, NOT NULL                                                       |
| `created_at`         | TEXT    | NOT NULL, DEFAULT `datetime('now')`                                    |
| `last_email_sent`    | TEXT    | Nullable                                                               |
| `consent_ip`         | TEXT    | Nullable — added in migration 0045                                     |
| `consent_method`     | TEXT    | NOT NULL, DEFAULT `'web_form'` — added in migration 0045               |

Constraint: `UNIQUE(email, city, genre)`. Indexes:
`idx_subscriptions_email(email)`, `idx_subscriptions_city_genre(city, genre)`,
`idx_subscriptions_verified(verified)`,
`idx_subscriptions_verification_token(verification_token)`,
`idx_subscriptions_unsubscribe_token(unsubscribe_token)`.

#### `subscription_verifications`

Log row written when a subscription is confirmed
(`functions/api/subscriptions/verify.js`).

| Column            | Type    | Notes                                                      |
| ----------------- | ------- | ---------------------------------------------------------- |
| `id`              | INTEGER | PK, autoincrement                                          |
| `subscription_id` | INTEGER | NOT NULL, FK → `email_subscriptions(id)` ON DELETE CASCADE |
| `verified_at`     | TEXT    | NOT NULL, DEFAULT `datetime('now')`                        |

The original `ip_address` column was dropped in migration 0027 (never
populated by any code path; PII storage minimisation). No indexes.

#### `subscription_unsubscribes`

Unsubscribe log for metrics (`functions/api/subscriptions/unsubscribe.js`).

| Column            | Type    | Notes                                                      |
| ----------------- | ------- | ---------------------------------------------------------- |
| `id`              | INTEGER | PK, autoincrement                                          |
| `subscription_id` | INTEGER | NOT NULL, FK → `email_subscriptions(id)` ON DELETE CASCADE |
| `unsubscribed_at` | TEXT    | NOT NULL, DEFAULT `datetime('now')`                        |
| `reason`          | TEXT    | Nullable — optional feedback                               |

No indexes.

#### `schedule_builds`

One row per (event, performance, anonymous session), recorded when a fan adds
a performance to their schedule (`POST /api/schedule/build`); read by the
admin event metrics endpoint.

| Column           | Type    | Notes                                               |
| ---------------- | ------- | --------------------------------------------------- |
| `id`             | INTEGER | PK, autoincrement                                   |
| `event_id`       | INTEGER | NOT NULL, FK → `events(id)` ON DELETE CASCADE       |
| `performance_id` | INTEGER | NOT NULL, FK → `performances(id)` ON DELETE CASCADE |
| `user_session`   | TEXT    | NOT NULL — anonymous session identifier (no PII)    |
| `created_at`     | TEXT    | NOT NULL, DEFAULT `datetime('now')`                 |

Indexes: `idx_schedule_builds_event(event_id)`,
`idx_schedule_builds_session(user_session)`,
`idx_schedule_builds_created(created_at)`, plus the UNIQUE index
`idx_schedule_builds_unique(event_id, performance_id, user_session)` added in
migration 0014 to deduplicate rows and prevent spam.

### Auth & admin

#### `users`

| Column                        | Type    | Notes                                                          |
| ----------------------------- | ------- | -------------------------------------------------------------- |
| `id`                          | INTEGER | PK, autoincrement                                              |
| `email`                       | TEXT    | UNIQUE, NOT NULL                                               |
| `password_hash`               | TEXT    | NOT NULL — PBKDF2 format, see "Conventions & gotchas"          |
| `role`                        | TEXT    | NOT NULL, DEFAULT `'editor'` — `viewer` \| `editor` \| `admin` |
| `name`                        | TEXT    | Nullable                                                       |
| `first_name`                  | TEXT    | Nullable — added in migration 0019                             |
| `last_name`                   | TEXT    | Nullable — added in migration 0019                             |
| `is_active`                   | INTEGER | NOT NULL, DEFAULT 1                                            |
| `activation_token`            | TEXT    | Nullable — added in migration 0022                             |
| `activation_token_expires_at` | TEXT    | Nullable — added in migration 0022                             |
| `activated_at`                | TEXT    | Nullable — added in migration 0022                             |
| `totp_secret`                 | TEXT    | Nullable                                                       |
| `totp_enabled`                | INTEGER | DEFAULT 0                                                      |
| `webauthn_enabled`            | INTEGER | DEFAULT 0                                                      |
| `email_otp_enabled`           | INTEGER | DEFAULT 0                                                      |
| `backup_codes`                | TEXT    | Nullable (JSON)                                                |
| `require_2fa`                 | INTEGER | DEFAULT 1                                                      |
| `deactivated_at`              | TEXT    | Nullable                                                       |
| `deactivated_by`              | INTEGER | Nullable, FK → `users(id)` (self-referential)                  |
| `created_at`                  | TEXT    | NOT NULL, DEFAULT `datetime('now')`                            |
| `last_login`                  | TEXT    | Nullable                                                       |
| `updated_at`                  | TEXT    | DEFAULT `datetime('now')`                                      |

Indexes: `idx_users_email(email)`, `idx_users_activation_token(activation_token)`.

#### `lucia_sessions`

The active session store (despite the name, session management is a
hand-rolled direct-D1 manager in `functions/utils/auth.js` — the `lucia`
packages themselves were removed). Added in migration 0024.

| Column             | Type    | Notes                                                             |
| ------------------ | ------- | ----------------------------------------------------------------- |
| `id`               | TEXT    | PK (session id, not autoincrement)                                |
| `user_id`          | INTEGER | NOT NULL, FK → `users(id)` ON DELETE CASCADE                      |
| `expires_at`       | INTEGER | NOT NULL — **Unix epoch seconds, not `TEXT`** (the one exception) |
| `ip_address`       | TEXT    | Nullable                                                          |
| `user_agent`       | TEXT    | Nullable                                                          |
| `remember_me`      | INTEGER | DEFAULT 0                                                         |
| `created_at`       | TEXT    | NOT NULL, DEFAULT `datetime('now')`                               |
| `last_activity_at` | TEXT    | NOT NULL, DEFAULT `datetime('now')`                               |

Indexes: `idx_lucia_sessions_user_id(user_id)`,
`idx_lucia_sessions_expires_at(expires_at)`.

#### `mfa_challenges`

Short-lived state for an in-progress TOTP verification. Added in migration
0015; the partial unique index enforcing a single active challenge per user
was added in migration 0031.

| Column       | Type    | Notes                                        |
| ------------ | ------- | -------------------------------------------- |
| `id`         | INTEGER | PK, autoincrement                            |
| `token`      | TEXT    | NOT NULL, UNIQUE                             |
| `user_id`    | INTEGER | NOT NULL, FK → `users(id)` ON DELETE CASCADE |
| `ip_address` | TEXT    | Nullable                                     |
| `user_agent` | TEXT    | Nullable                                     |
| `expires_at` | TEXT    | NOT NULL                                     |
| `used`       | INTEGER | DEFAULT 0                                    |
| `used_at`    | TEXT    | Nullable                                     |
| `created_at` | TEXT    | NOT NULL, DEFAULT `datetime('now')`          |

Indexes: `idx_mfa_challenges_token(token)`,
`idx_mfa_challenges_user_id(user_id)`, `idx_mfa_challenges_expires_at(expires_at)`,
and a partial unique index `idx_mfa_challenges_active_user(user_id) WHERE used = 0`
(at most one unused/active challenge per user).

#### `invite_codes`

Admin-issued signup invites (bypassed only by the test-only
`ALLOW_ADMIN_SIGNUP` env var — never set in production). Added in migration 0009.

| Column               | Type    | Notes                                                  |
| -------------------- | ------- | ------------------------------------------------------ |
| `id`                 | INTEGER | PK, autoincrement                                      |
| `code`               | TEXT    | NOT NULL, UNIQUE                                       |
| `email`              | TEXT    | Nullable                                               |
| `role`               | TEXT    | NOT NULL, DEFAULT `'editor'`                           |
| `created_by_user_id` | INTEGER | Nullable, FK → `users(id)` ON DELETE SET NULL          |
| `used_by_user_id`    | INTEGER | Nullable, FK → `users(id)` ON DELETE SET NULL          |
| `created_at`         | TEXT    | NOT NULL, DEFAULT `datetime('now')`                    |
| `used_at`            | TEXT    | Nullable                                               |
| `expires_at`         | TEXT    | NOT NULL — see "SQLite datetime" gotcha above (SEC-F1) |
| `is_active`          | INTEGER | NOT NULL, DEFAULT 1                                    |

#### `webauthn_credentials`

Registered WebAuthn/passkey credentials, an alternate second factor to TOTP.

| Column          | Type    | Notes                                            |
| --------------- | ------- | ------------------------------------------------ |
| `id`            | INTEGER | PK, autoincrement                                |
| `user_id`       | INTEGER | NOT NULL, FK → `users(id)` ON DELETE CASCADE     |
| `credential_id` | TEXT    | UNIQUE, NOT NULL                                 |
| `public_key`    | TEXT    | NOT NULL                                         |
| `counter`       | INTEGER | NOT NULL, DEFAULT 0 — WebAuthn signature counter |
| `device_name`   | TEXT    | Nullable                                         |
| `created_at`    | TEXT    | NOT NULL, DEFAULT `datetime('now')`              |
| `last_used_at`  | TEXT    | Nullable                                         |

#### `email_otp_codes`

One-time email codes, a fallback second factor.

| Column       | Type    | Notes                                        |
| ------------ | ------- | -------------------------------------------- |
| `id`         | INTEGER | PK, autoincrement                            |
| `user_id`    | INTEGER | NOT NULL, FK → `users(id)` ON DELETE CASCADE |
| `code`       | TEXT    | NOT NULL                                     |
| `expires_at` | TEXT    | NOT NULL                                     |
| `used`       | INTEGER | NOT NULL, DEFAULT 0                          |
| `created_at` | TEXT    | NOT NULL, DEFAULT `datetime('now')`          |

#### `password_reset_tokens`

Admin- or self-initiated password reset tokens.

| Column       | Type    | Notes                                            |
| ------------ | ------- | ------------------------------------------------ |
| `id`         | INTEGER | PK, autoincrement                                |
| `user_id`    | INTEGER | NOT NULL, FK → `users(id)` ON DELETE CASCADE     |
| `token`      | TEXT    | UNIQUE, NOT NULL                                 |
| `created_by` | INTEGER | NOT NULL, FK → `users(id)` ON DELETE SET NULL    |
| `expires_at` | TEXT    | NOT NULL                                         |
| `used`       | INTEGER | NOT NULL, DEFAULT 0                              |
| `used_at`    | TEXT    | Nullable                                         |
| `ip_address` | TEXT    | Nullable                                         |
| `reason`     | TEXT    | Nullable — e.g. admin-initiated vs. self-service |
| `created_at` | TEXT    | NOT NULL, DEFAULT `datetime('now')`              |

#### `trusted_devices`

"Remember this device" MFA bypass. Added in migration 0030.

| Column               | Type    | Notes                                                        |
| -------------------- | ------- | ------------------------------------------------------------ |
| `id`                 | INTEGER | PK, autoincrement                                            |
| `user_id`            | INTEGER | NOT NULL, FK → `users(id)` ON DELETE CASCADE                 |
| `token`              | TEXT    | UNIQUE, NOT NULL                                             |
| `device_fingerprint` | TEXT    | Nullable — hash of IP + User-Agent                           |
| `ua_hash`            | TEXT    | Nullable — hash of User-Agent alone, validated independently |
| `ip_address`         | TEXT    | Nullable                                                     |
| `user_agent`         | TEXT    | Nullable                                                     |
| `expires_at`         | TEXT    | NOT NULL                                                     |
| `last_used_at`       | TEXT    | Nullable                                                     |
| `created_at`         | TEXT    | NOT NULL, DEFAULT `datetime('now')`                          |

Indexes: `idx_trusted_devices_user(user_id)`, `idx_trusted_devices_token(token)`,
`idx_trusted_devices_expires(expires_at)`.

#### `audit_log`

General admin-action audit trail (e.g. user role changes) — read by
`GET /api/admin/audit-log`.

| Column          | Type    | Notes                                         |
| --------------- | ------- | --------------------------------------------- |
| `id`            | INTEGER | PK, autoincrement                             |
| `user_id`       | INTEGER | Nullable, FK → `users(id)` ON DELETE SET NULL |
| `action`        | TEXT    | NOT NULL                                      |
| `resource_type` | TEXT    | Nullable                                      |
| `resource_id`   | INTEGER | Nullable                                      |
| `details`       | TEXT    | Nullable (JSON)                               |
| `ip_address`    | TEXT    | Nullable                                      |
| `created_at`    | TEXT    | DEFAULT `datetime('now')`                     |

#### `auth_audit`

Authentication-event audit trail (distinct from `auth_attempts`, which is
rate-limit bookkeeping — this table is append-only history read by
`functions/api/admin/maintenance/retention.js` and
`functions/api/auth/reset-password-complete.js`).

| Column       | Type    | Notes                               |
| ------------ | ------- | ----------------------------------- |
| `id`         | INTEGER | PK, autoincrement                   |
| `timestamp`  | TEXT    | NOT NULL, DEFAULT `datetime('now')` |
| `action`     | TEXT    | NOT NULL                            |
| `success`    | INTEGER | NOT NULL (0/1)                      |
| `ip_address` | TEXT    | NOT NULL                            |
| `user_agent` | TEXT    | Nullable                            |
| `details`    | TEXT    | Nullable (JSON)                     |

Indexes: `idx_auth_audit_timestamp(timestamp)`, `idx_auth_audit_ip(ip_address)`.

#### `auth_attempts`

Rate-limit bookkeeping for login/MFA/etc. attempts, queried by
`functions/utils/authAttempts.js`.

| Column           | Type    | Notes                               |
| ---------------- | ------- | ----------------------------------- |
| `id`             | INTEGER | PK, autoincrement                   |
| `user_id`        | INTEGER | Nullable — **no FK constraint**     |
| `email`          | TEXT    | Nullable                            |
| `ip_address`     | TEXT    | NOT NULL                            |
| `user_agent`     | TEXT    | Nullable                            |
| `attempt_type`   | TEXT    | NOT NULL                            |
| `success`        | INTEGER | NOT NULL (0/1)                      |
| `failure_reason` | TEXT    | Nullable                            |
| `created_at`     | TEXT    | NOT NULL, DEFAULT `datetime('now')` |

Indexes: `idx_auth_attempts_email(email)`, `idx_auth_attempts_ip(ip_address)`.

#### `rate_limits`

Globally-consistent fixed-window counters (D1-backed), superseding the
per-IP-only `rate_limit` table above. Added in migration 0028.

| Column         | Type    | Notes                                                   |
| -------------- | ------- | ------------------------------------------------------- |
| `key`          | TEXT    | PK — composite rate-limit key (e.g. scope + identifier) |
| `count`        | INTEGER | NOT NULL, DEFAULT 0                                     |
| `window_start` | INTEGER | NOT NULL — Unix timestamp                               |
| `updated_at`   | INTEGER | NOT NULL — Unix timestamp                               |

Index: `idx_rate_limits_updated_at(updated_at)`.

### Metrics

#### `artist_daily_stats`

Privacy-first, per-band-per-day aggregate (no raw event log). Added in
migration 0023; `profile_clicks`/`share_count` columns were dropped in
migration 0048 as dead weight (never written, so their weight in the
popularity formula was silently inert).

| Column            | Type    | Notes                                                |
| ----------------- | ------- | ---------------------------------------------------- |
| `id`              | INTEGER | PK, autoincrement                                    |
| `band_profile_id` | INTEGER | NOT NULL, FK → `band_profiles(id)` ON DELETE CASCADE |
| `date`            | TEXT    | NOT NULL, `YYYY-MM-DD`                               |
| `page_views`      | INTEGER | DEFAULT 0                                            |
| `social_clicks`   | INTEGER | DEFAULT 0                                            |
| `created_at`      | TEXT    | DEFAULT `datetime('now')`                            |

Constraint: `UNIQUE(band_profile_id, date)`. Indexes:
`idx_artist_stats_date(date)`, `idx_artist_stats_band(band_profile_id)`.

#### `page_views_daily`

Per-page, per-day aggregate view counter. Added in migration 0039.

| Column  | Type    | Notes                  |
| ------- | ------- | ---------------------- |
| `id`    | INTEGER | PK, autoincrement      |
| `page`  | TEXT    | NOT NULL               |
| `date`  | TEXT    | NOT NULL, `YYYY-MM-DD` |
| `views` | INTEGER | DEFAULT 0              |

Constraint: `UNIQUE(page, date)`. Index: `idx_page_views_date(date)`.

## Relationships

Foreign keys as declared in `database/setup-complete.sql` (only columns with
an actual `REFERENCES` clause are FKs — several `*_id` columns above are
plain denormalized integers with no constraint, called out individually):

| Child                       | Column               | → Parent            | On delete |
| --------------------------- | -------------------- | ------------------- | --------- |
| `bands`                     | `event_id`           | `events(id)`        | SET NULL  |
| `bands`                     | `venue_id`           | `venues(id)`        | SET NULL  |
| `performances`              | `event_id`           | `events(id)`        | CASCADE   |
| `performances`              | `band_profile_id`    | `band_profiles(id)` | RESTRICT  |
| `performances`              | `band_id`            | `bands(id)`         | SET NULL  |
| `performances`              | `venue_id`           | `venues(id)`        | SET NULL  |
| `performances`              | `created_by_user_id` | `users(id)`         | (none)    |
| `performances`              | `updated_by_user_id` | `users(id)`         | (none)    |
| `artist_daily_stats`        | `band_profile_id`    | `band_profiles(id)` | CASCADE   |
| `users`                     | `deactivated_by`     | `users(id)` (self)  | (none)    |
| `sessions`                  | `user_id`            | `users(id)`         | CASCADE   |
| `lucia_sessions`            | `user_id`            | `users(id)`         | CASCADE   |
| `mfa_challenges`            | `user_id`            | `users(id)`         | CASCADE   |
| `invite_codes`              | `created_by_user_id` | `users(id)`         | SET NULL  |
| `invite_codes`              | `used_by_user_id`    | `users(id)`         | SET NULL  |
| `webauthn_credentials`      | `user_id`            | `users(id)`         | CASCADE   |
| `email_otp_codes`           | `user_id`            | `users(id)`         | CASCADE   |
| `password_reset_tokens`     | `user_id`            | `users(id)`         | CASCADE   |
| `password_reset_tokens`     | `created_by`         | `users(id)`         | SET NULL  |
| `trusted_devices`           | `user_id`            | `users(id)`         | CASCADE   |
| `audit_log`                 | `user_id`            | `users(id)`         | SET NULL  |
| `band_follows`              | `band_profile_id`    | `band_profiles(id)` | CASCADE   |
| `band_follow_notifications` | `performance_id`     | `performances(id)`  | CASCADE   |
| `band_follow_notifications` | `band_follow_id`     | `band_follows(id)`  | CASCADE   |
| `band_announce_queue`       | `band_follow_id`     | `band_follows(id)`  | CASCADE   |
| `band_announce_queue`       | `performance_id`     | `performances(id)`  | CASCADE   |
| `share_links`               | `event_id`           | `events(id)`        | CASCADE   |

The old "venues → bands (1:N)" world from earlier docs is gone in practice:
current schedule data flows through `events → performances ← band_profiles`,
with `venues → performances` as an optional (nullable) third leg. `bands` and
its FKs still exist in the schema but sit outside every live query path (see
"Legacy / compatibility" above).

## Common query patterns

Pulled directly from current endpoint code, not invented.

**Public schedule for an event** (`functions/api/schedule.js`) — the current
`events → performances → band_profiles`/`venues` join, filtered by
`reveal_mode` so unannounced performances stay hidden when the event has
reveal mode on:

```sql
SELECT
  p.id as performance_id,
  b.id as band_id,
  b.name,
  p.start_time as startTime,
  p.end_time as endTime,
  b.social_links,
  b.photo_url,
  v.name as venue,
  v.latitude as venue_lat,
  v.longitude as venue_lng
FROM performances p
INNER JOIN band_profiles b ON p.band_profile_id = b.id
LEFT JOIN venues v ON p.venue_id = v.id
WHERE p.event_id = ?
  AND (? = 0 OR p.is_announced = 1)
ORDER BY p.start_time, v.name;
```

**Share-link lookup** (`functions/api/schedule/share/[slug].js`) — relies on
`ON DELETE CASCADE` from `events` so a deleted event's share links vanish with
it, and the expiry check is a plain string comparison because `expires_at` is
stored in the space-separated `datetime('now')` format:

```sql
SELECT sl.slug, sl.event_slug, sl.performance_ids, sl.band_names, e.name AS event_name
FROM share_links sl
JOIN events e ON e.id = sl.event_id AND (e.is_published = 1 OR e.status = 'archived')
WHERE sl.slug = ? AND sl.expires_at > datetime('now');
```

**Atomic claim-before-send** (`functions/utils/bandFollowNotify.js`) — how
`band_follow_notifications` prevents double-sending announcement emails under
concurrent resend requests:

```sql
INSERT OR IGNORE INTO band_follow_notifications (performance_id, band_follow_id)
VALUES (?, ?);
-- changes === 0 means another request already claimed this follower.
-- If the subsequent email send fails, the claim is released:
DELETE FROM band_follow_notifications WHERE performance_id = ? AND band_follow_id = ?;
```

**Compensating delete on a non-batchable mutation**
(`functions/api/admin/events/[id]/duplicate.js`) — D1 has no transactions, so
duplicating an event's performances into a copy is compensated manually if the
copy fails:

```sql
INSERT INTO performances (event_id, venue_id, band_profile_id, start_time, end_time, notes)
SELECT ?, venue_id, band_profile_id, start_time, end_time, notes
FROM performances
WHERE event_id = ?;
-- on failure:
DELETE FROM events WHERE id = ?;
```

**Event metrics batch** (`functions/api/admin/events/[id]/metrics.js`) — reads
`schedule_builds` (documented under "Subscriptions & schedule builds" above)
alongside `performances` and `band_profiles` in one `DB.batch()`:

```sql
SELECT COUNT(*) as total_schedule_builds,
       COUNT(DISTINCT user_session) as unique_visitors,
       MAX(created_at) as last_updated
FROM schedule_builds WHERE event_id = ?;
```

## Schema drift protection

Historical drift between `database/setup-complete.sql` and `migrations/`
(whole tables, columns, foreign keys, indexes, and triggers — see
[issue #506](https://github.com/BreakableHoodie/settimesdotca/issues/506))
was eliminated by regenerating the bootstrap from the migrations replay.
Two scripts keep it that way:

- `node scripts/regenerate-setup-complete.mjs` — rewrites the bootstrap's
  schema section from `migrations/` (run after adding any migration).
- `node scripts/check-schema-drift.mjs` — structurally compares the two and
  fails on any divergence; runs in CI (`quality.yml`, Schema Drift Check).

## Further reading

`migrations/` holds the authoritative, ordered history of every schema
change described above — consult it directly for the exact SQL of any
migration referenced by number in this document.
