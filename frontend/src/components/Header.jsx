import { memo, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

function Header({ eventName, eventDate }) {
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

  const headerPadding = Math.round(16 - 8 * scrollProgress)
  const headerStyle = {
    paddingTop: `${headerPadding}px`,
    paddingBottom: `${headerPadding}px`,
    boxShadow: `0 8px 24px rgba(4, 8, 16, ${0.18 * scrollProgress})`,
    backgroundColor: `rgba(8, 16, 32, ${0.65 + 0.25 * scrollProgress})`,
  }
  const titleScale = 1 - 0.2 * scrollProgress
  // Fade out faster than the space collapses so content is invisible before it gets clipped.
  const fadeProgress = Math.min(1, scrollProgress * 1.5)
  const collapseStyle = {
    opacity: 1 - fadeProgress,
    transform: `translateY(${scrollProgress * -8}px)`,
    maxHeight: `${Math.round(80 * (1 - scrollProgress))}px`,
    overflow: 'hidden',
    marginTop: `${Math.round(12 * (1 - scrollProgress))}px`,
    pointerEvents: scrollProgress > 0.7 ? 'none' : 'auto',
  }

  return (
    <header
      className="sticky top-0 z-50 border-b-2 border-accent-500/30 transition-[padding,box-shadow,background-color] duration-500 ease-out bg-linear-to-b from-bg-navy to-bg-purple backdrop-blur-xs"
      style={headerStyle}
    >
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-3 sm:gap-4 min-h-[44px] transition-all duration-500 ease-out">
          <h1
            className="font-bold text-white font-display tracking-tight text-3xl md:text-4xl text-center sm:text-left leading-tight w-full transition-transform duration-300 ease-out"
            style={{ transform: `scale(${titleScale})` }}
          >
            <Link to="/" className="hover:opacity-80 transition-opacity">
              <span className="text-accent-500">Set</span>Times
            </Link>
          </h1>
        </div>

        <p className="text-accent-400 text-sm md:text-base font-medium text-center" style={collapseStyle}>
          {eventName ? (
            <>
              <span className="font-semibold text-white">{eventName}</span>
              {formattedDate && <span className="text-accent-400"> · {formattedDate}</span>}
            </>
          ) : (
            'Discover · Plan · Experience'
          )}
        </p>
      </div>
    </header>
  )
}

export default memo(Header)
