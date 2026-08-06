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
 * `stale-while-revalidate` is what makes the shorter TTL cheap: past 60s the
 * client still paints instantly from cache and refreshes in the background, so
 * a correction lands within about a minute without the origin taking a
 * thundering-herd of blocking revalidations.
 *
 * Note these are currently **browser** caches, not edge ones — Cloudflare
 * returns `cf-cache-status: DYNAMIC` for Pages Functions responses, so nothing
 * is held at the edge. Shortening the TTL therefore costs no CDN efficiency; it
 * only narrows the window a single client can hold a stale copy.
 */

/**
 * Anything rendering live show state: what is on now, what is next, set times,
 * cancellations, venue assignments.
 */
export const CACHE_SHOW_CRITICAL = "public, max-age=60, stale-while-revalidate=300";

/**
 * Browse and discovery surfaces carrying no live performance state — event
 * lists, artist and venue indexes, aggregate-only stats. A stale minute here
 * costs nothing, so these keep the longer TTL.
 *
 * "Stats" alone is not the test: `api/bands/stats/[name].js` is named for its
 * aggregates but also returns upcoming and past performances, cancellations and
 * venue assignments, so it belongs to CACHE_SHOW_CRITICAL. Any response that
 * carries live performance state does, whatever it is called.
 */
export const CACHE_BROWSE = "public, max-age=300";
