# Scheduled dispatch: the Cloudflare cron Worker (#1489)

## Why it exists

GitHub delays and drops `schedule:` runs under load. Measured 2026-11-24:
`site-health.yml` (hourly) ran twice in 36 hours, `deploy-reconcile.yml`
(every 30 minutes) about three times a day, and `scheduled-jobs.yml`
(07:17 UTC) ran between 15:21 and 19:15 UTC. A production-down alert or a
Dependabot deploy could wait about ten hours.

`workers-cron/` is a Worker (`settimes-cron`) with Cron Triggers. Each trigger
POSTs `workflow_dispatch` (`{"ref":"main"}`) to the GitHub API for one workflow.
It has no routes, no `workers.dev` URL and no bindings; `fetch` answers 404.

| Cron (UTC)     | Workflow               |
| -------------- | ---------------------- |
| `0 * * * *`    | `site-health.yml`      |
| `*/30 * * * *` | `deploy-reconcile.yml` |
| `17 7 * * *`   | `scheduled-jobs.yml`   |

The workflows keep their own `schedule:` triggers as a fallback, so a missed
Worker run is still covered, late. A double start is safe:

- `site-health.yml` and `deploy-reconcile.yml` already had `concurrency` groups
  (`cancel-in-progress: false`); `deploy-reconcile` also re-reads existing
  deploy runs before dispatching anything.
- `scheduled-jobs.yml` had none; it now has `scheduled-jobs`. Its handler is
  idempotent: aggregation recomputes totals from source rows, retention and
  anonymisation delete or relabel by age, and share-link expiry folds in one
  batch under one cutoff.

A non-204 answer or a missing token makes the invocation throw, so Cloudflare
marks the cron run failed (Workers dashboard, Triggers, Cron events).

## The token

`GH_DISPATCH_TOKEN` is a Worker secret, never in the repo. Use a fine-grained
personal access token limited to this repository with **Actions: Read and
write** and nothing else (Metadata read is implicit). Set an expiry and note it.

Rotate (or first set):

1. Create the new token on GitHub.
2. `cd workers-cron && npx wrangler secret put GH_DISPATCH_TOKEN`, paste it.
   The next cron run uses it; no redeploy.
3. Revoke the old token. Confirm the next hourly run appears in Actions as a
   `workflow_dispatch` run.

A 401 or 403 in the Worker's logs means the token expired or lost its scope.

## Deploy

`cd workers-cron && npm ci && npx wrangler deploy`. Adding a cron means three
edits that must agree: `wrangler.toml`, `CRON_WORKFLOWS` in `src/index.js`, and
a `workflow_dispatch:` trigger on the workflow.
