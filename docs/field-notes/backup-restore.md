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

- **Proves (for what was checked):** an export of production restores into SQLite in seconds, with zero errors. Every table's row count matches; integrity and foreign-key checks pass; and the selected content fingerprints match (ids, names, description lengths, slugs and statuses, set times). It does not compare every column of every table: an unchecked column could differ while all of these pass. A full comparison would hash each table's complete contents on both sides; do that next time, before deleting the export.
- **Does not prove:** a Time Travel restore. That only restores **in place**, onto production, so it cannot be rehearsed without risk. In an incident, `wrangler d1 time-travel restore` prints the **previous bookmark**, the state just before the restore. Record it: restoring to it is the undo ([Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)). A bookmark taken earlier with `time-travel info` would miss writes made between `info` and the restore. The undo is itself an in-place restore, so writes accepted after the first restore are lost by it: pause writes and save anything written since before undoing.
- **Time Travel's window** is 30 days on Workers Paid (7 on Free). Anything older comes from the monthly offsite copy below.

## To repeat it

Off-season, owner approved, away from the daily scheduled job (`scheduled-jobs.yml`, which deletes and rewrites rows): steps 1–6 above, in a session scratchpad. A "quiet window" does not stop writes, and the export lock lasts only while the export runs. So bracket the export with the same production fingerprint (counts plus full-table hashes) **immediately before and after**. If the two differ, a write landed in the window, the comparison cannot prove anything, and you rerun. On 2026-11-24 the before and after counts were identical. Record the timings here with the date.

## The monthly offsite copy (#1479)

Decided 2026-11-24 (owner): monthly, private R2, short-lived data left out, so no retention window in the privacy policy changes. The policy does say that organiser accounts sit in these copies for about 13 months.

- **What runs:** `.github/workflows/d1-backup.yml`, on the 1st at 08:43 UTC (about 3:43 AM Toronto), or by hand. It skips, with a warning, while any published event is running, because the export locks production. A skipped month is not retried: run it by hand after the show. A failure opens or updates an `Offsite D1 backup failed` issue.
- **What it does:** one full `wrangler d1 export` (one lock: `--table` takes a single table, so per-table exports would mean one lock each), then `scripts/d1-backup.mjs` restores it into SQLite on the runner, requires `integrity_check` = ok and no `foreign_key_check` violations, refuses any table it does not classify, empties the excluded tables (their schema stays), and writes the copy with `VACUUM INTO` so deleted rows leave no bytes behind. That is a restore rehearsal every month, for free.
- **Credentials inside kept tables are cleared** (`SCRUB_UPDATES`): plaintext activation tokens, pending authenticator secrets, and any TOTP secret without the `enc-v1:` prefix (that user re-enrols). D1's own `_cf_*` tables are dropped, because a restore cannot create them.
- **Excluded tables** and why: `EXCLUDED_TABLES` in the script. A new table fails the backup until someone classifies it, and `scripts/__tests__/d1Backup.test.js` fails the build first: every table in `setup-complete.sql` must be classified, and every table `retention.js` prunes must be excluded.
- **Where:** R2 bucket `settimes-d1-backups` (location hint `enam`), key `monthly/<YYYY-MM>-<commit>.db.gz`. No `r2.dev` URL, no custom domain. Lifecycle rule `expire-monthly` deletes `monthly/` objects after 400 days. Both live in Cloudflare, not in this repository: check them with `wrangler r2 bucket lifecycle list settimes-d1-backups` and `wrangler r2 bucket dev-url get settimes-d1-backups`.
- **Never** an Actions artifact or a logged row: the repository is public. The job logs table names and counts only.

### Restoring from an offsite copy

Into a NEW database, never over production while it serves (that is what Time Travel is for):

Save this as a script and run it with `bash` from the repository root (after `npm ci` in `frontend/`, so the pinned wrangler is used), so the first failed step stops it: run line by line, a failed download leaves `sqlite3` to create an empty `backup.db` that passes `integrity_check`.

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077
key="monthly/<key>.db.gz"; target="settimes-restore-<date>"
wrangler=./frontend/node_modules/.bin/wrangler
"$wrangler" r2 object get "settimes-d1-backups/$key" --remote --file backup.db.gz
gunzip backup.db.gz
test "$(sqlite3 backup.db 'PRAGMA integrity_check;')" = ok
# Not `sqlite3 .dump`: since SQLite 3.50 it escapes newlines with unistr(),
# which D1 refuses, and it wraps everything in a transaction D1 also refuses.
node scripts/d1-backup.mjs --restore-sql backup.db > restore.sql
"$wrangler" d1 create "$target"
"$wrangler" d1 execute "$target" --remote --file restore.sql
```

Then point a preview at it, check, and only then decide how to bring rows back to production. Excluded tables restore empty: everyone signs in again, and the login log, security logs and share links start fresh. Delete the local files with `command rm -f` afterwards.

**First rehearsal of this path (2026-11-24, #1483):** the first copy, `monthly/2026-11-6c030e390190.db.gz` (149 KB, export lock 3 s), downloaded and passed `integrity_check`, then **failed to import**: `FOREIGN KEY constraint failed`. `restoreSql` wrote rows in table-creation order, `events` (created before `users`) came first, and its `PRAGMA defer_foreign_keys` holds only until a transaction commits; D1's remote import does not apply the file as one. Local SQLite does, which is why the job's own check and the tests passed (#1486). Rows now go parents-first, and a test applies the SQL with the deferral removed. Rerun with the fix into a throwaway D1: every table's count matched the copy (12 tables with rows, 3,160 rows), 0 foreign-key violations. The database and local files were deleted afterwards. **The monthly job's own check cannot see this class:** only an import into real D1 proves a copy restores, so repeat this rehearsal after any change to `restoreSql`.

**If a step fails,** start clean before retrying: `command rm -f backup.db.gz backup.db restore.sql`, and if the target database was created, delete it by its literal name (`./frontend/node_modules/.bin/wrangler d1 delete settimes-restore-<date>`; the script's variables are gone once it exits) or pick a new name. A half-imported database is not a restore.
