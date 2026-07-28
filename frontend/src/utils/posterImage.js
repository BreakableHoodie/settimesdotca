/**
 * posterImage.js — Cloudflare image-transform URL helper for R2-hosted event
 * posters (#659).
 *
 * Cloudflare image resizing is already enabled on the poster host
 * (`band-photos.settimes.ca`) via `/cdn-cgi/image/<options>/<original-path>`.
 * Full-size posters run 240KB-663KB; a ~96px-wide listing thumbnail has no
 * business downloading a 1440x1920 original. This rewrites a poster URL into
 * a right-sized, WebP-negotiated (`format=auto`) derivative so each call site
 * downloads roughly what it renders.
 *
 * Only URLs on the poster host are ever rewritten. Everything else — a
 * missing URL, a foreign host, or a URL that's already been through the
 * transform — passes through UNCHANGED. A malformed transform URL is worse
 * than a large original, so this never guesses at a rewrite it can't be sure
 * of.
 */

// Mirrors the production fallback default in
// functions/api/admin/events/posters.js and functions/api/admin/bands/photos.js
// (`env.BAND_PHOTOS_PUBLIC_URL || "https://band-photos.settimes.ca"`). Kept as
// a single exported constant so it's never re-typed as a literal elsewhere.
export const POSTER_IMAGE_HOST = 'band-photos.settimes.ca'

const TRANSFORM_MARKER = '/cdn-cgi/image/'

function parseUrl(url) {
  if (!url) return null
  try {
    return new URL(url)
  } catch {
    return null
  }
}

function isRewritable(parsed, width) {
  if (!parsed) return false
  if (parsed.hostname !== POSTER_IMAGE_HOST) return false
  if (parsed.pathname.includes(TRANSFORM_MARKER)) return false
  // Guard on the ROUNDED width, not the raw one: a positive sub-unit width
  // like 0.1 passes `> 0` but rounds to 0, which would emit `width=0` — a
  // meaningless transform. Rounding first keeps the guard and the emitted
  // value in agreement.
  return Number.isFinite(width) && Math.round(width) >= 1
}

/**
 * Rewrites a poster URL to a Cloudflare image-transform derivative at the
 * given pixel width, negotiating format (WebP where the client supports it)
 * via `format=auto`. Returns the input completely unchanged — never a
 * best-effort rewrite — when it isn't a poster-host URL, is already a
 * transform URL, or `width` isn't a positive finite number.
 */
export function posterImageUrl(url, width) {
  const parsed = parseUrl(url)
  if (!isRewritable(parsed, width)) return url

  const roundedWidth = Math.round(width)
  return `${parsed.origin}${TRANSFORM_MARKER}width=${roundedWidth},format=auto${parsed.pathname}${parsed.search}${parsed.hash}`
}

/**
 * Builds a 1x/2x `srcset` string for a poster URL, e.g.
 * `".../width=200,format=auto/... 1x, .../width=400,format=auto/... 2x"`.
 * Returns `undefined` when the base URL isn't rewritable — callers should
 * fall back to a plain `src` rather than emit a srcset that just repeats the
 * same URL at both densities.
 */
export function posterImageSrcSet(url, width) {
  const parsed = parseUrl(url)
  if (!isRewritable(parsed, width)) return undefined

  const oneX = posterImageUrl(url, width)
  const twoX = posterImageUrl(url, width * 2)
  return `${oneX} 1x, ${twoX} 2x`
}
