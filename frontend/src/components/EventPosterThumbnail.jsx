import PosterImage from './PosterImage'

/**
 * EventPosterThumbnail — compact, click-to-enlarge poster thumbnail for the
 * live event page header (#655).
 *
 * `poster_url` (added in #616) was previously only ever visible on archived
 * events' recap pages — an uploaded poster silently did nothing on a
 * published/upcoming event's own page. This renders a small thumbnail near
 * the top of the event page; `onOpen` is expected to open an ImageLightbox
 * with the full-size poster (the untransformed `posterUrl` — the lightbox
 * intentionally bypasses PosterImage so the enlarged view isn't downscaled).
 *
 * Deliberately compact (~140-180px tall) rather than the recap page's larger
 * treatment: posters are portrait (3:4 or taller) and the live schedule must
 * stay above the fold on mobile — a full-width portrait poster here would
 * push it down. Renders nothing when posterUrl is absent/null, which is the
 * common case (most events have no poster yet).
 *
 * Must request a right-sized Cloudflare derivative, never the full-size
 * original. `width={200}` is tied to the `md:h-[180px]` cap below: a 3:4
 * portrait poster renders ~150px wide there, so the 200-wide 1x derivative
 * covers it and PosterImage's 400-wide 2x candidate covers retina. Resize the
 * thumbnail and this width has to move with it.
 */
function EventPosterThumbnail({ posterUrl, eventName, onOpen }) {
  if (!posterUrl) return null

  const label = eventName ? `${eventName} poster` : 'Event poster'

  return (
    <div className="flex justify-start">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${label}`}
        className="overflow-hidden rounded-lg border border-border bg-surface transition-opacity hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
      >
        <PosterImage
          src={posterUrl}
          alt={label}
          width={200}
          loading="lazy"
          className="h-[140px] w-auto object-contain sm:h-[160px] md:h-[180px]"
        />
      </button>
    </div>
  )
}

export default EventPosterThumbnail
