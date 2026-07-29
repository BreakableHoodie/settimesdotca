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
// A single upward step larger than this is not a finger drag — it is a viewport
// discontinuity (iOS URL-bar show/hide is ~60px, measured; rubber-band snap-back
// is larger still). Such steps are ignored entirely rather than counted, so a
// perturbation can never release the ratchet no matter how large.
const UP_STEP_MAX_PX = 24

// Cumulative upward drag required to release the ratchet. Comfortably above the
// 6-12px jitter measured during momentum scrolling, and small enough that a
// deliberate flick upward responds within roughly one thumb movement.
const UP_RELEASE_PX = 64

export function useScrollCollapse(start, end) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let frame = null
    // Collapse is monotonic while scrolling DOWN: scroll position is perturbed
    // constantly on iOS (URL bar, momentum, rubber-band) and tracking it
    // directly re-expands the block mid-scroll (#690).
    //
    // But a pure ratchet made scrolling UP dead — the block stayed collapsed
    // until scrollY reached `start`, then snapped open in one step. So the
    // ratchet also releases on DELIBERATE upward scroll, after which progress
    // tracks scroll again and the block expands gradually.
    //
    // Magnitude alone cannot tell a deliberate drag from a perturbation: a
    // URL-bar shift is ~60px, comparable to a real flick. The difference is
    // SHAPE — a URL-bar shift arrives as one discontinuity, a finger drag as
    // many small increments. So only steps small enough to be a drag
    // accumulate, and a single large jump contributes nothing.
    let ratchet = 0
    let lastY = window.scrollY || 0
    let upAccum = 0
    const update = () => {
      frame = null
      const y = window.scrollY || 0
      const raw = Math.min(Math.max((y - start) / (end - start), 0), 1)
      const dy = y - lastY
      if (dy > 0) {
        upAccum = 0
      } else if (dy < 0 && -dy <= UP_STEP_MAX_PX) {
        upAccum += -dy
      }
      lastY = y
      if (y <= start) {
        upAccum = 0
        ratchet = 0
      } else if (upAccum >= UP_RELEASE_PX) {
        ratchet = raw
      } else {
        ratchet = Math.max(ratchet, raw)
      }
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
