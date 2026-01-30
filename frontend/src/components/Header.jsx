import { memo, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

function Header({ view, setView }) {
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
  const collapseStyle = {
    opacity: 1 - scrollProgress,
    transform: `translateY(${scrollProgress * -8}px)`,
    maxHeight: `${Math.round(40 * (1 - scrollProgress))}px`,
    marginTop: `${Math.round(12 * (1 - scrollProgress))}px`,
    pointerEvents: scrollProgress > 0.85 ? 'none' : 'auto',
  }

  return (
    <header
      className="sticky top-0 z-50 border-b-2 border-accent-500/30 transition-all duration-500 ease-out bg-gradient-to-b from-bg-navy to-bg-purple backdrop-blur-sm"
      style={headerStyle}
    >
      <div className="container mx-auto px-4 max-w-6xl">
        <div
          className="flex flex-col sm:flex-row items-center sm:justify-between gap-3 sm:gap-4 min-h-[44px] transition-all duration-500 ease-out"
        >
          <h1
            className="font-bold text-white font-display tracking-tight text-3xl md:text-4xl text-center sm:text-left leading-tight w-full transition-transform duration-300 ease-out"
            style={{ transform: `scale(${titleScale})` }}
          >
            <Link to="/" className="hover:opacity-80 transition-opacity">
              <span className="text-accent-500">Set</span>Times
            </Link>
          </h1>

        </div>

        <p
          className="text-accent-400 text-sm md:text-base font-medium transition-all duration-150 ease-out overflow-hidden text-center"
          style={collapseStyle}
        >
          Discover · Plan · Experience
        </p>
        <div
          className="flex flex-col sm:flex-row justify-center items-center gap-3 transition-all duration-300 ease-out"
          style={{ marginTop: `${Math.round(12 * (1 - scrollProgress))}px` }}
        >
          <div className="flex gap-2">
            <button
              onClick={() => setView('all')}
              className={`px-6 py-2 rounded-lg font-semibold transition-transform duration-150 hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-400 ${
                view === 'all'
                  ? 'bg-accent-400 text-bg-navy shadow-lg'
                  : 'bg-bg-purple/50 text-white hover:bg-bg-purple'
              }`}
              title="View all performances"
              aria-pressed={view === 'all'}
            >
              All Performances
            </button>
            <button
              onClick={() => setView('mine')}
              className={`px-6 py-2 rounded-lg font-semibold transition-transform duration-150 hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-400 ${
                view === 'mine'
                  ? 'bg-accent-400 text-bg-navy shadow-lg'
                  : 'bg-bg-purple/50 text-white hover:bg-bg-purple'
              }`}
              title="View my schedule"
              aria-pressed={view === 'mine'}
            >
              My Schedule
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

export default memo(Header)
