import {
  faCalendarDays,
  faCircle,
  faClock,
  faClockRotateLeft,
  faFilter,
  faLocationDot,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Link } from 'react-router-dom'
import { slugifyBandName } from '../utils/slugify'
import { formatTimeRange, parseLocalDate } from '../utils/timeFormat'
import { trackTicketClick } from '../utils/metrics'
import { Alert, Badge, Button, Card, Loading } from './ui'

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

        const response = await fetch('/api/events/timeline')

        if (!response.ok) {
          throw new Error('Failed to fetch events timeline')
        }

        const data = await response.json()
        setTimeline(data)
      } catch (err) {
        console.error('Error fetching timeline:', err)
        if (!isSilent) {
          setError(err.message)
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
  const filterEvents = events => {
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
  }

  // Get unique venues and months for filters
  const allVenues = useMemo(() => {
    return Array.from(
      new Set(
        [...(timeline.now || []), ...(timeline.upcoming || []), ...(timeline.past || [])]
          .flatMap(event => event.venues || [])
          .map(v => JSON.stringify({ id: v.id, name: v.name }))
      )
    ).map(v => JSON.parse(v))
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

  if (loading) {
    return <Loading size="lg" text="Loading events..." fullScreen={false} />
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16">
        <Alert variant="error" dismissible onClose={() => setError(null)}>
          <h4 className="font-bold mb-2">Failed to load events</h4>
          <p>{error}</p>
        </Alert>
      </div>
    )
  }

  // Apply filters
  const filteredNow = filterEvents(timeline.now || [])
  const filteredUpcoming = filterEvents(timeline.upcoming || [])
  const filteredPast = filterEvents(timeline.past || [])

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
              <Button variant="ghost" size="sm" onClick={clearFilters} icon={<FontAwesomeIcon icon={faXmark} />}>
                Clear Filters
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleShowFiltersToggle}
              icon={<FontAwesomeIcon icon={faFilter} />}
            >
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
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-text-primary focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 focus:outline-none transition-colors"
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
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-text-primary focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 focus:outline-none transition-colors"
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
              <div className="mt-4 pt-4 border-t border-white/10">
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
              <FontAwesomeIcon icon={faCircle} className="text-error-500 animate-pulse text-sm" />
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
              <FontAwesomeIcon icon={faCalendarDays} className="text-primary-500 text-xl" />
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
                <FontAwesomeIcon icon={faClockRotateLeft} className="text-text-tertiary text-xl" />
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

  const formatDate = dateStr => {
    const date = parseLocalDate(dateStr) || new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const featuredBands = event.bands || []
  const resolvedDetails = details
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
          <div className="flex-1">
            <div className="flex flex-wrap items-start gap-2 mb-2">
              {event.slug ? (
                <h3 className="text-2xl font-bold text-accent-500 flex-1">
                  <Link
                    to={`/event/${event.slug}`}
                    className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 rounded-sm"
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
              {event.is_published === false && <Badge variant="warning">Draft</Badge>}
            </div>

            <p className="text-text-secondary text-sm mb-4 flex items-center gap-2">
              <FontAwesomeIcon icon={faCalendarDays} className="text-xs" />
              {formatDate(event.date)}
            </p>

            {/* Event Stats */}
            <div className="flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-bold text-text-primary">{allBandCount}</span>
                <span className="text-text-tertiary">{allBandCount === 1 ? 'Band' : 'Bands'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-text-primary">{allVenueCount}</span>
                <span className="text-text-tertiary">{allVenueCount === 1 ? 'Venue' : 'Venues'}</span>
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
              Build Schedule
            </Button>
            {event.ticket_url && (
              <Button
                as="a"
                href={event.ticket_url}
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
              {expanded ? 'Hide Details' : 'View Details'}
            </Button>
          </div>
        </div>

        {/* Featured Bands Preview (when collapsed) */}
        {!expanded && featuredBands.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-text-tertiary text-sm mb-3">Performers:</p>
            <div className="flex flex-wrap gap-2">
              {featuredBands.map(band => (
                <Badge
                  key={band.id}
                  as="a"
                  href={`/band/${slugifyBandName(band.name)}`}
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
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-text-tertiary text-sm">Expand to load performers and venues.</p>
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-white/10 bg-white/5">
          {/* Venues */}
          {venueList && venueList.length > 0 && (
            <div className="p-6 border-b border-white/10">
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
                    key={band.id}
                    as={Link}
                    to={`/band/${slugifyBandName(band.name)}`}
                    padding="sm"
                    hoverable
                    className="group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="font-semibold text-text-primary group-hover:text-accent-500 transition-colors flex-1">
                        {band.name}
                      </div>
                      {band.photo_url && (
                        <div className="w-12 h-12 rounded-full bg-bg-darker overflow-hidden flex-shrink-0 ring-2 ring-white/10">
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
                        <FontAwesomeIcon icon={faLocationDot} aria-hidden="true" />
                        <span>{band.venue_name}</span>
                      </div>

                      <div className="text-text-tertiary flex items-center gap-2">
                        <FontAwesomeIcon icon={faClock} aria-hidden="true" />
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

          {detailsLoading && <div className="p-6 text-text-tertiary text-sm">Loading event details...</div>}
        </div>
      )}
    </Card>
  )
}
