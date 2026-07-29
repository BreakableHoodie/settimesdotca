import { Archive, CalendarDays, Check, Clock, Funnel, History, MapPin, Music, X } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Link } from 'react-router-dom'
import { fetchPublicJson } from '../utils/publicApi'
import { buildBandProfileHref } from '../utils/bandProfileLink'
import { formatTimeRange, parseLocalDate } from '../utils/timeFormat'
import { trackTicketClick } from '../utils/metrics'
import { safeExternalHref } from '../utils/urlSafety'
import { getSelectedBands, saveSelectedBands } from '../utils/scheduleStorage'
import { sortableName } from '../utils/sortableName'
import { Alert, Badge, Button, Card, Loading } from './ui'
import EventsPageSkeleton from './EventsPageSkeleton'

const POSTER_BOX_CLASS = 'w-28 sm:w-36 shrink-0 self-start overflow-hidden rounded-lg border border-border'

/**
 * Wraps a listing poster so it links to the event, like the title does (#697).
 *
 * `aria-hidden` + `tabIndex={-1}` are deliberate, not an oversight: the poster is
 * `alt=""` because the adjacent title already carries the event name, and a
 * focusable link wrapping a decorative image is an UNLABELLED link plus a second
 * tab stop to a destination the title covers. Mouse/touch affordance only — the
 * title remains the single keyboard and screen-reader path.
 *
 * Renders a plain div when there is no slug, mirroring the title's own
 * `event.slug` guard; otherwise this would link to `/event/undefined`.
 */
function PosterBox({ slug, children }) {
  if (!slug) return <div className={POSTER_BOX_CLASS}>{children}</div>
  return (
    <Link
      to={`/event/${slug}`}
      aria-hidden="true"
      tabIndex={-1}
      className={`${POSTER_BOX_CLASS} block transition-opacity hover:opacity-90`}
    >
      {children}
    </Link>
  )
}
import PosterImage from './PosterImage'

/**
 * EventTimeline - Main timeline showing Now, Upcoming, and Past events
 * Sprint 2.1: Enhanced with design system, filtering, and real-time updates
 */
const MemoizedEventCard = memo(EventCard)

