import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

/**
 * EventTimeline - Main timeline showing Now, Upcoming, and Past events
 * Replaces single-event focus with comprehensive event discovery
 */
export default function EventTimeline() {
  const [timeline, setTimeline] = useState({ now: [], upcoming: [], past: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showPast, setShowPast] = useState(false)

  useEffect(() => {
    const fetchTimeline = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch('/api/events/timeline')

        if (!response.ok) {
          throw new Error('Failed to fetch events timeline')
        }

        const data = await response.json()
        setTimeline(data)
      } catch (err) {
        console.error('Error fetching timeline:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchTimeline()
  }, [])

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="text-band-orange text-xl">Loading events...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-16 text-center">
        <div className="text-red-400 text-xl mb-4">Failed to load events</div>
        <p className="text-white/70">{error}</p>
      </div>
    )
  }

  const hasNow = timeline.now && timeline.now.length > 0
  const hasUpcoming = timeline.upcoming && timeline.upcoming.length > 0
  const hasPast = timeline.past && timeline.past.length > 0

  return (
    <div className="space-y-12">
      {/* Now Playing Section */}
      {hasNow && (
        <section>
          <h2 className="text-3xl font-bold text-band-orange mb-6 flex items-center gap-3">
            <span className="animate-pulse">🔴</span>
            Happening Now
          </h2>
          <div className="space-y-6">
            {timeline.now.map(event => (
              <EventCard key={event.id} event={event} isLive={true} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Events Section */}
      {hasUpcoming && (
        <section>
          <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
            📅 Coming Up
          </h2>
          <div className="space-y-6">
            {timeline.upcoming.map(event => (
              <EventCard key={event.id} event={event} isUpcoming={true} />
            ))}
          </div>
        </section>
      )}

      {/* Past Events Section */}
      {hasPast && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold text-white/70 flex items-center gap-3">
              📚 Past Events
            </h2>
            <button
              onClick={() => setShowPast(!showPast)}
              className="px-4 py-2 bg-band-purple hover:bg-band-purple/80 text-white rounded-lg transition-colors"
            >
              {showPast ? 'Hide' : 'Show'} History
            </button>
          </div>

          {showPast && (
            <div className="space-y-6">
              {timeline.past.map(event => (
                <EventCard key={event.id} event={event} isPast={true} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Empty State */}
      {!hasNow && !hasUpcoming && !hasPast && (
        <div className="py-16 text-center">
          <div className="text-white/50 text-xl mb-4">No events found</div>
          <p className="text-white/30">Check back soon for upcoming band crawls!</p>
        </div>
      )}
    </div>
  )
}

/**
 * EventCard - Displays event info with bands and venues
 */
function EventCard({ event, isLive = false, isUpcoming = false, isPast = false }) {
  const [expanded, setExpanded] = useState(isLive) // Auto-expand live events

  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // Get featured bands (top 5)
  const featuredBands = event.bands.slice(0, 5)
  const moreBandsCount = Math.max(0, event.band_count - 5)

  return (
    <div
      className={`
        rounded-xl border overflow-hidden transition-all
        ${isLive ? 'bg-band-orange/10 border-band-orange shadow-lg shadow-band-orange/20' : ''}
        ${isUpcoming ? 'bg-band-purple border-band-orange/20' : ''}
        ${isPast ? 'bg-band-navy border-white/10' : ''}
      `}
    >
      {/* Event Header */}
      <div className="p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-band-orange mb-2">
              {event.name}
            </h3>
            <p className="text-white/70 text-sm mb-3">
              📅 {formatDate(event.date)}
            </p>

            {/* Event Stats */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2 text-white/90">
                <span className="font-semibold">{event.band_count}</span>
                <span className="text-white/60">Bands</span>
              </div>
              <div className="flex items-center gap-2 text-white/90">
                <span className="font-semibold">{event.venue_count}</span>
                <span className="text-white/60">Venues</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {event.ticket_url && (
              <a
                href={event.ticket_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-band-orange hover:bg-orange-600 text-white rounded-lg transition-colors font-medium whitespace-nowrap"
              >
                🎫 Get Tickets
              </a>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors font-medium"
            >
              {expanded ? 'Hide Details' : 'Show Details'}
            </button>
          </div>
        </div>

        {/* Featured Bands Preview (when collapsed) */}
        {!expanded && featuredBands.length > 0 && (
          <div className="mt-4">
            <p className="text-white/50 text-sm mb-2">Featured performers:</p>
            <div className="flex flex-wrap gap-2">
              {featuredBands.map(band => (
                <Link
                  key={band.id}
                  to={`/band/${band.id}`}
                  className="px-3 py-1 bg-band-navy/50 hover:bg-band-navy text-white rounded-full text-sm transition-colors"
                >
                  {band.name}
                </Link>
              ))}
              {moreBandsCount > 0 && (
                <span className="px-3 py-1 text-white/50 text-sm">
                  +{moreBandsCount} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-white/10">
          {/* Venues */}
          <div className="p-6 bg-band-navy/30">
            <h4 className="text-lg font-bold text-white mb-3">Venues</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {event.venues.map(venue => (
                <div
                  key={venue.id}
                  className="p-3 bg-band-purple/50 rounded-lg border border-white/10"
                >
                  <div className="font-semibold text-white mb-1">{venue.name}</div>
                  <div className="text-white/60 text-sm">
                    {venue.band_count} {venue.band_count === 1 ? 'band' : 'bands'}
                  </div>
                  {venue.address && (
                    <div className="text-white/40 text-xs mt-1">{venue.address}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* All Bands */}
          <div className="p-6">
            <h4 className="text-lg font-bold text-white mb-3">
              All Performers ({event.band_count})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {event.bands.map(band => (
                <Link
                  key={band.id}
                  to={`/band/${band.id}`}
                  className="p-3 bg-band-navy/50 hover:bg-band-navy rounded-lg border border-white/10 transition-all group"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="font-semibold text-white group-hover:text-band-orange transition-colors flex-1">
                      {band.name}
                    </div>
                    {band.photo_url && (
                      <div className="w-10 h-10 rounded-full bg-band-purple overflow-hidden flex-shrink-0">
                        <img
                          src={band.photo_url}
                          alt={band.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>

                  <div className="text-white/60 text-sm mb-1">
                    📍 {band.venue_name}
                  </div>

                  <div className="text-white/40 text-xs">
                    🕐 {band.start_time} - {band.end_time}
                  </div>

                  {band.genre && (
                    <div className="mt-2 text-white/50 text-xs">
                      {band.genre}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
