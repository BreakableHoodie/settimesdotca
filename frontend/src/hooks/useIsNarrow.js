import { useEffect, useState } from 'react'

// Tailwind's `sm` breakpoint. The schedule switches presentation here: a compact
// board row below it, the full card at and above it.
const NARROW_QUERY = '(max-width: 639px)'

/**
 * True when the viewport is narrower than Tailwind's `sm` breakpoint.
 *
 * WHY A HOOK RATHER THAN `sm:hidden` / `hidden sm:grid`.
 *
 * The obvious CSS-only approach renders BOTH presentations and hides one. That
 * doubles the DOM, and jsdom applies no media queries, so under test every band
 * appeared twice: seven existing tests broke on "Found multiple elements",
 * including the #542 day-tab suite and the documented "never a lone Day 1
 * control" invariant. Rewriting those queries as `getAllBy` would have left
 * every count assertion permanently ambiguous about which copy it counted.
 *
 * Choosing at runtime keeps exactly one node per band, so those assertions stay
 * meaningful and the page ships half the markup.
 *
 * DEFAULTS TO FALSE (the card) when `matchMedia` is unavailable — jsdom without
 * a stub, or any non-browser render. That is deliberate: the card is the richer
 * presentation, so an environment that cannot answer the question gets the one
 * that omits nothing. A test wanting the board stubs `window.matchMedia`.
 */
export function useIsNarrow() {
  const [isNarrow, setIsNarrow] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(NARROW_QUERY).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mql = window.matchMedia(NARROW_QUERY)
    const onChange = event => setIsNarrow(event.matches)
    // Re-read on mount: the viewport can differ from the initial state after
    // hydration, an orientation change, or a resize between render and effect.
    setIsNarrow(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isNarrow
}
