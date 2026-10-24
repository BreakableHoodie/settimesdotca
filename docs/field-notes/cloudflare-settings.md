# Cloudflare settings

Moved verbatim from `CLAUDE.md` on 2026-10-16, when it passed the 150k-character
limit. `CLAUDE.md` keeps the rules; this file keeps the incidents, measurements
and reasoning behind them. Read it before changing the code a section guards.

## Where Cloudflare-facing settings actually live

Most of what follows is **not** in `wrangler.toml` or any other file here — it
is Cloudflare-side state, silently undoable, with nothing in the repo to hint
that it mattered. That is why it is written down.

**The last row is the deliberate exception, and it is the point of the table.**
HSTS _is_ repo-managed; it appears here because the zone's own HSTS toggle reads
"off", so anyone auditing Cloudflare concludes it is missing and reaches for the
dashboard. The fix for anything HSTS-related is `frontend/public/_headers`, not
Cloudflare. Read the layer column before changing anything — it is what tells
you where to go:

| layer                    | where you change it                                                                 | items                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Zone settings**        | Cloudflare dashboard / API, zone `settimes.ca` (`77e5bb9ef071b25b9cb65885ed4b38e1`) | Rocket Loader, the `www` → apex redirect rule, SSL mode, minimum TLS                         |
| **DNS records**          | same zone, DNS tab                                                                  | the DMARC record                                                                             |
| **Pages project** config | Cloudflare Pages project `settimesdotca`                                            | environment variables                                                                        |
| **Account** resources    | Cloudflare account                                                                  | D1 databases                                                                                 |
| **This repository**      | `frontend/public/_headers`                                                          | **HSTS** — listed only because the zone toggle reading "off" is correct and looks like a gap |

