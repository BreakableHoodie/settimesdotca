---
title: "ADR-0003: Use DB.batch() for atomic multi-statement mutations; no BEGIN/COMMIT"
status: "Accepted"
date: "2026-05-14"
authors: "Platform Engineering"
tags: ["architecture", "database", "cloudflare-d1", "transactions", "atomicity"]
supersedes: ""
superseded_by: ""
---

## Status

Accepted

## Context

SetTimes uses Cloudflare D1 as its primary database (see [`adr-0003-cloudflare-d1-primary-database.md`](./adr-0003-cloudflare-d1-primary-database.md)). D1 is a globally-replicated SQLite database exposed through a REST-over-HTTP JavaScript binding — it does not expose a persistent TCP connection. Because there is no persistent connection, SQLite's transaction control statements (`BEGIN`, `COMMIT`, `ROLLBACK`) cannot span multiple requests and are not supported by the `DB.prepare()` binding. Attempting to execute them produces an error or undefined behavior.

Several mutations in the application must be atomic:

- **User hard-delete** (`functions/api/admin/users/[id].js`): Multiple `UPDATE` statements delink the user from events, venues, bands, and performances before the final `DELETE FROM users`. If the delete succeeds but a delink fails mid-batch, the database is left in an inconsistent state with orphaned references.
- **Bulk performance updates** (`functions/api/admin/bands/bulk.js`): Venue reassignment and time-shift operations update many rows at once. A partial success would leave some performances in the old state and some in the new.
- **Event wizard creation** (`functions/api/admin/events/wizard.js`): An event row must be inserted first (to obtain its generated `id`), then all performances are inserted referencing that `id`. The event insert and performance inserts cannot be expressed as a single batch because the second step depends on the output of the first.

D1's JavaScript binding provides `DB.batch([stmt1, stmt2, ...])`, which executes all statements in a single HTTP request to D1. D1 guarantees that the batch is atomic: if any statement fails, all statements are rolled back.

A secondary concern is that SQLite foreign key enforcement (`PRAGMA foreign_keys`) is **disabled by default** in D1 production. It is enabled in test helpers (`functions/api/test-utils.js:5`) to catch FK violations during testing, but production code cannot rely on `ON DELETE CASCADE` or `ON DELETE SET NULL` constraints firing automatically.

## Decision

Use `DB.batch([stmt1, stmt2, ...])` for all multi-statement mutations that must be atomic.

For mutations where multiple sequential round-trips are unavoidable because a later statement depends on the output of an earlier one (e.g., inserting a parent row to obtain its ID before inserting child rows), use the **compensating delete pattern**: wrap the entire sequence in a `try/catch`, and if any step after the first insert fails, manually delete the already-committed rows before returning an error.

The canonical example is the event wizard (`functions/api/admin/events/wizard.js`):

1. `INSERT INTO events … RETURNING *` — runs first to get `event.id`.
2. `DB.batch([INSERT INTO performances … ])` — runs second, referencing `event.id`.
3. If step 2 throws, the `catch` block executes `DELETE FROM events WHERE id = ?` to remove the orphan event row.

Do not use `BEGIN` or `COMMIT` via `DB.prepare()`. Do not attempt to execute multiple SQL statements in a single `DB.prepare()` string — D1 does not support multi-statement strings.

Application-level FK cleanup is required before any `DELETE` that the schema does not cover with `ON DELETE CASCADE` or `ON DELETE SET NULL` — do not rely on FK constraints being enforced at runtime.

## Consequences

### Positive

- **POS-001**: `DB.batch()` provides true all-or-nothing atomicity for mutations that can be expressed without inter-statement data dependencies, with no application-level coordination required.
- **POS-002**: The pattern is compatible with D1's REST-over-HTTP binding across all D1 plan tiers and does not require any runtime feature that might vary by `compatibility_date`.
- **POS-003**: The compensating delete pattern for multi-round-trip sequences is explicit, auditable, and covered by a dedicated test case (`wizard.test.js:259`) that simulates `DB.batch()` failure and asserts orphan cleanup.

### Negative

