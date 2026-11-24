# Backup and restore: rehearsed 2026-11-24 (#1442)

`docs/DEPLOYMENT.md` names D1 Time Travel as the production recovery path. Until this rehearsal, no one had proven that our data survives a round trip out of D1 and back into SQLite. This note records what was run, what it showed, and the one surprise.

## The surprise: an export locks production

The issue planned the export as "read-only on production". Cloudflare's own docs say otherwise:

> "The export operation requires D1 Write permission because it locks the database until the export completes — it is not a read-only operation." ([Debug D1](https://developers.cloudflare.com/d1/observability/debug-d1/))

So `wrangler d1 export … --remote` **blocks production** while it runs: fan reads, the hourly `site-health.yml` probes, and the daily scheduled jobs. It needs the owner's go-ahead and a quiet window, never a show night. Measured here: **3.6 s wall time**, including the download, on a 1.1 MB database. The lock grows with the database.

## What was run (2026-11-24, off-season, owner approved)

1. **Baseline.** Every table's `COUNT(*)` on production via `wrangler d1 execute --remote --json` (one row of scalar subqueries). The MCP `queryDB` tool refuses credential tables even for counts, which is right; a count returns no credential material. Result: **27 tables, 4,458 rows.**
2. **Export.** `npx wrangler d1 export settimes-production-db --remote --output=<scratchpad>/prod-export.sql` with `umask 077`. Result: 958,599 bytes, 3.6 s.
3. **Recount** immediately after: production unchanged across the window.
4. **Restore locally, never into a shared D1.** `sqlite3 restored.db < prod-export.sql` (SQLite 3.54). Result: exit 0, **zero errors**, 1.6 s. Never load production data into `settimes-e2e-db`: public preview deployments bind it.
5. **Verify.**
   - The same counts on the restored file: **all 27 tables match**, 4,458 rows.
   - `PRAGMA integrity_check` returns `ok`; `PRAGMA foreign_key_check` finds no violations.
   - Content fingerprints match for `band_profiles`, `events`, `performances` and `venues`: id sums, name and description lengths, every slug and status, every set time.
6. **Delete** the export and the restored file. They hold password hashes and sessions. Use `command rm -f`, because `rm` is aliased to `rm -i` on this machine, and a non-interactive prompt silently declines.

## Traps hit along the way

- **zsh does not word-split** an unquoted `$VAR`, so `for t in $TABLES` loops once over the whole string. Use `${=TABLES}` or an array.
- **`UNION ALL` of bare aggregate selects** failed through the D1 API. One row of `(SELECT COUNT(*) FROM t) AS t` subqueries works.

## What this does and does not prove

- **Proves:** an export of production restores into SQLite, complete and consistent, in seconds.
- **Does not prove:** a Time Travel restore. That only restores **in place**, onto production, so it cannot be rehearsed without risk. Before running `time-travel restore` in an incident, run `wrangler d1 time-travel info` and keep the **current bookmark**. Restoring to that bookmark is the undo ([Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)).
- **Time Travel's window** is 30 days on Workers Paid (7 on Free). Anything older needs an offsite copy; the decision is tracked separately.

## To repeat it

Off-season, owner approved, in a quiet window: steps 1–6 above, in a session scratchpad. Record the timings here with the date.
