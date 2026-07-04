---
title: "ADR-0001: Normalize all datetime values to space-separated SQLite format before storage"
status: "Accepted"
date: "2026-05-14"
authors: "Platform Engineering"
tags: ["architecture", "database", "cloudflare-d1", "datetime", "security"]
supersedes: ""
superseded_by: ""
---

## Status

Accepted

_Superseded context: Lucia was removed entirely in PR #290. The `lucia_sessions` table name is
retained for historical/compatibility reasons but is now managed by the direct D1 session manager
in `functions/utils/auth.js`, not by Lucia. The INTEGER Unix-epoch `expires_at` invariant described
below still holds exactly as written._

## Context

SetTimes uses Cloudflare D1 as its primary database. D1 is SQLite-compatible, and SQLite TEXT comparisons are strictly lexicographic — they compare strings character-by-character using ASCII values.

Two incompatible datetime string formats are in play:

- **D1 native format**: `datetime('now')` returns `YYYY-MM-DD HH:MM:SS` (space separator, no timezone suffix).
- **JavaScript native format**: `new Date().toISOString()` returns `YYYY-MM-DDThh:mm:ssZ` (T separator, Z suffix).

The ASCII value of `T` (84) is greater than the ASCII value of space (32). This means that at any given instant, the T-separated ISO 8601 representation of a datetime sorts lexicographically _higher_ than the equivalent space-separated SQLite representation of the same instant:

```
"2026-05-14 12:00:00"  <  "2026-05-14T12:00:00Z"
```

If a T-separated value is stored in an `expires_at` TEXT column and compared with `expires_at > datetime('now')`, the condition evaluates to `true` for every stored value — the record appears unexpired regardless of its actual expiry time. This is a silent correctness failure with no runtime error.

This comparison pattern is used across the codebase for invite codes, MFA challenges, trusted devices, and shared schedule links. A production incident (SEC-F1) confirmed the failure mode: invite codes with T-separated `expires_at` values never expired because every record always passed the `> datetime('now')` check.

A secondary complexity exists with the `lucia_sessions` table, which stores `expires_at` as INTEGER (Unix epoch seconds) per Lucia v3 internals. That table requires `> unixepoch()` for comparisons and is explicitly excluded from this convention.

## Decision

All datetime values written to D1 TEXT columns must be normalized to space-separated SQLite format before storage using the pattern:

```js
new Date(Date.now() + ms).toISOString().replace("T", " ").slice(0, 19);
```

A reusable helper `toSqliteDateTime(date)` is defined in `functions/utils/authAttempts.js` (line 55). New code that stores datetimes in D1 TEXT columns must use `toSqliteDateTime()` or the equivalent inline pattern. ISO 8601 strings from JavaScript must never be stored directly in D1 TEXT columns.

This convention applies to all `expires_at` TEXT columns in the schema, including:

- `invite_codes.expires_at`
- `mfa_challenges.expires_at`
- `trusted_devices.expires_at`
- `shared_schedules.expires_at`
- Any future TEXT datetime columns

The sole exception is `lucia_sessions.expires_at`, which is INTEGER and must be compared using `> unixepoch()`.

## Consequences

### Positive

- **POS-001**: Datetime comparisons using `> datetime('now')` and `< datetime('now')` produce correct results for all TEXT `expires_at` columns.
- **POS-002**: The `toSqliteDateTime()` helper in `functions/utils/authAttempts.js` centralizes normalization logic, reducing the surface for future mistakes.
- **POS-003**: The format is human-readable in D1 console queries and database exports without any conversion.
- **POS-004**: The production incident (SEC-F1) that permitted infinite invite code validity cannot recur when this convention is followed.

### Negative

