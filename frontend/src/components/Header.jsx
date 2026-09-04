import { memo, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useScrollCollapse } from '../hooks/useScrollCollapse.js'
import ThemeToggle from './ThemeToggle.jsx'
import VenueStrip from './VenueStrip.jsx'

// Enough for the title line alone -- the pre-measurement height. Used until
// the first layout pass and under jsdom, where scrollHeight is always 0.
const COLLAPSE_FALLBACK_HEIGHT = 56

function Header({ eventName, eventDate, selectedVenues, venues = [] }) {
  // No `weekday` (#681): a festival day runs 6 AM -> 6 AM, so an
  // after-midnight set's calendar weekday can mismatch the festival day a
  // fan is standing in — the month/day alone carries the same information
  // without that ambiguity.
  const formattedDate = eventDate
    ? new Date(`${eventDate}T12:00:00`).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
      })
    : null
  const scrollProgress = useScrollCollapse(20, 140)

  const headerPadding = Math.round(12 - 4 * scrollProgress)
  const headerStyle = {
    paddingTop: `${headerPadding}px`,
    paddingBottom: `${headerPadding}px`,
    boxShadow: `0 8px 24px rgba(4, 8, 16, ${0.14 * scrollProgress})`,
    // Driven from --color-bg-navy (was a hardcoded rgba(8,16,32,…) near-black
    // triplet) so the sticky header composites correctly on light themes too —
    // the hardcoded value put the title at ~2.6:1 on daybreak/silver-lining (#617).
    backgroundColor: `color-mix(in srgb, var(--color-bg-navy) ${Math.round((0.65 + 0.25 * scrollProgress) * 100)}%, transparent)`,
  }
  const titleScale = 1 - 0.12 * scrollProgress
  const fadeProgress = Math.min(1, scrollProgress * 1.75)
  // MEASURED, not a constant. This was a hardcoded 56px sized for the title
  // line alone; when the venue strip was added inside the same collapsing
  // block nobody raised the cap, so the strip's 72px was cut to 56 and every
  // venue label -- which sits below the circles -- was clipped away. The page
  // showed a row of unexplained dots for months.
  //
  // Measuring means the cap cannot fall behind the content again, which is the
  // failure being fixed rather than just its instance. scrollHeight reports
  // the full content height even while the element is clipped, so it stays
  // correct in the collapsed state too.
  const collapseRef = useRef(null)
  const [expandedHeight, setExpandedHeight] = useState(COLLAPSE_FALLBACK_HEIGHT)

  useLayoutEffect(() => {
    const el = collapseRef.current
    if (!el) return undefined

    // jsdom reports 0 for every layout measurement, and so does a block that is
    // `display: none` -- which this one IS below `sm`. Measuring only on mount
    // therefore leaves a phone-width render stuck on the fallback, and resizing
    // up to desktop would never re-measure because the effect's dependencies
    // have not changed. That reproduces the original clip on exactly the
    // desktop viewport this fix is for.
    //
    // A ResizeObserver covers it: an element going from no box to a box is a
    // resize, so the first desktop layout re-measures. Bailing on an unchanged
    // value keeps the scroll animation -- which changes maxHeight every frame,
    // and so fires this -- from re-rendering on every tick.
    const measure = () => {
      const measured = el.scrollHeight
      if (measured > 0) setExpandedHeight(previous => (measured === previous ? previous : measured))
    }

    measure()

    // Namespaced on `window` so the reference is explicit for both the linter
    // and a reader: jsdom has no ResizeObserver, and this must degrade to the
    // mount-time measurement there rather than throwing.
    if (typeof window === 'undefined' || typeof window.ResizeObserver === 'undefined') return undefined
    const observer = new window.ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [eventName, formattedDate, venues])

  const collapseStyle = {
    opacity: 1 - fadeProgress,
    transform: `translateY(${scrollProgress * -6}px)`,
    maxHeight: `${Math.round(expandedHeight * (1 - scrollProgress))}px`,
    overflow: 'hidden',
    marginTop: `${Math.round(8 * (1 - scrollProgress))}px`,
    pointerEvents: scrollProgress > 0.7 ? 'none' : 'auto',
  }

  return (
    <header
      className="sticky top-0 z-50 border-b border-accent-500/30 transition-[padding,box-shadow,background-color] duration-300 ease-out bg-linear-to-b from-bg-navy to-bg-purple backdrop-blur-xs"
      style={headerStyle}
    >
      <div className="container mx-auto max-w-(--breakpoint-2xl) px-4">
        <div className="flex min-h-[40px] items-center justify-between gap-3">
          <h1
            className="font-bold text-text-primary font-display tracking-tight text-[2rem] sm:text-3xl md:text-4xl text-left leading-tight transition-transform duration-300 ease-out"
            style={{ transform: `scale(${titleScale})` }}
          >
            <Link to="/" className="hover:opacity-80 transition-opacity">
              <span className="text-accent-500">Set</span>Times
            </Link>
          </h1>
          <ThemeToggle />
        </div>

        <div ref={collapseRef} className="hidden sm:block" style={collapseStyle}>
          <p className="text-accent-400 text-sm font-medium text-center">
            {eventName ? (
              <>
                <span className="font-semibold text-text-primary">{eventName}</span>
                {formattedDate && <span className="text-accent-400"> · {formattedDate}</span>}
              </>
            ) : (
              'Discover · Plan · Experience'
            )}
          </p>
          {eventName && <VenueStrip venues={venues} activeVenues={selectedVenues} />}
        </div>
      </div>
    </header>
  )
}

export default memo(Header)
