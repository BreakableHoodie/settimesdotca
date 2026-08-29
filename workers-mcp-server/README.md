# settimesdotca-mcp

An MCP tool surface over the **production** D1 database, deployed as a Cloudflare
Worker and consumed by the `settimesdotca` entry in `.mcp.json`.

## Read this before changing anything

Every tool here reads live production data — users, active sessions, the auth
audit log, authentication attempts. The Worker is bound to
`settimes-production-db` directly, not to a replica.

## Why this directory was untracked, and why that was wrong

Until this commit `.gitignore` excluded `workers-mcp-server/` wholesale — the
right instinct (keep `node_modules/` and a secret out of git) applied at too
coarse a granularity. The consequence was that a **deployed, privileged service
had no source in any repository**. It could not be rebuilt after a laptop
failure, reviewed by anyone, or scanned by CodeQL, Dependabot, gitleaks or
semgrep, because git did not know it existed.

The source here was **reconstructed from the deployed bundle** (version
`ed8c71c5`, uploaded 2026-04-29) via the Cloudflare API, and `wrangler.toml`
from the deployed Worker's settings. Behaviour is preserved verbatim with one
exception, below.

## The one behavioural change: `queryDB` now enforces read-only

The deployed guard was a prefix test:

```js
if (!sql.trim().toLowerCase().startsWith("select")) throw ...
await this.env.DB.prepare(sql).all();
```

D1's `.prepare().all()` executes **every** statement in the string. Verified
against the live Worker with read-only payloads:

```text
"SELECT 1 AS first; SELECT 2 AS second"  ->  [{"second":2}]
"SELECT 1; SELECT * FROM __nope__"       ->  D1_ERROR: no such table
```

The second is conclusive — execution reached statement two. So anything after
`SELECT 1;` ran against production, including DML and DDL, despite the tool
advertising read-only.

This is not a remote vulnerability: `SHARED_SECRET` is required and the Worker
returns 401 to a missing, wrong, or empty token. It is a failure of the bound
that is supposed to contain a *token holder* — which includes any AI agent
using this MCP server.

`src/sqlGuard.js` replaces it, and `__tests__/sqlGuard.test.js` keeps it shut.

## Deploying

```bash
cd workers-mcp-server
npm install
npx wrangler secret put SHARED_SECRET   # 64 chars exactly; workers-mcp requires it
npx wrangler deploy
```

`SHARED_SECRET` is never stored here. `.dev.vars` is gitignored and holds the
local copy.

**Rotating the secret invalidates every configured MCP client**, including the
`settimesdotca` entry in `.mcp.json`, which must be updated in the same pass.
