import { useEffect, useState } from 'react'

/**
 * Tracks `window.scrollY` and returns a 0..1 progress value for a
 * shrink-on-scroll transition — e.g. the site header's padding/shadow
 * collapse, or the live-event sticky bar's identity-block collapse (#665).
 *
 * `start`/`end` are `window.scrollY` pixel thresholds: progress is 0 below
 * `start`, ramps linearly to 1 at `end`, and clamps at 1 beyond it.
 *
 * Driven purely by `window.scrollY` — never by the collapsing element's own
 * measured height — so it can't feed back into itself and jitter. That
 * feedback loop is the classic sticky-collapse bug: if collapsing content
 * shortens the page, `scrollY` effectively shifts under the user, which
 * re-triggers the same collapse calculation and the layout oscillates.
 * Reading only the global scroll position keeps the function monotonic in
 * a value the collapse itself never changes.
 *
 * `requestAnimationFrame`-batched (one measurement per paint, not per
 * `scroll` event) and only commits a state update when the value moves by
 * more than 0.01, so repeated paints with no real change don't re-render.
 *
 * Callers should apply the returned progress via a CSS `transition-*`
 * utility (not a JS-timed animation) so the transition inherits the
 * sitewide `prefers-reduced-motion` rule in `index.css`, which collapses
 * every transition/animation duration to ~0 for users who request less
 * motion — there is nothing further this hook needs to do for that.
 */
export function useScrollCollapse(start, end) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let frame = null
    // Ratchet: progress only ever increases until the user returns to the top
    // region (scrollY <= start), where it resets and tracks scroll again.
    //
    // Without this the collapse is a direct function of raw scrollY, so ANY
    // perturbation of scrollY re-expands the block mid-scroll. On iOS that is
    // constant: the URL bar shows/hides while scrolling, moving the scroll
    // position ~60px, and momentum and rubber-band overscroll add smaller
    // jitter. Measured on WebKit at an iPhone viewport: a 62px jump swung the
    // block's opacity by 0.565 and its height between 194px and 251px; drift of
    // 6-10px swung opacity by 0.119. That reads as a jarring flicker.
    //
    // Smoothing (a CSS transition or a per-frame rate limit) would only ease
    // the snap — the block would still pulse. It must simply not re-expand
    // while the reader is working down the page.
    let ratchet = 0
    const update = () => {
      frame = null
      const y = window.scrollY || 0
      const raw = Math.min(Math.max((y - start) / (end - start), 0), 1)
      // Back at the top: release the ratchet so the block can expand again.
      ratchet = y <= start ? 0 : Math.max(ratchet, raw)
      setProgress(prev => (Math.abs(prev - ratchet) < 0.01 ? prev : ratchet))
    }
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    // iOS fires resize when the URL bar collapses; without this the block can
    // sit mid-collapse until the next scroll event.
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [start, end])

  return progress
}
