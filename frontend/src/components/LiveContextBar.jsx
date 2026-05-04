import { memo, useMemo } from 'react'
import { faCalendarDays, faClock, faRoute, faWarehouse } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { getEventState } from '../utils/eventLifecycle'

function parseVenueInfo(venueInfo) {
  if (!venueInfo) return []

  try {
    const parsed = typeof venueInfo === 'string' ? JSON.parse(venueInfo) : venueInfo
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatCurrentTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function isSameLocalDay(eventDate, currentTime) {
  if (!eventDate) return false
  const current = currentTime instanceof Date ? currentTime : new Date(currentTime)
  const year = current.getFullYear()
  const month = String(current.getMonth() + 1).padStart(2, '0')
  const day = String(current.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}` === eventDate
}

function getLifecycleLabel(eventDate, currentTime) {
  const state = getEventState(eventDate, currentTime)

  if (state === 'archived') {
    return { label: 'Archive', classes: 'bg-white/10 text-white/80 border-white/15' }
  }

  if (state === 'recently_completed') {
    return { label: 'Recap', classes: 'bg-secondary-500/15 text-secondary-500 border-secondary-500/30' }
  }

  if (isSameLocalDay(eventDate, currentTime)) {
    return { label: 'Live Tonight', classes: 'bg-accent-500/15 text-accent-400 border-accent-500/30' }
  }

  return { label: 'Upcoming', classes: 'bg-blue-500/15 text-blue-300 border-blue-500/30' }
}

function LiveContextBar({ eventData, currentTime, bands = [], selectedCount = 0 }) {
  const uniqueVenues = useMemo(() => {
    const venueInfo = parseVenueInfo(eventData?.venue_info)
    if (venueInfo.length > 0) {
      return venueInfo.length
    }

    return new Set(bands.map(band => band.venue).filter(Boolean)).size
  }, [bands, eventData?.venue_info])

  const lifecycle = useMemo(() => getLifecycleLabel(eventData?.date, currentTime), [currentTime, eventData?.date])

  const daysUntil = useMemo(() => {
    if (lifecycle.label !== 'Upcoming' || !eventData?.date) return null
    const eventDateMs = new Date(eventData.date + 'T00:00:00').getTime()
    return Math.ceil((eventDateMs - (+currentTime)) / 86_400_000)
  }, [lifecycle.label, eventData?.date, currentTime])

  if (!eventData?.name) {
    return null
  }

  return (
    <section className="sticky top-[72px] z-40 border-b border-white/10 bg-bg-navy/90 backdrop-blur-xs">
      <div className="container mx-auto px-4 max-w-(--breakpoint-2xl) py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${lifecycle.classes}`}
              >
                {lifecycle.label}
              </span>
              <h2 className="truncate text-base font-semibold text-white md:text-lg">{eventData.name}</h2>
            </div>
            <p className="mt-1 text-sm text-white/60">
              Fast lookup for what&apos;s on now, what&apos;s next, and where to go after that.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            <div className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-white/80">
              <FontAwesomeIcon icon={faClock} aria-hidden="true" className="text-accent-400" />
              <span aria-live="polite">{formatCurrentTime(currentTime)}</span>
            </div>
            <div className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-white/80">
              <FontAwesomeIcon icon={faWarehouse} aria-hidden="true" className="text-accent-400" />
              <span>
                {uniqueVenues} {uniqueVenues === 1 ? 'venue' : 'venues'}
              </span>
            </div>
            <div className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-white/80">
              <FontAwesomeIcon icon={faCalendarDays} aria-hidden="true" className="text-accent-400" />
              <span>
                {bands.length} {bands.length === 1 ? 'set' : 'sets'}
              </span>
            </div>
            <div className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-accent-500/25 bg-accent-500/10 px-3 py-2 text-accent-400">
              <FontAwesomeIcon icon={faRoute} aria-hidden="true" />
              <span>
                {selectedCount} {selectedCount === 1 ? 'stop in route' : 'stops in route'}
              </span>
            </div>
            {daysUntil !== null && (
              <div className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-warning-400/35 bg-warning-400/10 px-3 py-2 text-warning-400 font-semibold">
                <span aria-label={`${daysUntil} ${daysUntil === 1 ? 'day' : 'days'} until the event`}>
                  ⏳ {daysUntil} {daysUntil === 1 ? 'day' : 'days'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default memo(LiveContextBar)