- **NEG-001**: The `lucia_sessions.expires_at` column uses INTEGER (Unix epoch) rather than TEXT, which requires a different comparison operator (`> unixepoch()` instead of `> datetime('now')`). Developers must be aware of this two-format system.
- **NEG-002**: `toSqliteDateTime()` is not exported from a shared utility index, so call sites outside `authAttempts.js` inline the pattern directly (e.g., `functions/utils/trustedDevice.js`, `functions/utils/tokens.js`, `functions/api/admin/invite-codes.js`). There is no compile-time enforcement; the convention must be maintained by convention and code review.
- **NEG-003**: JavaScript `Date` objects carry millisecond precision that is silently discarded by `.slice(0, 19)`. Code that relies on sub-second expiry precision will not behave correctly.

## Alternatives Considered

##### Store as ISO 8601 with T separator

- **ALT-001**: **Description**: Store `toISOString()` output directly without transformation (e.g., `2026-05-14T12:00:00.000Z`).
- **ALT-002**: **Rejection Reason**: ASCII value of `T` (84) > space (32), so a T-separated value always compares greater than `datetime('now')` at the same position. The `> datetime('now')` expiry check silently never triggers. This is the root cause of production incident SEC-F1 and must not be reintroduced.

##### Store as Unix epoch integers

- **ALT-003**: **Description**: Store all `expires_at` columns as INTEGER (Unix epoch seconds), matching the storage format Lucia v3 uses for `lucia_sessions.expires_at`.
- **ALT-004**: **Rejection Reason**: All existing `expires_at` TEXT columns are defined as TEXT in the schema with 38 migrations already applied. Migrating them all to INTEGER would require a coordinated schema migration and updates to every query that reads or compares those columns. The inconsistency Lucia v3 introduces for its own table is an accepted exception, not a model to extend to application-owned columns.

##### Use a database trigger or generated column to normalize on insert

- **ALT-005**: **Description**: Define a `BEFORE INSERT` trigger or a generated column that coerces any stored value to SQLite datetime format automatically.
- **ALT-006**: **Rejection Reason**: Cloudflare D1 does not reliably support triggers or generated columns at migration time. D1's SQLite subset excludes the SQL features needed, and relying on schema-level enforcement that may silently fail or be unavailable in all D1 runtime versions is not a safe foundation for a security-critical property.

## Implementation Notes

- **IMP-001**: The canonical helper is `toSqliteDateTime(date)` at `functions/utils/authAttempts.js:55`. When adding a new datetime write, prefer importing and calling this function over inlining the pattern.
- **IMP-002**: Any code path that constructs a D1 TEXT datetime from a JavaScript `Date` or `Date.now()` must pass through `toSqliteDateTime()` or the equivalent inline `.toISOString().replace("T", " ").slice(0, 19)` pattern.
- **IMP-003**: Code review checklist: flag any `.toISOString()` result stored in a D1 column without the `.replace("T", " ")` transformation.
- **IMP-004**: The `lucia_sessions` table is owned by Lucia v3 internals and uses INTEGER epochs. Compare its `expires_at` column with `> unixepoch()`, never with `> datetime('now')`.
- **IMP-005**: Success criterion: no `expires_at` TEXT column in D1 ever contains a `T` character. This can be audited with: `SELECT COUNT(*) FROM <table> WHERE expires_at LIKE '%T%'`.

## References

- **REF-001**: `CLAUDE.md` — "SQLite datetime format" section documents this invariant for AI assistants working in this codebase.
- **REF-002**: `functions/utils/authAttempts.js:55` — `toSqliteDateTime()` helper implementation.
- **REF-003**: `functions/utils/trustedDevice.js:75` — `createTrustedDevice` expiresAt normalization.
- **REF-004**: `functions/api/admin/auth/login.js:280` — MFA challenge expiresAt normalization.
- **REF-005**: [SQLite documentation — Date and Time Functions](https://www.sqlite.org/lang_datefunc.html) — specifies that `datetime('now')` returns `YYYY-MM-DD HH:MM:SS` format.
- **REF-006**: [ADR-0003: Cloudflare D1 as Primary Database](./adr-0003-cloudflare-d1-primary-database.md) — background on D1 adoption and its SQLite compatibility constraints.