export default function EventTimeline() {
  const [timeline, setTimeline] = useState({ now: [], upcoming: [], past: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showPast, setShowPast] = useState(false)
  const [filters, setFilters] = useState({ venue: null, month: null })
  const [showFilters, setShowFilters] = useState(false)
  const [detailsById, setDetailsById] = useState({})
  const [detailsLoading, setDetailsLoading] = useState({})

  // Use transition for non-urgent UI updates to improve INP
  const [, startTransition] = useTransition()

  // Fetch timeline data
  const pollRef = useRef(null)
  // Track loading/loaded state to prevent duplicate fetches
  const detailsStateRef = useRef({})

  useEffect(() => {
    const fetchTimeline = async (isSilent = false) => {
      try {
        if (!isSilent) {
          setLoading(true)
        }
        setError(null)

        const data = await fetchPublicJson('/api/events/timeline?pastLimit=50', {}, 'Failed to fetch events timeline')
        setTimeline(data)
      } catch (err) {
        console.error('Error fetching timeline:', err)
        if (!isSilent) {
          setError(err instanceof Error ? err : new Error('Failed to fetch events timeline'))
        }
      } finally {
        if (!isSilent) {
          setLoading(false)
        }
      }
    }

    fetchTimeline()

    // Real-time updates: refresh every 60 seconds for "Now Playing"
    const startPolling = () => {
      if (pollRef.current) return
      pollRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchTimeline(true)
        }
      }, 60000)
    }
    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchTimeline(true)
        startPolling()
      } else {
        stopPolling()
      }
    }

    startPolling()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const loadDetails = useCallback(async eventId => {
    if (!eventId) return

    // Early return to avoid duplicate fetches
    const detailsState = detailsStateRef.current[eventId]
    if (detailsState?.loading || detailsState?.loaded) {
      return
    }

    // Mark as loading
    detailsStateRef.current[eventId] = { loading: true, loaded: false }

    try {
      setDetailsLoading(prev => ({ ...prev, [eventId]: true }))
      const response = await fetch(`/api/events/${eventId}/details`)
      if (!response.ok) {
        throw new Error('Failed to load event details')
      }
      const data = await response.json()

      // Mark as loaded
      detailsStateRef.current[eventId] = { loading: false, loaded: true }

      // Clear loading state synchronously to prevent race condition
      setDetailsLoading(prev => ({ ...prev, [eventId]: false }))

      // Defer details cache update to improve INP
      startTransition(() => {
        setDetailsById(prev => ({ ...prev, [eventId]: data }))
      })
    } catch (err) {
      console.error('Error fetching event details:', err)
      // Reset loading state on error to allow retry
      detailsStateRef.current[eventId] = { loading: false, loaded: false }
      setDetailsLoading(prev => ({ ...prev, [eventId]: false }))
    }
  }, [])

  // Filter events
  const filterEvents = useCallback(
    events => {
      if (!events) return []

      return events.filter(event => {
        if (filters.venue && !event.venues.some(v => v.id === filters.venue)) {
          return false
        }
        if (filters.month) {
          const eventMonth = event.date?.slice(0, 7)
          if (eventMonth !== filters.month) {
            return false
          }
        }
        return true
      })
    },
    [filters]
  )

  // Get unique venues and months for filters
  const allVenues = useMemo(() => {
    const seen = new Map()
    ;[...(timeline.now || []), ...(timeline.upcoming || []), ...(timeline.past || [])]
      .flatMap(event => event.venues || [])
      .forEach(v => {
        if (!seen.has(v.id)) seen.set(v.id, { id: v.id, name: v.name })
      })
    return Array.from(seen.values())
  }, [timeline])

  const allMonths = useMemo(() => {
    return Array.from(
      new Set(
        [...(timeline.now || []), ...(timeline.upcoming || []), ...(timeline.past || [])].map(event =>
          event.date?.slice(0, 7)
        )
      )
    )
      .sort()
      .reverse()
  }, [timeline])

  const clearFilters = useCallback(() => {
    startTransition(() => {
      setFilters({ venue: null, month: null })
    })
  }, [])

  const handleShowPastToggle = useCallback(() => {
    startTransition(() => {
      setShowPast(prev => !prev)
    })
  }, [])

  const handleShowFiltersToggle = useCallback(() => {
    startTransition(() => {
      setShowFilters(prev => !prev)
    })
  }, [])

  const handleFilterChange = useCallback((key, value) => {
    startTransition(() => {
      setFilters(prev => ({ ...prev, [key]: value }))
    })
  }, [])

  const hasActiveFilters = filters.venue !== null || filters.month !== null
  const isPublishGateError = error?.status === 503

  // Hooks must be called before any conditional returns (Rules of Hooks)
  const filteredNow = useMemo(() => filterEvents(timeline.now || []), [filterEvents, timeline.now])
  const filteredUpcoming = useMemo(() => filterEvents(timeline.upcoming || []), [filterEvents, timeline.upcoming])
  const filteredPast = useMemo(() => filterEvents(timeline.past || []), [filterEvents, timeline.past])

  if (loading) {
    return <EventsPageSkeleton />
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16">
        <Alert variant="error" dismissible onClose={() => setError(null)}>
          <h4 className="font-bold mb-2">
            {isPublishGateError ? 'Events are not published yet' : 'Failed to load events'}
          </h4>
          <p>{error.message}</p>
        </Alert>
      </div>
    )
  }

  const hasNow = filteredNow.length > 0
  const hasUpcoming = filteredUpcoming.length > 0
  const hasPast = filteredPast.length > 0

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header with Filters */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-4xl font-bold text-text-primary mb-2">Events</h1>
            <p className="text-text-secondary">Discover upcoming band crawls and music events</p>
          </div>

          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} icon={<X size={14} />}>
                Clear Filters
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={handleShowFiltersToggle} icon={<Funnel size={14} />}>
              {showFilters ? 'Hide' : 'Show'} Filters
            </Button>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Venue Filter */}
              <div>
                <label htmlFor="timeline-venue-filter" className="block text-sm font-medium text-text-secondary mb-2">
                  Filter by Venue
                </label>
                <select
                  id="timeline-venue-filter"
                  value={filters.venue || ''}
                  onChange={e => handleFilterChange('venue', e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 focus:outline-hidden transition-colors"
                >
                  <option value="">All Venues</option>
                  {allVenues.map(venue => (
                    <option key={venue.id} value={venue.id}>
                      {venue.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Month Filter */}
              <div>
                <label htmlFor="timeline-month-filter" className="block text-sm font-medium text-text-secondary mb-2">
                  Filter by Month
                </label>
                <select
                  id="timeline-month-filter"
                  value={filters.month || ''}
                  onChange={e => handleFilterChange('month', e.target.value || null)}
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 focus:outline-hidden transition-colors"
                >
                  <option value="">All Months</option>
                  {allMonths.map(month => (
                    <option key={month} value={month}>
                      {(parseLocalDate(`${month}-01`) || new Date(`${month}-01`)).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                      })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {hasActiveFilters && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-sm text-text-tertiary">
                  Showing {filteredNow.length + filteredUpcoming.length + filteredPast.length} filtered event(s)
                </p>
              </div>
            )}
          </Card>
        )}
      </div>

      <div className="space-y-12">
        {/* Now Playing Section */}
        {hasNow && (
          <section>
            <div className="flex items-center gap-3 mb-6">
              <span className="inline-block w-3 h-3 rounded-full bg-error-500 animate-pulse" aria-hidden="true" />
              <h2 className="text-3xl font-bold text-accent-500">Happening Now</h2>
              <Badge variant="error" size="sm">
                LIVE
              </Badge>
            </div>
            <div className="space-y-6">
              {filteredNow.map(event => (
                <MemoizedEventCard
                  key={event.id}
                  event={event}
                  isLive={true}
                  details={detailsById[event.id]}
                  detailsLoading={detailsLoading[event.id]}
                  onLoadDetails={loadDetails}
                />
              ))}
            </div>
          </section>
        )}

        {/* Upcoming Events Section */}
        {hasUpcoming && (
          <section>
            <div className="flex items-center gap-3 mb-6">
              <CalendarDays size={20} className="text-primary-500" />
              <h2 className="text-3xl font-bold text-text-primary">Coming Up</h2>
            </div>
            <div className="space-y-6">
              {filteredUpcoming.map(event => (
                <MemoizedEventCard
                  key={event.id}
                  event={event}
                  isUpcoming={true}
                  details={detailsById[event.id]}
                  detailsLoading={detailsLoading[event.id]}
                  onLoadDetails={loadDetails}
                />
              ))}
            </div>
          </section>
        )}

        {/* Past Events Section */}
        {hasPast && (
          <section>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <History size={20} className="text-text-tertiary" />
                <h2 className="text-3xl font-bold text-text-secondary">Past Events</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={handleShowPastToggle}>
                {showPast ? 'Hide' : 'Show'} History ({filteredPast.length})
              </Button>
            </div>

            {showPast && (
              <div className="space-y-6 opacity-75">
                {filteredPast.map(event => (
                  <MemoizedEventCard
                    key={event.id}
                    event={event}
                    isPast={true}
                    details={detailsById[event.id]}
                    detailsLoading={detailsLoading[event.id]}
                    onLoadDetails={loadDetails}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Empty State */}
        {!hasNow && !hasUpcoming && !hasPast && (
          <div className="py-16 text-center">
            <Alert variant="info">
              <div className="text-center">
                <h3 className="text-lg font-bold mb-2">No events found</h3>
                <p className="text-text-secondary">
                  {hasActiveFilters
                    ? 'Try adjusting your filters to see more events'
                    : 'Check back soon for upcoming band crawls!'}
                </p>
              </div>
            </Alert>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * GenreDiscovery - Genre-clustered band wall for upcoming events.
 * Lets fans tap photos to add bands to their schedule before the event.
 */
function GenreDiscovery({ bands, eventSlug, eventDate }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set(getSelectedBands(eventSlug)))

  const toggleBand = useCallback(
    bandId => {
      if (!eventSlug) return
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(bandId)) {
          next.delete(bandId)
        } else {
          next.add(bandId)
        }
        saveSelectedBands(eventSlug, Array.from(next), eventDate)
        return next
      })
    },
    [eventSlug, eventDate]
  )

  // Group bands by genre, case-insensitive. Bands without a genre go to "Other".
  const genreGroups = useMemo(() => {
    // `bands` here is the details endpoint's per-performance list — a band
    // playing two sets appears as two entries sharing the same band.id. The
    // wall shows one photo tile per ACT, not per set, and selection is keyed
    // by band id, so dedupe (keep the first/earliest-set occurrence) before
    // grouping. Without this a two-set act rendered two tiles and tapping
    // either one toggled the same underlying selection.
    const seenBandIds = new Set()
    const dedupedBands = bands.filter(band => {
      if (seenBandIds.has(band.id)) return false
      seenBandIds.add(band.id)
      return true
    })

    const groups = new Map()
    for (const band of dedupedBands) {
      const raw = (band.genre || '').trim()
      const genre = raw || 'Other'
      const key = genre.toLowerCase()
      if (!groups.has(key)) {
        groups.set(key, { label: genre, bands: [] })
      }
      groups.get(key).bands.push(band)
    }
    // Alphabetical, with "Other" always last
    return Array.from(groups.values()).sort((a, b) => {
      if (a.label.toLowerCase() === 'other') return 1
      if (b.label.toLowerCase() === 'other') return -1
      return a.label.localeCompare(b.label)
    })
  }, [bands])

  if (genreGroups.length === 0) return null

  return (
    <div className="p-6 border-b border-border">
      <div className="flex items-center justify-between mb-5">
        <h4 className="text-lg font-bold text-text-primary">Discover Bands</h4>
        {selectedIds.size > 0 && (
          <span className="text-xs font-semibold text-accent-500">
            {selectedIds.size} {selectedIds.size === 1 ? 'band' : 'bands'} added to your schedule
          </span>
        )}
      </div>

      <div className="space-y-6">
        {genreGroups.map(({ label, bands: groupBands }) => (
          <div key={label.toLowerCase()}>
            {/* Genre header pill */}
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary-500/15 border border-primary-500/30 text-primary-500">
                {label}
              </span>
              <span className="text-xs text-text-tertiary">
                {groupBands.length} {groupBands.length === 1 ? 'band' : 'bands'}
              </span>
            </div>

            {/* Band photo wall */}
            <div className="flex flex-wrap gap-3">
              {groupBands.map(band => {
                const isSelected = selectedIds.has(band.id)
                return (
                  <button
                    key={band.id}
                    type="button"
                    onClick={() => toggleBand(band.id)}
                    aria-pressed={isSelected}
                    aria-label={`${isSelected ? 'Remove' : 'Add'} ${band.name} ${isSelected ? 'from' : 'to'} my schedule`}
                    className={`w-24 flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-1 ${
                      isSelected
                        ? 'bg-accent-500/10 ring-2 ring-accent-500'
                        : 'bg-surface ring-1 ring-border hover:bg-surface-hover hover:ring-primary-500/40'
                    }`}
                  >
                    {/* Photo or placeholder */}
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                      {band.photo_url ? (
                        <img
                          src={band.photo_url}
                          alt={band.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-bg-darker flex items-center justify-center">
                          <Music size={24} className="text-text-tertiary" aria-hidden="true" />
                        </div>
                      )}
                      {/* Selected checkmark overlay */}
                      {isSelected && (
                        <div className="absolute inset-0 bg-accent-500/20 flex items-end justify-end p-1">
                          <div className="bg-accent-500 rounded-full p-0.5">
                            <Check size={10} className="text-bg-navy" aria-hidden="true" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Band name */}
                    <span
                      className={`text-xs font-medium text-center leading-tight line-clamp-2 min-h-[2rem] ${
                        isSelected ? 'text-accent-500' : 'text-text-primary'
                      }`}
                    >
                      {band.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * EventCard - Displays event info with bands and venues
 * Sprint 2.1: Updated with design system components
 */
function EventCard({
  event,
  isLive = false,
  isUpcoming = false,
  isPast = false,
  details,
  detailsLoading = false,
  onLoadDetails,
}) {
  const [expanded, setExpanded] = useState(isLive) // Auto-expand live events
  const ticketHref = safeExternalHref(event.ticket_url)

  // No `weekday` (#681): a festival day runs 6 AM -> 6 AM, so an
  // after-midnight set's calendar weekday can mismatch the festival day a
  // fan actually experienced — month/day/year carries the same information
  // without that ambiguity.
  const formatDate = dateStr => {
    const date = parseLocalDate(dateStr) || new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  // Collapsed chips show names only (no set times), so fans scan them as a
  // lookup — alphabetical, article-stripped (#587 convention). The expanded
  // "All Performers" grid keeps the API's set-time order, where running
  // order is meaningful.
  const featuredBands = useMemo(
    () => [...(event.bands || [])].sort((a, b) => sortableName(a.name).localeCompare(sortableName(b.name))),
    [event.bands]
  )
  const resolvedDetails = details
  const isLoadingDetails = expanded && detailsLoading && !resolvedDetails
  const venueList = resolvedDetails?.venues || event.venues || []
  const allBands = resolvedDetails?.bands || []
  const allBandCount = resolvedDetails?.band_count ?? event.band_count
  const allVenueCount = resolvedDetails?.venue_count ?? event.venue_count

  useEffect(() => {
    if (expanded && !resolvedDetails && !detailsLoading) {
      onLoadDetails?.(event.id)
    }
  }, [expanded, resolvedDetails, detailsLoading, event.id, onLoadDetails])

  return (
    <Card
      hoverable={!expanded}
      className={`
        transition-all overflow-hidden
        ${isLive ? 'ring-2 ring-error-500/50 shadow-glow-accent' : ''}
        ${isUpcoming ? 'border-primary-500/20' : ''}
        ${isPast ? 'opacity-75' : ''}
      `}
      padding="none"
      data-testid="event-card"
    >
      {/* Event Header */}
      <div className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
          <div className="flex flex-1 gap-4 min-w-0">
            {/* Decorative: alt="" because the card's link text already names
                the event. Do not make this open a lightbox — that would nest
                a <button> inside the card's <a>, which is invalid and breaks
                keyboard nav; the full-size view lives on the event page.
                `self-start` stops the flex row's default align-items:stretch
                from stretching this box to the height of the text column
                beside it — without it, the box was taller than the poster's
                real aspect ratio and the image (object-contain) letterboxed
                inside the extra space, reading as "artificially and doubly
                constrained" (#659 follow-up). No fixed aspect ratio either:
                production posters range ~0.75-0.80 (3:4 to 4:5), so any
                single ratio letterboxes most of them — `h-auto` lets the
                image set its own height and letterboxes none. Trade-off:
                this gives up the reserved layout space that guarded against
                CLS; accepted because the image is loading="lazy" and the
                past-section cards are additionally gated behind a collapsed
                "Show History" toggle, so neither mounts until near-viewport
                or explicitly expanded. */}
            {event.poster_url && (
              <PosterBox slug={event.slug}>
                <PosterImage
                  src={event.poster_url}
                  width={200}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  /* aspect-[auto_3/4] is the TWO-VALUE aspect-ratio syntax:
                     reserve a 3:4 box while the lazy image has no intrinsic
                     dimensions, then let the real ratio take over once it
                     loads. This is NOT the fixed-ratio box that caused
                     letterboxing — that was a stretched container plus
                     object-contain, which pinned the wrong ratio permanently.
                     Nothing letterboxes after load here, and the reserved box
                     stops expanding History from cascading layout shifts. */
                  className="aspect-[auto_3/4] h-auto w-full"
                />
              </PosterBox>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start gap-2 mb-2">
                {event.slug ? (
                  <h3 className="text-2xl font-bold text-accent-500 flex-1">
                    <Link
                      to={`/event/${event.slug}`}
                      className="hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-500/70 rounded-xs"
                    >
                      {event.name}
                    </Link>
                  </h3>
                ) : (
                  <h3 className="text-2xl font-bold text-accent-500 flex-1">{event.name}</h3>
                )}
                {isLive && (
                  <Badge variant="error" size="md">
                    LIVE NOW
                  </Badge>
                )}
                {event.status === 'archived' && (
                  <Badge variant="default" size="md">
                    <Archive size={12} className="mr-1" aria-hidden="true" />
                    Archived
                  </Badge>
                )}
                {event.is_published === false && <Badge variant="warning">Draft</Badge>}
              </div>

              <p className="text-text-secondary text-sm mb-4 flex items-center gap-2">
                <CalendarDays size={12} />
                {formatDate(event.date)}
              </p>

              {/* Event Stats */}
              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-text-primary">{allBandCount}</span>
                  <span className="text-text-tertiary">{allBandCount === 1 ? 'Band' : 'Bands'}</span>
                </div>
                {/* Historical volumes have roster-only lineups with no venue
                  assignments — "0 Venues" reads as missing data, so omit the
                  stat entirely rather than showing a zero. */}
                {allVenueCount > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-text-primary">{allVenueCount}</span>
                    <span className="text-text-tertiary">{allVenueCount === 1 ? 'Venue' : 'Venues'}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end lg:ml-auto lg:max-w-[560px]">
            <Button
              as={Link}
              to={event.slug ? `/event/${event.slug}` : '#'}
              variant="primary"
              size="md"
              className="w-full sm:w-auto sm:min-w-[160px]"
              onClick={() => {
                if (!event.slug) {
                  return
                }
              }}
            >
              {isPast || event.status === 'archived' ? 'View Lineup' : 'Build Your Schedule'}
            </Button>
            {/* Past editions get a recap link — the recap page was previously
                unreachable except by URL (#555). */}
            {(isPast || event.status === 'archived') && event.slug && (
              <Button
                as={Link}
                to={`/events/${event.slug}/recap`}
                variant="secondary"
                size="md"
                className="w-full sm:w-auto sm:min-w-[160px]"
              >
                Recap
              </Button>
            )}
            {ticketHref !== '#' && (
              <Button
                as="a"
                href={ticketHref}
                target="_blank"
                rel="noopener noreferrer"
                variant="primary"
                size="md"
                className="w-full sm:w-auto sm:min-w-[160px]"
                onClick={() => trackTicketClick(event.id)}
              >
                Get Tickets
              </Button>
            )}
            <Button
              variant="primary"
              size="md"
              className="w-full sm:w-auto sm:min-w-[160px]"
              onClick={() => {
                const nextExpanded = !expanded
                setExpanded(nextExpanded)
                if (nextExpanded && !resolvedDetails && !detailsLoading) {
                  onLoadDetails?.(event.id)
                }
              }}
            >
              {isLoadingDetails ? 'Loading Details...' : expanded ? 'Hide Details' : 'View Details'}
            </Button>
          </div>
        </div>

        {/* Featured Bands Preview (when collapsed) */}
        {!expanded && featuredBands.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-text-tertiary text-sm mb-3">Performers:</p>
            <div className="flex flex-wrap gap-2">
              {featuredBands.map(band => (
                <Badge
                  key={band.id}
                  as="a"
                  href={buildBandProfileHref(band.name, event.slug)}
                  variant="default"
                  size="md"
                  className="hover:bg-primary-500/20 cursor-pointer transition-colors"
                >
                  {band.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {!expanded && featuredBands.length === 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-text-tertiary text-sm">Expand to load performers and venues.</p>
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-border bg-surface">
          {isLoadingDetails && (
            <div className="border-b border-border px-6 py-5">
              <Loading size="sm" text="Loading performers and venues..." className="sm:items-start" />
            </div>
          )}

          {/* Genre Discovery Wall — upcoming events only */}
          {/* eventDate feeds saveSelectedBands' stale-detection, so it must be
              end_date || date (#542 PR-1, see CLAUDE.md "Schedule Storage"):
              keying staleness on the start date wipes the fan's saved
              schedule on day 2 of a multi-day event. end_date comes from
              /api/events/timeline (null for single-day events). */}
          {isUpcoming && allBands && allBands.length > 0 && (
            <GenreDiscovery bands={allBands} eventSlug={event.slug} eventDate={event.end_date || event.date} />
          )}

          {/* Venues */}
          {venueList && venueList.length > 0 && (
            <div className="p-6 border-b border-border">
              <h4 className="text-lg font-bold text-text-primary mb-4">Venues</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {venueList.map(venue => (
                  <Card key={venue.id} padding="sm" variant="elevated">
                    <div className="font-semibold text-text-primary mb-1">{venue.name}</div>
                    <div className="text-text-secondary text-sm">
                      {venue.band_count} {venue.band_count === 1 ? 'band' : 'bands'}
                    </div>
                    {venue.address && <div className="text-text-tertiary text-xs mt-1">{venue.address}</div>}
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* All Bands */}
          {allBands && allBands.length > 0 && (
            <div className="p-6">
              <h4 className="text-lg font-bold text-text-primary mb-4">All Performers ({allBandCount})</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {allBands.map(band => (
                  <Card
                    key={band.performance_id ?? band.id}
                    as={Link}
                    to={buildBandProfileHref(band.name, event.slug)}
                    padding="sm"
                    hoverable
                    className="group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="font-semibold text-text-primary group-hover:text-accent-500 transition-colors flex-1">
                        {band.name}
                      </div>
                      {band.photo_url && (
                        <div className="w-12 h-12 rounded-full bg-bg-darker overflow-hidden shrink-0 ring-2 ring-border">
                          <img
                            src={band.photo_url}
                            alt={band.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 text-sm">
                      <div className="text-text-secondary flex items-center gap-2">
                        <MapPin size={12} aria-hidden="true" />
                        <span>{band.venue_name}</span>
                      </div>

                      <div className="text-text-tertiary flex items-center gap-2">
                        <Clock size={12} aria-hidden="true" />
                        <span>{formatTimeRange(band.start_time, band.end_time)}</span>
                      </div>

                      {band.genre && (
                        <div className="pt-2">
                          <Badge variant="default" size="sm">
                            {band.genre}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