- **NEG-001**: Mutations that require inter-statement data dependencies (insert-then-reference) cannot use `DB.batch()` for the full sequence. The compensating delete pattern is weaker than true atomicity — if the compensating delete itself fails (e.g., a transient D1 error), the orphan row remains and requires manual remediation.
- **NEG-002**: `PRAGMA foreign_keys` is not enforced in production D1. Application code must manually null-out or delete referencing rows before executing a parent-row delete, even when the schema defines `ON DELETE CASCADE` or `ON DELETE SET NULL`, because those constraints are only reliably enforced in the test environment.
- **NEG-003**: The test/production divergence on `foreign_keys` means tests may catch FK violations that production silently ignores. Tests do not catch the absence of manual FK cleanup code that production actually requires.
- **NEG-004**: `DB.batch()` result metadata (`result[i].meta.changes`) must be accessed per-statement — there is no single aggregate result for the batch, requiring reduce or iteration to sum affected rows.

## Alternatives Considered

##### BEGIN / COMMIT via DB.prepare()

- **ALT-001**: **Description**: Use standard SQLite transaction syntax by executing `DB.prepare("BEGIN").run()` followed by the mutation statements, then `DB.prepare("COMMIT").run()`.
- **ALT-002**: **Rejection Reason**: D1's REST-over-HTTP binding does not maintain a persistent database connection between `DB.prepare()` calls. Each call is an independent HTTP request to D1's remote execution layer. `BEGIN` and `COMMIT` in separate requests do not form a coherent transaction — the binding does not support this pattern and will produce an error or undefined behavior.

##### Multi-statement string in a single DB.prepare()

- **ALT-003**: **Description**: Pass multiple SQL statements separated by semicolons to a single `DB.prepare()` call.
- **ALT-004**: **Rejection Reason**: D1 does not support multi-statement strings in `DB.prepare()`. Each `DB.prepare()` call must contain exactly one SQL statement.

##### Application-level distributed lock via KV or Durable Objects

- **ALT-005**: **Description**: Acquire a lock in Cloudflare KV or a Durable Object before executing a sequence of D1 statements, then release it after the final statement to prevent concurrent interleaving.
- **ALT-006**: **Rejection Reason**: This adds significant architectural complexity (lock acquisition, expiry, error handling, potential deadlocks) for a problem that `DB.batch()` already solves for the common case. Durable Objects also introduce additional cost and latency. This approach is not warranted given that `DB.batch()` covers the majority of the atomic mutation patterns in this codebase.

## Implementation Notes

- **IMP-001**: Any new multi-statement mutation must use `DB.batch([...statements])`. Build the array of prepared statements first, then pass it to a single `DB.batch()` call.
- **IMP-002**: For sequences that require inter-statement output (insert-then-reference), use the compensating delete pattern: insert the parent row, execute the child batch in a `try/catch`, and delete the parent row in the `catch` block before re-throwing or returning the error response.
- **IMP-003**: Before executing `DELETE FROM users` or any other parent-row delete, manually issue `UPDATE` statements to null-out all non-cascading foreign key references. Do not rely on `ON DELETE CASCADE` or `ON DELETE SET NULL` firing in production — confirm behavior against `wrangler.toml` compatibility date (`2025-10-08`) and D1 release notes.
- **IMP-004**: When summing rows affected across a `DB.batch()` result, iterate the result array: `result.reduce((total, r) => total + (r.meta?.changes ?? 0), 0)`.
- **IMP-005**: The compensating delete path must be covered by a test that mocks `DB.batch()` to throw and asserts the orphan row was removed. See `functions/api/admin/events/__tests__/wizard.test.js:259` as the reference pattern.

## References

- **REF-001**: `functions/api/admin/events/wizard.js` — compensating delete pattern (lines 7, 278, 317–327).
- **REF-002**: `functions/api/admin/users/[id].js:415` — `DB.batch()` for user hard-delete FK cleanup.
- **REF-003**: `functions/api/admin/bands/bulk.js:491,526` — `DB.batch()` for bulk venue reassignment and time-shift.
- **REF-004**: `functions/api/admin/events/__tests__/wizard.test.js:259` — test for compensating delete on `DB.batch()` failure.
- **REF-005**: `functions/api/test-utils.js:5` — `PRAGMA foreign_keys = ON` in test helpers (not set in production).
- **REF-006**: `CLAUDE.md` — "D1 transactions" section documents the `DB.batch()` and compensating delete invariants for AI assistants.
- **REF-007**: [Cloudflare D1 documentation — Batch statements](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch-statements) — documents atomicity guarantee for `DB.batch()`.
- **REF-008**: [ADR-0004: Normalize datetime values to space-separated SQLite format](./0004-sqlite-datetime-format.md) — related D1 behavioral constraint.
