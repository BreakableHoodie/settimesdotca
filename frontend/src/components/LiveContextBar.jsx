import { CalendarDays, ChevronDown, Clock, DoorOpen, Route, Warehouse } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useScrollCollapse } from '../hooks/useScrollCollapse.js'
import { getDaysAwayAriaLabel, getDaysAwayLabel } from '../utils/daysAway'
import { getDoorsTimeForDate } from '../utils/doorsTime'
import { getLifecycleLabel } from '../utils/liveLabel'
import { formatTime } from '../utils/timeFormat'
import EventPosterThumbnail from './EventPosterThumbnail'
import EventSocialLinks from './EventSocialLinks'
import GhostEasterEgg from './GhostEasterEgg'
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
  posterUrl = null,
  onPosterOpen,
}) {
  const venueOptions = useMemo(() => [...new Set(bands.map(band => band.venue).filter(Boolean))].sort(), [bands])
  const hasVenueFilter = venueOptions.length > 1
  const uniqueVenues = useMemo(() => {
    const venueInfo = parseVenueInfo(eventData?.venue_info)
    if (venueInfo.length > 0) {
      return venueInfo.length
    }

    return venueOptions.length
  }, [eventData?.venue_info, venueOptions.length])

  const lifecycle = useMemo(
    () => getLifecycleLabel(eventData?.date, currentTime, bands, eventData?.doors_json),
    [bands, currentTime, eventData?.date, eventData?.doors_json]
  )

  // Doors time for the event's FIRST date only (#569) — this header isn't
  // per-day, so it always reflects day 1's gates-open time. Later festival
  // days show their own doors time on the DayDivider instead.
  const doorsTime = useMemo(
    () => getDoorsTimeForDate(eventData?.doors_json, eventData?.date),
    [eventData?.doors_json, eventData?.date]
  )
  // Filters (venue/time selects) default OPEN on tablet/desktop, where the
  // extra vertical space costs nothing, and default CLOSED on phone-width
  // viewports (#665) — expanded-by-default was the single biggest
  // contributor to this bar's mobile height, since it renders before the fan
  // has scrolled (or even interacted) at all. Computed once at mount against
  // the `sm` breakpoint (640px) rather than tracked on resize — a phone
  // doesn't get wider mid-session. The Tabs below stay reachable regardless
  // of this state; only the venue/time selects are gated by it.
  const [isFiltersOpen, setIsFiltersOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 640)
  const [showGhost, setShowGhost] = useState(false)

  // Collapses the mobile-only identity block (status badge, clock, title,
  // poster, stats line) once the fan scrolls past it — #665. The Tabs and
  // filter toggle below are NOT part of this collapse; they render in their
  // own always-visible block further down. Thresholds are wider than the
  // site header's (20-140) because this block starts taller: fully
  // collapsed well before `scrollY` reaches the ~600px this was measured at.
  const scrollProgress = useScrollCollapse(48, 240)
  const identityFadeProgress = Math.min(1, scrollProgress * 1.75)
  const identityCollapseStyle = {
    opacity: 1 - identityFadeProgress,
    transform: `translateY(${scrollProgress * -6}px)`,
    maxHeight: `${Math.round(200 * (1 - scrollProgress))}px`,
    overflow: 'hidden',
    pointerEvents: scrollProgress > 0.7 ? 'none' : 'auto',
  }
  const tapCountRef = useRef(0)
  const firstTapTimeRef = useRef(0)

  const handleLifecycleTap = () => {
    const now = Date.now()
    if (tapCountRef.current === 0) firstTapTimeRef.current = now
    if (now - firstTapTimeRef.current > 3000) {
      tapCountRef.current = 1
      firstTapTimeRef.current = now
    } else {
      tapCountRef.current += 1
    }
    if (tapCountRef.current >= 7) {
      tapCountRef.current = 0
      setShowGhost(true)
    }
  }

  useEffect(() => {
    const KONAMI = [
      'ArrowUp',
      'ArrowUp',
      'ArrowDown',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowLeft',
      'ArrowRight',
      'b',
      'a',
    ]
    let pos = 0
    const onKey = e => {
      if (e.key === KONAMI[pos]) {
        pos += 1
        if (pos === KONAMI.length) {
          pos = 0
          setShowGhost(true)
        }
      } else {
        pos = e.key === KONAMI[0] ? 1 : 0
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const daysUntil = (() => {
    if (lifecycle.label !== 'Upcoming' || !eventData?.date) return null
    const eventDateObj = new Date(eventData.date + 'T00:00:00')
    const nowDate = currentTime instanceof Date ? currentTime : new Date(+currentTime)
    const eventDay = Date.UTC(eventDateObj.getFullYear(), eventDateObj.getMonth(), eventDateObj.getDate())
    const todayDay = Date.UTC(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate())
    return Math.ceil((eventDay - todayDay) / 86400000)
  })()
  const mobileSummary = useMemo(() => {
    const summaryItems = [
      `${uniqueVenues} ${uniqueVenues === 1 ? 'venue' : 'venues'}`,
      `${bands.length} ${bands.length === 1 ? 'set' : 'sets'}`,
    ]

    if (doorsTime) {
      summaryItems.push(`Doors ${formatTime(doorsTime)}`)
    }

    if (daysUntil !== null) {
      summaryItems.push(getDaysAwayLabel(daysUntil))
    }

    return summaryItems.join(' • ')
  }, [bands.length, daysUntil, doorsTime, uniqueVenues])

  if (!eventData?.name) {
    return null
  }

  return (
    <section className="sticky top-[57px] z-40 border-b border-border bg-bg-navy/92 backdrop-blur-xs">
      <div className="container mx-auto px-4 max-w-(--breakpoint-2xl) py-2.5 sm:py-3">
        <div className="sm:hidden">
          {/* Identity block: status badge, clock, poster, title, stats.
              Collapses on scroll (#665, style computed above) — everything
              a fan needs once they're scrolling the lineup (Tabs, filter
              toggle) lives in the always-visible block below, outside this
              wrapper. */}
          <div style={identityCollapseStyle}>
            <div className="flex items-center justify-between gap-3">
              <span
                role="button"
                tabIndex={0}
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${lifecycle.classes}`}
                aria-label={`Event status: ${lifecycle.label}`}
                onClick={handleLifecycleTap}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleLifecycleTap()
                  }
                }}
              >
                {lifecycle.label}
              </span>

              <div className="inline-flex min-h-[36px] shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary">
                <Clock size={14} aria-hidden="true" className="text-accent-400" />
                <span className="tabular-nums">{formatCurrentTime(currentTime)}</span>
              </div>
            </div>

            {/* Poster beside the title/stats rather than stacked above them
                (#666) — reclaims the dead width a poster-alone row left
                empty and drops a whole ~142px row from the mobile vertical
                budget. Absent posterUrl (the common case) just leaves this
                column at full width; nothing here depends on the poster
                being present. */}
            <div className="mt-2 flex gap-3">
              {posterUrl && (
                <EventPosterThumbnail
                  posterUrl={posterUrl}
                  eventName={eventData.name}
                  onOpen={onPosterOpen}
                  variant="inline"
                />
              )}
              <div className="min-w-0 flex-1">
                <h2
                  className="overflow-hidden text-base font-semibold leading-snug text-text-primary"
                  style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                >
                  {eventData.name}
                </h2>
                <EventSocialLinks
                  socialLinks={eventData.social_links}
                  eventName={eventData.name}
                  className="-ml-2 mt-0.5"
                />
                <p className="mt-1 truncate text-xs text-text-tertiary">{mobileSummary}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden items-start justify-between gap-3 sm:flex">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                role="button"
                tabIndex={0}
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${lifecycle.classes}`}
                aria-label={`Event status: ${lifecycle.label}`}
                onClick={handleLifecycleTap}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleLifecycleTap()
                  }
                }}
              >
                {lifecycle.label}
              </span>
              <h2 className="min-w-0 truncate text-base font-semibold text-text-primary md:text-lg">
                {eventData.name}
              </h2>
              <EventSocialLinks
                socialLinks={eventData.social_links}
                eventName={eventData.name}
                className="-ml-2 shrink-0"
              />
            </div>
            <p className="mt-1 truncate text-xs text-text-tertiary sm:hidden">{mobileSummary}</p>
            <p className="mt-1 hidden text-sm text-text-tertiary md:block">
              Fast lookup for what&apos;s on now, what&apos;s next, and where to go after that.
            </p>
          </div>

          <div className="inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary">
            <Clock size={14} aria-hidden="true" className="text-accent-400" />
            <span aria-live="polite" className="tabular-nums">
              {formatCurrentTime(currentTime)}
            </span>
          </div>
        </div>

        <div className="mt-3 hidden flex-wrap items-center gap-2 text-xs sm:flex sm:text-sm">
          <div className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-text-secondary">
            <Warehouse size={14} aria-hidden="true" className="text-accent-400" />
            <span>
              {uniqueVenues} {uniqueVenues === 1 ? 'venue' : 'venues'}
            </span>
          </div>
          <div className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-text-secondary">
            <CalendarDays size={14} aria-hidden="true" className="text-accent-400" />
            <span>
              {bands.length} {bands.length === 1 ? 'set' : 'sets'}
            </span>
          </div>
          {doorsTime && (
            <div className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-text-secondary">
              <DoorOpen size={14} aria-hidden="true" className="text-accent-400" />
              <span>Doors {formatTime(doorsTime)}</span>
            </div>
          )}
          <div className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-accent-500/25 bg-accent-500/10 px-3 py-2 text-accent-400">
            <Route size={14} aria-hidden="true" />
            <span>
              {selectedCount} {selectedCount === 1 ? 'stop in route' : 'stops in route'}
            </span>
          </div>
          {daysUntil !== null && (
            <div className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-warning-400/35 bg-warning-400/10 px-3 py-2 font-semibold text-warning-400">
              <span aria-label={getDaysAwayAriaLabel(daysUntil)}>{getDaysAwayLabel(daysUntil)}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsFiltersOpen(v => !v)}
            aria-label={isFiltersOpen ? 'Hide filters' : 'Show filters'}
            aria-expanded={isFiltersOpen}
            aria-controls="live-filter-panel"
            className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-xs text-text-tertiary hover:text-text-secondary transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            <span>Filters</span>
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={`transition-transform duration-200 ${isFiltersOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {/* Tabs (Live Lineup / My Route) and the mobile filters toggle are
            deliberately OUTSIDE the `isFiltersOpen` gate below (#665) — they
            are the functional navigation controls and must stay reachable
            at all times, unlike the venue/time selects, which are genuinely
            optional filtering and are fine to default-collapse on mobile. */}
        <div className="mt-3 border-t border-border pt-3">
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            <div className="flex items-center gap-2">
              <div className="grid grid-cols-2 items-center rounded-full border border-border bg-surface p-1">
                <button
                  type="button"
                  onClick={() => onViewChange?.('all')}
                  aria-pressed={view === 'all'}
                  className={`min-h-[44px] rounded-full px-4 text-sm font-semibold transition-colors ${
                    view === 'all' ? 'bg-accent-500 text-bg-navy' : 'text-text-tertiary hover:text-text-primary'
                  }`}
                >
                  Live Lineup
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange?.('mine')}
                  aria-pressed={view === 'mine'}
                  className={`relative min-h-[44px] rounded-full px-4 text-sm font-semibold transition-colors ${
                    view === 'mine' ? 'bg-accent-500 text-bg-navy' : 'text-text-tertiary hover:text-text-primary'
                  }`}
                >
                  My Route
                  {selectedCount > 0 && (
                    <span className="ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-bg-navy/80 px-1.5 py-0.5 text-xs font-bold text-text-primary">
                      {selectedCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Desktop already has its own "Filters" toggle in the stat
                  chip row above (`ml-auto` button, unaffected by this
                  change); this compact mobile-only twin keeps the toggle
                  reachable next to the Tabs once the identity block above
                  has scroll-collapsed away. */}
              <button
                type="button"
                onClick={() => setIsFiltersOpen(v => !v)}
                aria-label={isFiltersOpen ? 'Hide filters' : 'Show filters'}
                aria-expanded={isFiltersOpen}
                aria-controls="live-filter-panel"
                className="ml-auto flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1 px-2 text-xs text-text-tertiary transition-colors hover:text-text-secondary sm:hidden"
              >
                <ChevronDown
                  size={14}
                  aria-hidden="true"
                  className={`transition-transform duration-200 ${isFiltersOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </div>

            {isFiltersOpen && (
              <div
                id="live-filter-panel"
                className={`grid gap-2 ${hasVenueFilter ? 'grid-cols-2' : 'grid-cols-1'} sm:flex sm:flex-wrap sm:items-center`}
              >
                {hasVenueFilter && (
                  <div className="relative min-w-0 sm:min-w-[170px]">
                    <label htmlFor="live-venue-switcher" className="sr-only">
                      Venue switcher
                    </label>
                    <select
                      id="live-venue-switcher"
                      value={venueFilter || ''}
                      onChange={event => onVenueFilterChange?.(event.target.value || null)}
                      className="min-h-[44px] w-full appearance-none rounded-full border border-border bg-surface px-4 py-2 pr-10 text-sm font-medium text-text-primary focus:border-accent-500 focus:outline-hidden"
                    >
                      <option value="">All Venues</option>
                      {venueOptions.map(venue => (
                        <option key={venue} value={venue}>
                          {venue}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary"
                    />
                  </div>
                )}

                <TimeFilter
                  selectedFilter={timeFilter}
                  onFilterChange={onTimeFilterChange}
                  className="min-w-0 sm:min-w-[180px]"
                />
              </div>
            )}
          </div>
        </div>
      </div>
      {showGhost && <GhostEasterEgg onDismiss={() => setShowGhost(false)} />}
    </section>
  )
}

export default memo(LiveContextBar)
