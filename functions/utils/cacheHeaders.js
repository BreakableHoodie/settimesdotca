/**
 * Cache-Control values for public GET responses.
 *
 * Two tiers, split by one question: **can this change while a show is running?**
 *
 * During an event the operator cancels sets, moves times, and swaps venues from
 * the admin (see docs/SHOW_DAY_RUNBOOK.md). Every second of TTL on a response
 * that carries live show state is a second a fan can be standing at the wrong
 * venue. These endpoints all sat at 300s while `api/schedule.js` — the busiest
 * of them — had already been dropped to 60s and made env-tunable. That gap was
 * an oversight, not a decision.
 *
 * **No `stale-while-revalidate` here, deliberately.** It is the obvious thing
 * to reach for and it is wrong for this purpose. Inside the SWR window a cache
 * serves the STALE response and revalidates asynchronously (RFC 5861), so the
 * fresh body only reaches the *next* request. A fan who opens the page once —
 * which is the normal case — would still read the cancelled set as playing, and
 * `max-age=60, stale-while-revalidate=300` would let that happen for up to 360s:
 * worse than the 300s this change exists to fix. Plain `max-age` blocks and
 * returns fresh data instead. SWR optimises latency; the goal here is freshness,
 * and the two pull in opposite directions.
 *
 * The 60s also matches `api/schedule.js`, which already defaults there.
 *
 * Note these are currently **browser** caches, not edge ones — Cloudflare
 * returns `cf-cache-status: DYNAMIC` for Pages Functions responses, so nothing
 * is held at the edge. Shortening the TTL therefore costs no CDN efficiency; it
 * only narrows the window a single client can hold a stale copy, and the extra
 * revalidations land on an origin that was already serving every request.
 */

/**
 * Anything rendering live show state: what is on now, what is next, set times,
 * cancellations, venue assignments.
 */
export const CACHE_SHOW_CRITICAL = "public, max-age=60";

/**
 * Browse and discovery surfaces carrying no live performance state — event
 * lists, artist and venue indexes, aggregate-only stats. A stale minute here
 * costs nothing, so these keep the longer TTL.
 *
 * "Stats" alone is not the test: `api/bands/stats/[name].js` is named for its
 * aggregates but also returns upcoming and past performances, cancellations and
 * venue assignments, so it belongs to CACHE_SHOW_CRITICAL. Any response that
 * carries live performance state does, whatever it is called.
 *
 * Its sibling `api/bands/[name].js` sat at a hardcoded 300s for the same
 * reason the stats route once did — the name says "band profile", but the
 * projection includes `p.start_time`, `p.end_time`, `p.is_cancelled` and the
 * venue name. Both now use CACHE_SHOW_CRITICAL. Judge the projection, not the
 * route name.
 *
 * `cacheHeaders.test.js` enforces this by scanning source: a public GET may not
 * hardcode a `max-age` matching either tier's value, and any route projecting
 * per-performance columns must import CACHE_SHOW_CRITICAL. Copy-pasting the
 * literal is what let the two tiers drift apart in the first place.
 */
export const CACHE_BROWSE = "public, max-age=300";
