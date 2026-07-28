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
  ...rest
}) {
  const [fellBack, setFellBack] = useState(false)
  const fellBackRef = useRef(false)

  const handleError = useCallback(() => {
    if (fellBackRef.current) return
    fellBackRef.current = true
    setFellBack(true)
  }, [])

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
}
