import { useCallback, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { posterImageUrl, posterImageSrcSet } from '../utils/posterImage'

/**
 * PosterImage — <img> wrapper that requests a right-sized Cloudflare image
 * transform derivative instead of the full-size poster original (#659).
 * Centralizes the transform + srcset logic so the listing thumbnail, the
 * recap poster, and the lightbox stay simple call sites with consistent
 * behaviour.
 *
 * `onError` falls back to the untransformed original, exactly once. If
 * image transforms are ever disabled on the zone, every `/cdn-cgi/image/`
 * URL on the site would 404 simultaneously — this makes that failure mode
 * invisible (degrades to the full-size original) instead of breaking every
 * poster on the site at once. The `fellBack` ref (not just state) guards
 * against looping if the fallback *also* fails to load: once tripped, the
 * handler is a no-op regardless of how many further error events fire for
 * this element, and the srcset is cleared alongside src so the browser
 * can't re-trigger a transform request via a listed candidate.
 */
export default function PosterImage({
  src,
  alt = '',
  width,
  className,
  loading = 'lazy',
  decoding = 'async',
  onError,
  onUnavailable,
  ...rest
}) {
  // A fallback belongs to the URL that failed, not to the component instance,
  // so each guard records WHICH src it is for: a PosterImage re-rendered with a
  // new poster starts clean without a reset. A reset effect keyed on src (the
  // old design) also ran on mount, and an error arriving before that effect
  // flushed was wiped by it, so the original's failure was taken for the
  // transform's and the broken image stayed (#1404).
  const [fellBackSrc, setFellBackSrc] = useState(null)
  const fellBackRef = useRef(null)
  const unavailableRef = useRef(null)
  const fellBack = fellBackSrc === src
  // A URL off the poster host has no transform: its FIRST error is already the
  // original failing, so there is nothing to fall back to (CodeRabbit, #1368).
  const hasTransform = posterImageUrl(src, width) !== src

  const handleError = useCallback(
    event => {
      // Compose rather than replace: a caller's own onError must still fire.
      // This runs first so the caller sees the error even if its handler
      // throws, and the ref guard below only suppresses OUR fallback
      // transition, never the caller's callback.
      onError?.(event)
      if (fellBackRef.current === src || !hasTransform) {
        // The untransformed original failed too: there is no poster to show.
        // A broken <img> sized by its alt text spread across the row and
        // pushed the event title off-screen (#1368), so callers hide their
        // whole wrapper instead. Reported once per src.
        if (unavailableRef.current !== src) {
          unavailableRef.current = src
          onUnavailable?.()
        }
        return
      }
      fellBackRef.current = src
      setFellBackSrc(src)
    },
    [onError, onUnavailable, hasTransform, src]
  )

  const resolvedSrc = fellBack ? src : posterImageUrl(src, width)
  const resolvedSrcSet = fellBack ? undefined : posterImageSrcSet(src, width)

  return (
    <img
      {...rest}
      src={resolvedSrc}
      srcSet={resolvedSrcSet}
      alt={alt}
      loading={loading}
      decoding={decoding}
      className={className}
      onError={handleError}
    />
  )
}

PosterImage.propTypes = {
  /** Original (untransformed) poster URL. */
  src: PropTypes.string,
  alt: PropTypes.string,
  /** Target render width in CSS pixels — used to pick the transform width and the 2x srcset candidate. */
  width: PropTypes.number,
  className: PropTypes.string,
  loading: PropTypes.string,
  decoding: PropTypes.string,
  /** Optional caller error handler. Composed with the internal fallback, not replaced by it. */
  onError: PropTypes.func,
  /** Called once when the original also fails: the caller should hide its wrapper (#1368). */
  onUnavailable: PropTypes.func,
}