- **Preview deployments bind only the scratch D1** (2026-10-13). `wrangler.toml`
  ends with an `[env.preview]` block, because Pages otherwise applies the top-level
  D1, R2 and Analytics Engine bindings to previews too, and every deploy
  overwrites the dashboard. Until then every preview was bound to
  `settimes-production-db` and the production photo bucket: 40 stale previews
  from Nov 2025 to Feb 2026, running code from before the pen-test fixes (#86)
  with no secrets set, sat on `*.longweekend-bandcrawl.pages.dev` against
  production data. They were deleted the same day. Never bind a production
  resource under `env.preview`; edge E2E (#1292) gets only the scratch D1 there.
  `scripts/__tests__/previewBindings.test.js` enforces both halves.
- **Rocket Loader: disabled** — strict CSP blocks the inline scripts it rewrites.
- **`www` → apex 301 redirect rule** (#984, added 2026-08-29). A zone
  `http_request_dynamic_redirect` phase ruleset, `www to apex (301, preserves
path + query)`:

  ```text
  if    (http.host eq "www.settimes.ca")
  then  redirect 301 -> concat("https://settimes.ca", http.request.uri.path)
        preserve_query_string: true
  ```

  Before it, `www.settimes.ca` served the entire site at HTTP 200 as a full
  duplicate of the apex, and both hosts ranked separately — the apex at 243
  impressions / position 12.2 against `www` at 40 / 21.2.

  Three things not to "simplify":
  - **It must be a _dynamic_ redirect, not static.** A static one sends every
    deep path to the homepage; the `concat(...)` expression is what carries
    `/band/31` across.
  - **Do not remove `www` as a Pages custom domain** to "clean up". The
    redirect can only answer if `www` still resolves and terminates TLS —
    removing it turns every old bookmark into a certificate error instead of a
    redirect.
  - **`/` still emits no raw-HTML canonical, deliberately** (see the SSR
    ownership section: the homepage keeps client-side ownership of its identity
    meta). That was survivable as a duplicate-host problem only because this
    rule now leaves one live host. If `www` ever stops redirecting, the
    duplicate returns and the canonical gap is what makes it bite.

- **SSL/TLS mode: Full (strict)**, and **minimum TLS version 1.2** (both set
  2026-08-29; they were `Full` and `1.0`). Strict is correct here because every
  proxied origin is Cloudflare-owned with a valid certificate — apex and `www`
  resolve to the Pages project, `band-photos` to `public.r2.dev`. Adding a
  proxied record pointing at an origin with a self-signed or expired cert will
  now fail closed rather than silently accept it, which is the intent.
- **HSTS is served by the application, not the zone.** `frontend/public/_headers`
  sends `max-age=31536000; includeSubDomains; preload`, so the zone-level HSTS
  toggle reading "off" is correct and **not** a gap. Do not "fix" it by enabling
  the zone setting as well; check the live header before concluding anything is
  missing.

**Removed 2026-08-29, recorded so they are not recreated by reflex:**

- `dev.settimes.ca` — a `CNAME` to tunnel `b94985aa…`, which no longer exists.
  It served HTTP 530 on the brand domain. The only live tunnel is a different id.
- `ADMIN_PASSWORD` and `MASTER_PASSWORD` Pages production environment variables.
  **Nothing read them** — every consumer in this repo uses `E2E_ADMIN_PASSWORD`
  (`scripts/seed-e2e-admin.mjs`), which is local-only. They were unused
  credentials sitting in production config.
- The `bandcrawl-db` D1 database — verified empty (only Cloudflare's internal
  `_cf_KV`, no user tables), referenced nowhere in the repo, bound to nothing.
  The only D1 database is `settimes-production-db`. Note the API's `num_tables`
  field is **not** trustworthy for this check: it reported `0` for the production
  database too. Query `sqlite_master` instead.

- **DMARC now reports** (added 2026-08-29). `_dmarc.settimes.ca` was
  `p=quarantine` with **no `rua=`** — enforcing a policy whose effects nobody
  could see, which is the worst of the two halves to have alone. `p` only
  _requests_ a disposition; each receiver decides for itself, and a message
  handled as suspicious typically produces no bounce and no error the sender
  ever sees. Failures are therefore silent by default, which is exactly why the
  reporting half is not optional.
  Now:

  ```text
  v=DMARC1; p=quarantine; adkim=r; aspf=r; pct=100; rua=mailto:dmarc@settimes.ca
  ```

  Reports go to an iCloud **catch-all**, so no alias had to be created, and
  because `rua` is on the _same_ domain as the record no external
  `settimes.ca._report._dmarc.<host>` authorization TXT is needed — that
  requirement only applies to a third-party reporting host.

  **`adkim=r` / `aspf=r` must stay relaxed.** The domain has two independent
  sending paths — iCloud for human mail (`sig1._domainkey`, `include:icloud.com`)
  and Resend via Amazon SES for application mail (`resend._domainkey`,
  `include:amazonses.com`, `send.settimes.ca`). Strict alignment would break the
  SES path. The application path is the one that matters operationally: it
  carries the **band-follow confirmation emails**, and since follows are double
  opt-in, silently quarantined confirmations mean followers are never verified
  and never receive announcements — with nothing anywhere reporting an error.

  Reports typically begin arriving within 24–48h and are XML, usually gzipped
  (compression is recommended by RFC 7489, not required — plain `.xml` is
  valid). Both are conventions, not guarantees: providers report on their own
  schedules and some never do. **If none arrive within a few days, treat that as
  a prompt to check whether the catch-all routes `dmarc@` — it is a signal to
  investigate, not proof of either a failure or of everything being fine.**

  Deliberately not set: `ruf=` (forensic reports carry recipient PII and almost
  no provider sends them), and `p=reject`, which is the stronger end state but
  should wait until a few weeks of reports confirm both sending paths pass
  cleanly.

## Where Cloudflare-facing settings actually live — `CLAUDE.md` text as of 2026-10-24

Most of this is Cloudflare-side state that can be silently undone, with nothing in the repo to show it mattered. Read the layer column before changing anything:

| layer                    | where you change it                                                                 | items                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Zone settings**        | Cloudflare dashboard / API, zone `settimes.ca` (`77e5bb9ef071b25b9cb65885ed4b38e1`) | Rocket Loader, the `www` → apex redirect rule, SSL mode, minimum TLS                         |
| **DNS records**          | same zone, DNS tab                                                                  | the DMARC record                                                                             |
| **Pages project** config | Cloudflare Pages project `settimesdotca`                                            | environment variables                                                                        |
| **Account** resources    | Cloudflare account                                                                  | D1 databases                                                                                 |
| **This repository**      | `frontend/public/_headers`                                                          | **HSTS** — listed only because the zone toggle reading "off" is correct and looks like a gap |

- **Preview deployments bind only the scratch D1**, via the `[env.preview]` block in `wrangler.toml` (2026-10-13). Without it, previews inherit production D1 and R2. Never bind a production resource there; `scripts/__tests__/previewBindings.test.js` enforces both halves.
- **Rocket Loader stays disabled**; strict CSP blocks the scripts it rewrites.
- **`www` → apex is a zone _dynamic_ 301** (`concat("https://settimes.ca", http.request.uri.path)`, query preserved, #984). A static redirect would send every deep path to `/`. Keep `www` as a Pages custom domain: without it, old links become TLS errors instead of redirects. `/` deliberately emits no raw-HTML canonical, so if `www` ever stops redirecting, the duplicate-host problem returns.
- **SSL/TLS is Full (strict), minimum TLS 1.2.** A proxied origin with a bad certificate fails closed, on purpose.
- **HSTS is served from `frontend/public/_headers`**, so the zone's HSTS toggle reading "off" is correct. Do not also enable the zone toggle; check the live header before concluding anything is missing.
- **DMARC:** `v=DMARC1; p=quarantine; adkim=r; aspf=r; pct=100; rua=mailto:dmarc@settimes.ca`. Alignment stays relaxed because iCloud (human mail) and Resend via SES (application mail, including band-follow confirmations) are both legitimate senders; strict alignment would quarantine confirmations silently. `p=reject` waits until reports show both paths pass. If no reports arrive within a few days, check that the catch-all routes `dmarc@`.
- Removed 2026-08-29; do not recreate: `dev.settimes.ca` (a dead tunnel), the unused `ADMIN_PASSWORD`/`MASTER_PASSWORD` Pages vars, and the empty `bandcrawl-db` D1. To check whether a D1 is empty, query `sqlite_master`; the API's `num_tables` is wrong.

Before-and-after evidence, the redirect rule and DMARC reasoning: `docs/field-notes/cloudflare-settings.md`.
