# Ssr identity meta

Moved verbatim from `CLAUDE.md` on 2026-10-16, when it passed the 150k-character
limit. `CLAUDE.md` keeps the rules; this file keeps the incidents, measurements
and reasoning behind them. Read it before changing the code a section guards.

## SSR owns identity meta and JSON-LD where it emits either; the client `<Helmet>` owns only what SSR does not emit — never canonical/`og:*`/`twitter:*`/description, and never JSON-LD on a route whose SSR handler already emits it

`<Helmet>` only manages tags it created itself, marked internally with `data-rh`. Neither `index.html`'s baked-in defaults nor a Pages Function's server-injected `<meta>`/`<link>` carry that marker, so Helmet can't tell it already owns the slot — it **appends** a second copy on mount instead of replacing the first. `/artists` first showed this as `index.html`'s homepage `og:url="https://settimes.ca/"` sitting ahead of the page's own client-declared canonical: Google reads `og:url` as a canonicalization hint, prefers the first tag, and overrode our canonical — surfacing in Search Console as **"Duplicate, Google chose different canonical than user."**

The fix has two parts:

1. **`serveWithInjectedMeta()`** (`functions/utils/ssrMeta.js`) strips `index.html`'s baked-in defaults via `DEFAULT_META_RE` _before_ injecting page-specific tags, so a crawler that never executes JS sees exactly one of each. **Every `og:*`/`twitter:*`/`description` property `index.html` declares must be listed in `DEFAULT_META_RE`** — the moment a Pages Function starts emitting a property `index.html` already has (`og:site_name` was the case that caught this, #784), an unstripped default turns into a second, live copy instead of a silent gap.
2. **The client `<Helmet>` on every SSR-injected route must not declare `canonical`, `og:*`, `twitter:*`, or `description`** — SSR is the single owner of identity meta, full stop, not merely "must agree with the client." `<Helmet>` may still set `<title>` (backed by the direct `document.title = ...` assignment above — same React 19 unreliability), but **when it does, the string must replicate the SSR `<title>` formula verbatim, and the assignment must be gated on the data having loaded** (#785): before the fix, the client's loading-state title replaced the server-sent title mid-render, so crawlers that execute JS (Googlebot's rendering queue) could register a title different from the raw-HTML one. `BandProfilePage.jsx` and `App.jsx`/`EventRecapPage.jsx` (which gate on `loading`) are the enforced pattern; `functions/api/venues/[id].js` exposes `city` precisely so the venue client title can reproduce `functions/venue/[id].js`'s formula. `ssrIdentityMeta.test.jsx` seeds the SSR `<title>` and asserts it survives mount (including with the fetch still in flight) — do not drop that deferred-fetch case when touching title effects. **The same rule applies to JSON-LD on any route whose SSR handler passes a `jsonLd` block** — `/band/*` and `/venue/*` duplicated their `MusicGroup`/`MusicVenue` schema client-side the same way until #790; the client copy is deleted, not merely trimmed, once SSR emits an equivalent (`functions/band/[id].js`'s JSON-LD `description` was truncated to the 200-char SERP length shared with `<meta name="description">` — fixed to a separate, untruncated value before the client copy was removed, since 44 of 62 artist bios in production exceed 200 chars). A route whose SSR handler passes no `jsonLd` (the `STATIC_PAGES` registry pages, the recap page) keeps its JSON-LD, if any, client-owned.

   **The rule is "SSR owns what SSR emits," not "the client may only own `<title>`."** A tag no SSR handler emits stays client-owned and must not be deleted in an ownership sweep — deleting it drops the tag rather than de-duplicating it. `BandProfilePage.jsx`'s `<meta name="keywords">` was the worked example: it had no SSR equivalent, so it correctly survived #790's ownership sweep — and was then removed by **#797** on the unrelated grounds that search engines have ignored `keywords` since 2009. Deleting it _for the ownership reason_ would have been the error; deleting it because the tag is dead everywhere is not. That page's `<Helmet>` (and its `react-helmet-async` import) went with it, since the tag was its only child. This is the same trap as `og:site_name` in #784.

The rejected alternative was marking SSR-injected tags `data-rh="true"` so Helmet would adopt and replace them instead of appending. Rejected because it makes canonical correctness depend on Helmet _reliably adopting and replacing_ tags it didn't create — the exact behavior already documented above as unreliable for `document.title` in React 19. Inverting ownership removes the duplicate class entirely without depending on Helmet's replace behavior working.

**Tradeoff, accepted:** since SSR only injects meta into the initial HTML response, identity meta now freezes at whatever that response's values were across client-side (in-app) navigation between SSR-injected routes — refreshed only by a full-page load. This doesn't affect crawlers or link-unfurl bots, which always fetch the specific URL fresh; it only affects a live DOM read after in-app navigation, which nothing in this codebase does.

- **Every indexable route needs a Pages Function that injects its own meta**, except `/`, whose `index.html` head already is its correct meta (its Function injects body links only; see below). `/event/*`, `/band/*`, `/venue/*` have always had one; the eight static pages go through the `STATIC_PAGES` registry in `functions/utils/staticPageMeta.js`, one 2-line route file each; `/events/*/recap` (the archive recap page, distinct from singular `/event/*`) is D1-backed like `/event/*`/`/band/*`/`/venue/*` rather than registry-driven — `functions/events/[slug]/recap.js` — because its title/description embed per-event stats (`total_sets`, `venue_count`) a static registry entry can't express.

  **"Has a Function" is not the same as "the Function server-renders the URL people actually link to."** `/band/*` had a handler from the start, but it bailed to the un-injected shell for any non-numeric id — and _every_ public link to an artist is slug-built (`buildBandProfileHref`, used by ArtistsPage, StatsPage, EventRecapPage, EventTimeline, BandCard), while only the sitemap used the id form. So Googlebot crawled `/band/<slug>`, got 200 with the **homepage** title and no canonical, and 14 of them entered the index as duplicates of their own `/band/<id>` page — one ranking at position 49, two drawing clicks. `BandProfilePage` corrected the URL client-side, so the fix existed only after JS ran. Fixed in #983: `functions/band/[id].js` now resolves the slug through `normalizeBandName` (which agrees with `slugifyBandName` by construction — both reduce to `/[a-z0-9]/`) and **301**s to `/band/<id>`, query string preserved.

  Three things about that fix are load-bearing and easy to undo:
  - **The `Location` is relative**, deliberately breaking the `CANONICAL_HOST` rule two bullets down. That rule stops a preview deploy self-_canonicalising_; an absolute `Location` would _bounce_ preview and `www` traffic to production mid-request. Canonicals pin the host; redirects preserve it.
  - **The public-data gate runs before the lookup.** A redirect that fires only for real slugs is an existence oracle even when it leaks no field values.
  - **An unresolvable slug still renders the shell**, not a 404 — it may be a renamed artist whose old URL is still linked.

  `functions/venue/[id].js` carries the identical numeric guard and is safe only because every venue link is id-built. Adding a `/venue/<slug>` link builder without also adding the redirect reintroduces the whole class — there is a comment in that file saying so.

- **Before deleting a tag from a page's `<Helmet>`, confirm SSR emits an equivalent** — the ownership sweep isn't just "delete the client copy." `og:site_name` existed only in two pages' old client Helmet (`SubscribePage.jsx`, `App.jsx`'s `/event/:slug`) and had no SSR equivalent anywhere; deleting it outright would have silently dropped the tag rather than de-duplicating it. Two other disagreements surfaced the same way on `/event/:slug`: the old client `og:type="event"` (invalid without Facebook's required `event:start_time`/`event:end_time` properties, which this route never emitted) and `twitter:card="summary"` (no image) lost to SSR's already-established, spec-valid `og:type="website"` / `twitter:card="summary_large_image"` — the more complete value wins once there's only one.
- **`/` has a dedicated Function for body links only.** `index.html`'s baked-in defaults _are_ the homepage's correct meta, and `EventsPage` keeps full client-side ownership of its identity meta there. `functions/index.js` injects current-event links into the existing `<noscript>` nav. It preserves the shell's `<head>` byte-for-byte and its **policy** headers (CSP, HSTS, COOP/CORP, frame options, `Cache-Control`), sets `Content-Type`, and **drops the representation headers** that describe only the original bytes: `ETag`, `Last-Modified`, `Content-Length`, `Content-Encoding`. Every handler that rewrites the shell uses `headersForRewrittenShell()` (`functions/utils/ssrMeta.js`) for this. Copying the shell's `ETag` onto a rewritten body labels new content with old validators, and production hides that only because the edge strips the header (#1163 review).
- **The singular/plural prefix split is deliberate — do not "unify" it.** `/event/:slug` is the live event page; `/events/:slug/recap` is the archive recap, a _different resource_. Both are SSR-injected, listed in `_routes.json`, and emitted into `sitemap.xml`, so both are indexed. Anything that constructs an event URL — digest emails, share links, structured data — must pick the right prefix; building the wrong one is how #562 shipped broken links in digest emails, and it reads as an oversight precisely because nothing said otherwise. It is not one: an indexed URL is an external contract in the same way the public API paths and the `band_profiles` table name are, and migrating it would cost permanent 301s, a sitemap change, an SSR handler move and `_routes.json` surgery to buy guessability on the least-trafficked public surface we have. Declined deliberately in #910.

- **Build every URL from `CANONICAL_HOST`, never `request.url`** — preview deploys must not self-canonicalise.
- **`_routes.json` `exclude` beats `include`.** A path listed in both never reaches its Function, and the page silently regresses to the shared shell. The guard test in `functions/__tests__/staticPageMeta.test.js` scans `_routes.json` and fails if an included path lacks either a route file or a registry entry. **The file is `frontend/public/_routes.json`, and it is the only one** — `wrangler.toml` sets `pages_build_output_dir = "frontend/dist"`, so Cloudflare reads the copy Vite emits from `frontend/public/`. A second, stale `/_routes.json` sat at the repo root until #786; it listed only `/api/*` and `/s/*`, so anyone reading it would have concluded the SSR routes were never wired up. Do not recreate one — a root copy is dead on arrival and actively misleading.

Mocked unit tests prove the handler _builds_ correct HTML; they cannot prove Cloudflare _dispatches_ to it, and a pure string assertion on the SSR response can't prove Helmet doesn't duplicate it after mount. Verify routing changes against a real `npx wrangler pages dev --port 8788` and diff the tag counts per path; `frontend/src/pages/__tests__/ssrIdentityMeta.test.jsx` covers the mount side — it seeds `document.head` with the tags SSR would have injected, mounts the real page component the same way `main.jsx` does (`createRoot`, not `hydrateRoot` — this app is client-rendered, not server-rendered; see that file's header comment), and asserts exactly one `canonical`/`og:url` survives (plus, on `/band/*` and `/venue/*`, exactly one JSON-LD `script` per `@type`).

## The sitemap is the event-discovery signal — spend it (#1158)

**Until #1159, no page on this site emitted a single crawlable `<a>`.** Verified
2026-09-10 against production: `/`, `/events`, `/artists`, `/event/*` and
`/band/*` all returned **zero** anchors in raw HTML, because
`serveWithInjectedMeta()` injects into `<head>` only and the `<body>` stays an
empty `#root`. Googlebot renders JS, so pages _did_ get indexed — but every
link-derived signal was absent, and Search Console confirmed it: an indexed
page's sole `referring_urls` entry was `https://settimes.ca/sitemap.xml`.

`frontend/index.html` now ships a `<noscript>` nav covering the static,
parameterless routes, so every page carries a link graph in raw HTML. Three
things about it are load-bearing:

- **`<noscript>`, not a plain element.** React only replaces `#root`, so markup
  placed beside it renders _alongside_ the app's own nav for every JS visitor.
  The links are still parsed in the raw-HTML pass, and a scripting-off visitor
  gets real navigation instead of a blank page.
- **Every href must be a real `<Route path>` in `main.jsx`.** `/events` is the
  trap — it reads like the event list but is **not** a route; the list lives at
  `/`. `frontend/src/__tests__/crawlableLinks.test.js` enforces this, because
  linking a 404 spends a discovery signal on a dead end.
- **Only parameterless routes.** A static shell cannot know a slug.

**The event-specific link is now injected by the homepage Function.** It links
current public events in the existing raw-HTML `<noscript>` nav and changes
body links only: the shell's `<head>` is unchanged, policy headers are kept,
representation headers are dropped and `Content-Type` is set
(`headersForRewrittenShell()`). The sitemap remains the primary event-discovery signal; the
homepage link is the strongest internal signal for which edition matters now.

So `functions/sitemap.xml.js` is still the primary event-discovery signal, with
the homepage's event links as the internal one.

Which is why events are no longer emitted at a flat `weekly` / `0.8`. That rate
made the live edition indistinguishable from four archived ones — twenty URLs
sharing a priority — and `/event/lwbc18` sat `Discovered - currently not
indexed`, `last_crawled: null`, **31 days before the event**, while an older
recap page was indexed fine.

| event state          | priority | changefreq |
| -------------------- | -------- | ---------- |
| published, upcoming  | `1.0`    | `daily`    |
| concluded / archived | `0.5`    | `monthly`  |

Three things not to undo:

- **`changefreq` matters as much as `priority`.** An upcoming event's lineup and
  set times change daily; `weekly` told Google to check back less often than
  reality warrants.
- **A concluded event's `0.5` sits just under its own recap page's `0.6`, on
  purpose.** Once an edition is over, the recap — with its per-event stats — is
  the better answer than the schedule page.
- **`is_concluded` comes from the shared SQL predicate** (`concludedEventSql()`),
  not a local date compare, so this cannot drift from the recap API or the recap
  SSR route. That drift is exactly what #787 fixed.

The tests assert the two states **differ**, not that each has some value — a
test that only checked "the URL is present" passed with the priorities
identical, which is how the flat rate survived this long. Both halves are in the
mutation gate.

**#1159 narrowed this, and #1163 closes the missing event link.** The shell now
carries a crawlable link _spine_, and `functions/index.js` adds current public
event links at request time without disturbing homepage meta ownership. The
sitemap remains the event-specific discovery signal and its priorities are still
worth this much attention.

## SSR owns identity meta and JSON-LD where it emits either; the client `<Helmet>` owns only what SSR does not emit — never canonical/`og:*`/`twitter:*`/description, and never JSON-LD on a route whose SSR handler already emits it — `CLAUDE.md` text as of 2026-10-24

`<Helmet>` manages only tags it created (`data-rh`), so it **appends** a second copy of any tag that `index.html` or a Pages Function put there. A duplicate `og:url` once overrode our canonical ("Duplicate, Google chose different canonical than user"). Ownership is therefore split by who emits:

- **`serveWithInjectedMeta()`** (`functions/utils/ssrMeta.js`) strips `index.html`'s defaults via `DEFAULT_META_RE` before injecting. Every `og:*`/`twitter:*`/`description` property `index.html` declares must be listed there, or its default becomes a live second copy (`og:site_name`, #784).
- **On SSR-injected routes the client `<Helmet>` declares no `canonical`, `og:*`, `twitter:*` or `description`**, and no JSON-LD where the SSR handler passes `jsonLd` (`/band/*`, `/venue/*`, #790). It may set `<title>`, but only with the SSR formula verbatim and only once data has loaded (#785); `functions/api/venues/[id].js` exposes `city` so the venue title can reproduce its formula. `ssrIdentityMeta.test.jsx` asserts this, including the fetch-in-flight case; keep that case. It mounts with `createRoot`, not `hydrateRoot`, because the app is client-rendered.
- **SSR owns what SSR emits; everything else stays client-owned.** Before deleting a tag from a `<Helmet>`, confirm SSR emits an equivalent, or the sweep drops the tag instead of de-duplicating it. `functions/band/[id].js`'s JSON-LD `description` is a separate, untruncated value: do not merge it with the 200-char meta description (most bios exceed it). Where the two disagreed, the complete, spec-valid value won (`og:type="website"`, `twitter:card="summary_large_image"`).
- Do not mark SSR tags `data-rh` so Helmet adopts them: that relies on the replace behaviour React 19 makes unreliable. Accepted tradeoff: identity meta freezes across in-app navigation; crawlers always fetch fresh.
- **Every indexable route except `/` has a Pages Function injecting its own meta:** `/event/*`, `/band/*`, `/venue/*`, `/events/*/recap` (D1-backed, `functions/events/[slug]/recap.js`) and the static pages through `STATIC_PAGES` (`functions/utils/staticPageMeta.js`, one 2-line route file each). `/` has `functions/index.js`, which injects event links into the `<noscript>` nav and leaves `<head>` byte-for-byte: `index.html`'s defaults are the homepage's correct meta, and `EventsPage` owns it client-side. Every shell-rewriting handler uses `headersForRewrittenShell()`: policy headers kept, `Content-Type` set, `ETag`/`Last-Modified`/`Content-Length`/`Content-Encoding` dropped.
- **The handler must server-render the URL people actually link to.** Artist links are slug-built, so `functions/band/[id].js` resolves a slug via `normalizeBandName` and **301**s to `/band/<id>`, query preserved (#983). The `Location` is relative on purpose (canonicals pin the host; redirects preserve it), the public-data gate runs before the lookup (else an existence oracle), and an unresolvable slug renders the shell, not a 404. `functions/venue/[id].js` is safe only because venue links are id-built; a `/venue/<slug>` link builder needs the same redirect.
- **`/event/:slug` (live) and `/events/:slug/recap` (archive) are different resources.** Anything building an event URL picks the right prefix (#562). Do not unify them (declined, #910).
- Build every URL from `CANONICAL_HOST`, never `request.url`.
- **`frontend/public/_routes.json` is the only routes file**, and `exclude` beats `include`. `functions/__tests__/staticPageMeta.test.js` fails if an included path lacks a route file or registry entry. Never recreate a root `/_routes.json`.

Mocked unit tests cannot prove Cloudflare dispatches to a handler. Verify routing changes against `npx wrangler pages dev --port 8788` and diff per-path tag counts.

Search Console evidence, the `/band/<slug>` incident and the rejected alternatives: `docs/field-notes/ssr-identity-meta.md`.

## Why BandProfilePage stopped being the `document.title` example

Moved verbatim from CLAUDE.md on 2026-10-27 (#1398) to free budget.

`BandProfilePage.jsx` was this example until #797 removed its `<meta name="keywords">` — the tag was its `<Helmet>`'s only child, so the wrapper and the `react-helmet-async` import went with it. That page now assigns `document.title` directly and declares no Helmet at all, which is why it no longer illustrates the pairing.
