# Testing Safari/WebKit locally — field notes

> Moved out of `CLAUDE.md` on 2026-09-22 to keep it under the harness's
> 150k-char load limit. `CLAUDE.md` keeps the rules; this file keeps the
> evidence and history behind them. Edit both together.

`npx playwright install webkit` then pointing it at `http://localhost:8788`
renders a **blank page**. No page error, no failed assertion — `document.title`
is set, `#root` is empty, and the only signal is in the network log:

```text
REQFAIL https://localhost:8788/assets/index-*.js
  A TLS error caused the secure connection to fail.
```

**The cause is the `upgrade-insecure-requests` directive** at the end of the
**document** CSP — the `/*` rule in `frontend/public/_headers`, which is what
`/admin/login` matches. It tells the browser to rewrite every `http://`
subresource request to `https://`, where the dev server has no TLS listener, so
React never mounts.

Be precise about *which* CSP, because two different pairs are in play and the
words collide. "TWO sources" elsewhere in this file means `_headers` (documents)
versus `functions/_middleware.js` (API/Functions responses) — and it is the
`_headers` one that matters here, since this is about a document load.
Separately, `_headers` itself carries two CSP rules: `/*` and an `/embed/*`
override that unsets and replaces it. The directive appears in both `_headers`
rules, but `/*` is the one that produces this failure.

**It is NOT HSTS, and the difference matters.** The first version of this
section blamed `Strict-Transport-Security`, which is wrong on the spec and wrong
on the evidence. RFC 6797 §7.2 requires a UA to **ignore** an STS header
received over non-secure transport, so the header this page sends over http was
never going to register a policy. Caught by CodeRabbit on #1134; the mechanism
had been asserted from plausibility, never tested.

The experiment that settles it — strip exactly one header, rewrite nothing, and
count upgraded requests:

| variant | React mounted | upgraded requests |
|---|---|---|
| baseline | no | 12 |
| strip HSTS only | **no** | **12** |
| strip CSP only | **yes** | **0** |
| strip both | yes | 0 |

And the engine split, with headers untouched:

| engine | mounted | upgraded |
|---|---|---|
| Chromium | yes | 0 |
| WebKit (Playwright 1.62.1 / WebKit 26.5) | no | 12 |

Chromium treats `localhost` as a potentially-trustworthy origin and skips the
upgrade; this WebKit build does not. That engine difference is the whole reason
the trap is invisible until someone tries Safari.

**Production is unaffected and this is not a bug to "fix".** Production is
genuinely https, so the directive is doing its job there. Do not weaken it, and
do not weaken HSTS either (see the Cloudflare table — HSTS is application-served
on purpose, and the zone toggle reading "off" is expected).

Strip the CSP in-flight for the test instead. Nothing on disk changes, and **no
URL rewriting is needed** once the right header is removed:

```js
await ctx.route('**/*', async (route) => {
  const res = await route.fetch()
  const h = { ...res.headers() }
  delete h['content-security-policy']
  await route.fulfill({ response: res, headers: h })
})
```

Also use `waitUntil: 'domcontentloaded'`, never `'networkidle'` — the service
worker keeps a connection open and networkidle never fires in WebKit.

Note what this costs: the page then runs **without** CSP, so this harness cannot
test anything CSP governs. It is for layout and rendering questions only.

Results from 2026-09-09, stated with the exact conditions rather than a summary
of them. All runs used the standard local setup — `wrangler pages dev
frontend/dist --port 8788` against a seeded local D1, origin
`http://localhost:8788`, same build — and differ only in the header mutation:

| run | mutation | WebKit edge |
|---|---|---|
| A | delete `strict-transport-security`; rewrite the upgraded `https://` request URL back to `http://` before fetching. **CSP served and enforced.** | rgb(113,116,123), **3.75:1** |
| B | delete `content-security-policy`; no URL rewriting (the recipe above). **CSP absent.** | rgb(113,116,123), **3.74:1** |

Run A came first and its mutation was chosen for the wrong reason — the HSTS
delete did nothing, and the URL rewrite was what made it load. It is still a
valid measurement, and "CSP enforced" there is verified rather than assumed:
re-running run A's exact interception showed the header on **17** responses,
**18** upgraded requests (so `upgrade-insecure-requests` was live), and an
injected inline `<script>` **refused** to execute —

```text
Refused to execute a script because its hash, its nonce, or 'unsafe-inline'
does not appear in the script-src
```

which is enforcement, not mere presence. The 0.01 gap from run B is sampling
noise on the same pixel.

**Two runs under opposite CSP conditions agreeing is the useful part** — it says
CSP does not govern this rendering, which is what makes run B's simpler recipe
safe to recommend for layout questions.

Chromium measured rgb(113,115,123), **3.71:1**, unmutated, and sticky held at
the same offsets across scroll in both engines. So the `border-collapse` +
sticky interaction documented under the roster edges is a spec behaviour both
engines share, not a Chromium quirk.
