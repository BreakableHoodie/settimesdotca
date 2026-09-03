# ZAP Security Header Fixes — Design Spec

> **SUPERSEDED IN PART — do not apply section 2 as written.**
>
> This spec recommends adding `Cross-Origin-Embedder-Policy: require-corp` to the
> global `/*` rule. **That is now forbidden.** COEP blocks the Turnstile iframe,
> which does not send COEP, and `credentialless` is not supported in Safari. The
> app needs no cross-origin isolation. See the Content-Security-Policy section of
> `CLAUDE.md` for the live rule.
>
> The rest of the document — the `img-src` tightening and the `/embed/*`
> override — still reflects what shipped. Kept as a record of the decision and
> its reversal, not as instructions.


**Date:** 2026-05-25  
**Source:** ZAP Baseline Scan, Issue #301  
**Scope:** `frontend/public/_headers` only

---

## Problem

ZAP baseline scan surfaced three actionable findings:

1. **CSP: Wildcard Directive** — `img-src` uses `https:` (any HTTPS host), weakening XSS containment.
2. **Cross-Origin-Embedder-Policy missing** — COEP not set on page responses; leaves the door open to Spectre-class side-channel attacks via embedded cross-origin resources.
3. **Embed page framing broken** (pre-existing) — The global `X-Frame-Options: DENY` + `frame-ancestors 'none'` silently blocks `/embed/:slug` from being loaded in an iframe, breaking the schedule-widget embed feature.

## Non-actionable findings (accepted or unfixable)

| Finding | Reason not fixed |
|---|---|
| `style-src 'unsafe-inline'` | Required by Tailwind 4 |
| `connect-src *.settimes.ca/*.pages.dev` | Host-pattern wildcards; needed for preview deploys; ZAP 10055 doesn't fire for them |
| CDN CORP / Permissions-Policy | Cloudflare-controlled `/cdn-cgi/` resources; `_headers` can't affect them |
| Cross-Domain Misconfiguration | Likely Cloudflare auto-inserting CORS on static assets; no `_headers` lever |
| COOP missing on sitemap | `/*` rule already sets it; likely ZAP false positive on XML response |

---

## Changes

All changes are in `frontend/public/_headers`.

### 1. Narrow `img-src` wildcard

The only external image source is the R2 CDN. Replace the permissive scheme source with the specific host.

```text
# before
img-src 'self' data: https: blob:

# after  
img-src 'self' data: blob: https://band-photos.settimes.ca
```

### 2. Add COEP to global rule

```text
# add to /* section
Cross-Origin-Embedder-Policy: require-corp
```

### 3. Add `/embed/*` override section

Embed pages must be frameable by third-party sites. The override:
- Replaces the CSP with a version that uses `frame-ancestors *` (modern browsers honour this over `X-Frame-Options`)
- Sets `X-Frame-Options: SAMEORIGIN` (best available value; `_headers` can't unset a header)
- Opts out of COEP and COOP so the embedded page can interact with its parent frame

```text
/embed/*
  X-Frame-Options: SAMEORIGIN
  Cross-Origin-Embedder-Policy: unsafe-none
  Cross-Origin-Opener-Policy: unsafe-none
  Content-Security-Policy: <full CSP with frame-ancestors * instead of frame-ancestors 'none'>
```

---

## Testing

- Frontend build must pass (`npm run build --prefix frontend`).
- No unit or E2E tests cover `_headers` content directly; verify by inspecting response headers in a browser or via `curl -I` against the local wrangler dev server after deploy.
- Confirm `/embed/[slug]` renders inside an `<iframe>` after the change.

---

## Update 2026-06-22 — Issue #346 re-scan disposition

A later baseline re-scan (issue #346) surfaced no new *fixable* header bugs. Every
remaining finding is an intentional tradeoff, Cloudflare-injected, or informational,
so the resolution is to document each as accepted in `.zap/rules.tsv` (using ZAP
sub-alert IDs so the rest of each plugin keeps detecting real regressions):

| Finding (alertRef) | Disposition |
|---|---|
| CSP wildcard `img-src https:` (`10055-4`) | **Accepted.** Band photos may come from arbitrary HTTPS hosts (admin `photo_url` + R2). img-src can't execute script; `script-src`/`connect-src` stay `'self'`. |
| CSP no-fallback `frame-ancestors` (`10055-13`) | **Required** for `/embed/` (`frame-ancestors *`); embedder origins are open-ended. |
| Cross-Domain `ACAO: *` (`10098`) | **Accepted.** Cloudflare auto-injects on public static assets; our API uses a strict origin allowlist, never `*`. |
| COEP/COOP `unsafe-none` on `/embed/` (`90004-2/3`) | **Required** so the embedded iframe interacts with its third-party parent. |
| CORP / Permissions-Policy on Rocket Loader (`90004-1`, `10063`) | **Unfixable** — Cloudflare `/cdn-cgi/` resource, not reachable from `_headers`. |
| Non-Storable Content (`10049`), Re-examine Cache-control (`10015`) | **Informational** — intentional `no-store` on SPA HTML; correct public cache on `sitemap.xml`. |

### `img-src` decision (deferred hardening)

The `https:` wildcard was **kept**, not narrowed. Narrowing to
`https://band-photos.settimes.ca` would only be safe alongside locking the
`photo_url` validation to that host (otherwise admin-entered external photo URLs
silently fail CSP). That is a product decision — whether photos must be R2-only —
not a security necessity, and is left as deliberate future hardening.
