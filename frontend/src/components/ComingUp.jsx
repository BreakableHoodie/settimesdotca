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
        .filter(band => band.diff > 0)
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
    const interval = setInterval(updateNextBand, 30000) // Update every 30 seconds

    return () => clearInterval(interval)
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
  const message = hasNext
    ? `Coming up in ${formatTimeUntil(minutesUntil)}: ${nextBand.name} at ${nextBand.venue}`
    : undefined

  return (
    <div
      className={`overflow-hidden transition-all duration-300 ease-out ${hasNext ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0'}`}
    >
      {hasNext && (
        <div
          className="bg-gradient-to-r from-accent-500 to-primary-600 text-white py-3 px-4 shadow-lg"
          role="status"
          aria-live="polite"
        >
          <div className="container mx-auto max-w-6xl text-center" title={message}>
            <p className="font-bold text-sm md:text-base leading-normal">
              <span className="block">Coming up in {formatTimeUntil(minutesUntil)}:</span>
              <span className="text-lg md:text-xl">{nextBand.name}</span>
              <span className="block text-sm md:text-base">{nextBand.venue}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default ComingUp
