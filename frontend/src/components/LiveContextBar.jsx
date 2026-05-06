import { CalendarDays, Clock, Route, Warehouse } from 'lucide-react'
import { memo, useMemo } from 'react'
import { getEventState } from '../utils/eventLifecycle'
import TimeFilter from './TimeFilter'

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

function LiveContextBar({
  eventData,
  currentTime,
  bands = [],
  selectedCount = 0,
  view = 'all',
  onViewChange,
  venueFilter = null,
  onVenueFilterChange,
  timeFilter = 'all',
  onTimeFilterChange,
}) {
  const venueOptions = useMemo(() => [...new Set(bands.map(band => band.venue).filter(Boolean))].sort(), [bands])
  const uniqueVenues = useMemo(() => {
    const venueInfo = parseVenueInfo(eventData?.venue_info)
    if (venueInfo.length > 0) {
      return venueInfo.length
    }

    return venueOptions.length
  }, [eventData?.venue_info, venueOptions.length])

  const lifecycle = useMemo(() => getLifecycleLabel(eventData?.date, currentTime), [currentTime, eventData?.date])

  const daysUntil = (() => {
    if (lifecycle.label !== 'Upcoming' || !eventData?.date) return null
    const eventDateObj = new Date(eventData.date + 'T00:00:00')
    const nowDate = currentTime instanceof Date ? currentTime : new Date(+currentTime)
    const eventDay = Date.UTC(eventDateObj.getFullYear(), eventDateObj.getMonth(), eventDateObj.getDate())
    const todayDay = Date.UTC(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate())
    return Math.ceil((eventDay - todayDay) / 86400000)
  })()

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
              <Clock size={14} aria-hidden="true" className="text-accent-400" />
              <span aria-live="polite">{formatCurrentTime(currentTime)}</span>
            </div>
            <div className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-white/80">
              <Warehouse size={14} aria-hidden="true" className="text-accent-400" />
              <span>
                {uniqueVenues} {uniqueVenues === 1 ? 'venue' : 'venues'}
              </span>
            </div>
            <div className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-white/80">
              <CalendarDays size={14} aria-hidden="true" className="text-accent-400" />
              <span>
                {bands.length} {bands.length === 1 ? 'set' : 'sets'}
              </span>
            </div>
            <div className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-accent-500/25 bg-accent-500/10 px-3 py-2 text-accent-400">
              <Route size={14} aria-hidden="true" />
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

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => onViewChange?.('all')}
              aria-pressed={view === 'all'}
              className={`min-h-[40px] rounded-full px-4 text-sm font-semibold transition-colors ${
                view === 'all' ? 'bg-accent-500 text-bg-navy' : 'text-white/70 hover:text-white'
              }`}
            >
              Live Lineup
            </button>
            <button
              type="button"
              onClick={() => onViewChange?.('mine')}
              aria-pressed={view === 'mine'}
              className={`relative min-h-[40px] rounded-full px-4 text-sm font-semibold transition-colors ${
                view === 'mine' ? 'bg-accent-500 text-bg-navy' : 'text-white/70 hover:text-white'
              }`}
            >
              My Route
              {selectedCount > 0 && (
                <span className="ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-bg-navy/80 px-1.5 py-0.5 text-xs font-bold text-white">
                  {selectedCount}
                </span>
              )}
            </button>
          </div>

          {venueOptions.length > 1 && (
            <div className="min-w-[170px]">
              <label htmlFor="live-venue-switcher" className="sr-only">
                Venue switcher
              </label>
              <select
                id="live-venue-switcher"
                value={venueFilter || ''}
                onChange={event => onVenueFilterChange?.(event.target.value || null)}
                className="min-h-[44px] w-full rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white focus:border-accent-500 focus:outline-hidden"
              >
                <option value="">All Venues</option>
                {venueOptions.map(venue => (
                  <option key={venue} value={venue}>
                    {venue}
                  </option>
                ))}
              </select>
            </div>
          )}

          <TimeFilter selectedFilter={timeFilter} onFilterChange={onTimeFilterChange} className="min-w-[180px]" />
        </div>
      </div>
    </section>
  )
}

export default memo(LiveContextBar)
