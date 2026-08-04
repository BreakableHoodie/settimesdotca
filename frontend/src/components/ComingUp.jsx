import { useEffect, useState } from 'react'

function ComingUp({ bands, currentTime }) {
  const [nextBand, setNextBand] = useState(null)
  const [minutesUntil, setMinutesUntil] = useState(null)

  useEffect(() => {
    const updateNextBand = () => {
      const nowDate = currentTime instanceof Date ? currentTime : new Date(currentTime || Date.now())
      const nowMs = nowDate.getTime()

      const upcomingBands = bands
        .map(band => {
          const startMs =
            typeof band.startMs === 'number' ? band.startMs : Date.parse(`${band.date}T${band.startTime}:00`)
          return {
            ...band,
            startMs,
            diff: startMs - nowMs,
          }
        })
        .filter(band => band.diff > 0 && !band.is_cancelled)
        .sort((a, b) => a.diff - b.diff)

      if (upcomingBands.length > 0) {
        const next = upcomingBands[0]
        setNextBand(next)
        setMinutesUntil(Math.floor(next.diff / 60000))
      } else {
        setNextBand(null)
        setMinutesUntil(null)
      }
    }

    updateNextBand()
  }, [bands, currentTime])

  // Format time until next band
  const formatTimeUntil = minutes => {
    if (minutes < 60) {
      return `${minutes}m`
    }

    if (minutes < 1440) {
      const hours = Math.floor(minutes / 60)
      const mins = minutes % 60
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
    }

    const days = Math.floor(minutes / 1440)
    const remainder = minutes % 1440
    const hours = Math.floor(remainder / 60)
    const mins = remainder % 60
    const parts = [`${days}d`]
    if (hours > 0) parts.push(`${hours}h`)
    if (mins > 0) parts.push(`${mins}m`)
    return parts.join(' ')
  }

  const hasNext = nextBand && minutesUntil !== null
  const venueLabel = nextBand?.venue ? ` at ${nextBand.venue}` : ''
  const message = hasNext ? `Coming up in ${formatTimeUntil(minutesUntil)}: ${nextBand.name}${venueLabel}` : undefined

  return (
    <div
      aria-hidden={!hasNext}
      className={`overflow-hidden transition-all duration-300 ease-out ${
        hasNext ? 'max-h-28 sm:max-h-32 opacity-100' : 'max-h-0 opacity-0'
      }`}
    >
      {hasNext && (
        <div
          className="bg-linear-to-r from-accent-500 to-primary-600 px-4 py-2.5 text-bg-navy shadow-lg sm:py-3"
          role="status"
          aria-live="polite"
        >
          <div className="container mx-auto max-w-(--breakpoint-2xl)" title={message}>
            <div className="flex items-center gap-2 sm:hidden">
              <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.18em] text-bg-navy">Up Next</span>
              <span className="shrink-0 rounded-full bg-bg-navy/15 px-2 py-1 text-xs font-semibold text-bg-navy">
                {formatTimeUntil(minutesUntil)}
              </span>
              <span className="min-w-0 truncate text-sm font-semibold text-bg-navy">
                {nextBand.name}
                {nextBand.venue && <span className="text-bg-navy"> · {nextBand.venue}</span>}
              </span>
            </div>
            <p className="hidden text-center font-bold leading-normal sm:block sm:text-sm md:text-base">
              <span className="block">Coming up in {formatTimeUntil(minutesUntil)}:</span>
              <span className="text-lg md:text-xl">{nextBand.name}</span>
              {nextBand.venue && <span className="block text-sm md:text-base">{nextBand.venue}</span>}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default ComingUp
