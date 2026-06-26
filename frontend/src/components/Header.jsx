import { memo, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ThemeToggle from './ThemeToggle.jsx'
import VenueStrip from './VenueStrip.jsx'

function Header({ eventName, eventDate, selectedVenues }) {
  const formattedDate = eventDate
    ? new Date(`${eventDate}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : null
  const [scrollProgress, setScrollProgress] = useState(0)

  useEffect(() => {
    let frame = null
    const update = () => {
      frame = null
      const y = window.scrollY || 0
      const start = 20
      const end = 140
      const next = Math.min(Math.max((y - start) / (end - start), 0), 1)
      setScrollProgress(prev => (Math.abs(prev - next) < 0.01 ? prev : next))
    }
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  const headerPadding = Math.round(12 - 4 * scrollProgress)
  const headerStyle = {
    paddingTop: `${headerPadding}px`,
    paddingBottom: `${headerPadding}px`,
    boxShadow: `0 8px 24px rgba(4, 8, 16, ${0.14 * scrollProgress})`,
    backgroundColor: `rgba(8, 16, 32, ${0.65 + 0.25 * scrollProgress})`,
  }
  const titleScale = 1 - 0.12 * scrollProgress
  const fadeProgress = Math.min(1, scrollProgress * 1.75)
  const collapseStyle = {
    opacity: 1 - fadeProgress,
    transform: `translateY(${scrollProgress * -6}px)`,
    maxHeight: `${Math.round(56 * (1 - scrollProgress))}px`,
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

        <div className="hidden sm:block" style={collapseStyle}>
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
          {eventName && <VenueStrip activeVenues={selectedVenues} />}
        </div>
      </div>
    </header>
  )
}

export default memo(Header)
