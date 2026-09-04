import PosterImage from './PosterImage'

/**
 * EventPosterThumbnail — compact, click-to-enlarge poster thumbnail for the
 * live event page (#655).
 *
 * `poster_url` (added in #616) was previously only ever visible on archived
 * events' recap pages — an uploaded poster silently did nothing on a
 * published/upcoming event's own page. `onOpen` is expected to open an
 * ImageLightbox with the full-size poster (the untransformed `posterUrl` —
 * the lightbox intentionally bypasses PosterImage so the enlarged view
 * isn't downscaled). Renders nothing when posterUrl is absent/null, which is
 * the common case (most events have no poster yet).
 *
 * Two layout variants, both rendered by `App.jsx` (desktop) and
 * `LiveContextBar` (mobile) rather than one responsive shape, because the
 * two surfaces have genuinely different jobs (#666):
 *
 * - `variant="standalone"` (default): a full-width row below the
 *   breadcrumbs — unchanged from the original #655 shape, sizing included.
 *   `App.jsx` wraps it in `hidden sm:block` for LIVE events only, because
 *   `LiveContextBar` (mobile-only `variant="inline"`) takes over there;
 *   ARCHIVED events skip `LiveContextBar` entirely, so `standalone` stays
 *   the only poster placement and must keep rendering at every width there.
 * - `variant="inline"`: sits beside the event title/stats inside
 *   `LiveContextBar`'s mobile-only identity block, `sm:hidden`. Mobile
 *   previously rendered `standalone` alone on its own row — 114x142px in a
 *   361px-wide container, 68% of the row empty — while still costing a full
 *   ~142px of vertical space. `inline` reclaims that dead width AND removes
 *   the extra row: the poster sits in the same row as the title/stats it
 *   used to sit above, at roughly that column's natural height instead of
 *   adding to it. It also participates in the identity block's
 *   scroll-collapse (#665) — a sticky-pinned poster after the fan starts
 *   scrolling the lineup would just be trading one wasted-space problem for
 *   another.
 *
 * Must request a right-sized Cloudflare derivative, never the full-size
 * original — the `width` passed to `PosterImage` must track whichever
 * variant's rendered height is in play:
 * - `standalone`'s `width={200}` is tied to its `md:h-[180px]` cap: a 3:4
 *   portrait poster renders ~150px wide there, so the 200-wide 1x
 *   derivative covers it and PosterImage's 400-wide 2x candidate covers
 *   retina.
 * - `inline`'s `width={80}` is tied to its LARGEST cap, `sm:h-[100px]`: a 3:4
 *   portrait poster renders ~75px wide there, so 80 covers the 1x case with a
 *   small margin for posters slightly wider than 3:4. Below `sm` the cap is
 *   `h-[64px]` and the same derivative over-covers, which is the safe
 *   direction. Size the width from the tallest variant, never the shortest.
 *
 * WHY MOBILE IS SHORTER (#1087). Inline sits BESIDE the title in a flex row
 * (#666), so the row is as tall as its tallest child, and at 100px the poster
 * was taller than the title+summary column (~61px) -- making it the only thing
 * setting that row's height. Measured on a 390px viewport against a
 * representative 15-act bill: 446px to the first act name with the poster at
 * 100px, 407px with no poster at all. The poster alone was 39px of the first
 * screen, on the page a fan holds in the street, against a budget saying half
 * that screen should be lineup. At 64px it no longer drives the row and is
 * still a comfortable tap target. Desktop is unchanged.
 *
 * Resize either variant and its `width` has to move with it.
 */
function EventPosterThumbnail({ posterUrl, eventName, onOpen, variant = 'standalone' }) {
  if (!posterUrl) return null

  const label = eventName ? `${eventName} poster` : 'Event poster'
  const isInline = variant === 'inline'

  return (
    <div className={isInline ? 'shrink-0' : 'flex justify-start'}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${label}`}
        className="overflow-hidden rounded-lg border border-border bg-surface transition-opacity hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
      >
        <PosterImage
          src={posterUrl}
          alt={label}
          width={isInline ? 80 : 200}
          // The inline variant renders in the sticky bar, above the fold — lazy
          // loading it would delay LCP and pop in. Standalone stays lazy.
          loading={isInline ? 'eager' : 'lazy'}
          fetchPriority={isInline ? 'high' : undefined}
          className={
            isInline
              ? 'h-[64px] w-auto object-contain sm:h-[100px]'
              : 'h-[140px] w-auto object-contain sm:h-[160px] md:h-[180px]'
          }
        />
      </button>
    </div>
  )
}

export default EventPosterThumbnail
