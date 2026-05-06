import { Archive, ArrowLeft, CalendarDays, MapPin, Route } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams } from 'react-router-dom'
import { Alert, Loading } from '../components/ui'
import { buildBandProfileHref } from '../utils/bandProfileLink'
import { fetchPublicJson } from '../utils/publicApi'
import { parseLocalDate } from '../utils/timeFormat'

const SELECTED_BANDS_KEY = 'selectedBandsByEvent'

function getSavedPerformanceIds(eventSlug) {
  if (typeof window === 'undefined') {
    return new Set()
  }

  try {
    const stored = window.localStorage.getItem(SELECTED_BANDS_KEY)
    if (!stored) {
      return new Set()
    }

    const parsed = JSON.parse(stored)
    const selectedBands = Array.isArray(parsed?.[eventSlug]) ? parsed[eventSlug] : []
    const performanceIds = selectedBands
      .map(selection => {
        if (typeof selection === 'number' && Number.isFinite(selection)) {
          return selection
        }
        if (typeof selection !== 'string') {
          return null
        }
        const match = selection.match(/(\d+)$/)
        return match ? Number.parseInt(match[1], 10) : null
      })
      .filter(id => Number.isFinite(id))

    return new Set(performanceIds)
  } catch {
    return new Set()
  }
}

function groupBandsByVenue(bands) {
  const venueMap = new Map()

  bands.forEach(band => {
    const venueKey = band.venue_id || band.venue_name || 'unscheduled'
    if (!venueMap.has(venueKey)) {
      venueMap.set(venueKey, {
        id: venueKey,
        name: band.venue_name || 'Unscheduled',
        bands: [],
      })
    }
    venueMap.get(venueKey).bands.push(band)
  })

  return Array.from(venueMap.values())
    .map(venue => ({
      ...venue,
      bands: [...venue.bands].sort((a, b) => {
        const aTime = a.start_time || '99:99'
        const bTime = b.start_time || '99:99'
        return aTime.localeCompare(bTime)
      }),
    }))
    .sort((a, b) => b.bands.length - a.bands.length || a.name.localeCompare(b.name))
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white/5 rounded-lg p-4 text-center">
      <div className="sr-only">{label}: {value ?? '—'}</div>
      <div className="text-3xl font-bold text-white" aria-hidden="true">
        {value ?? '—'}
      </div>
      <div className="text-sm text-white/60 mt-1" aria-hidden="true">
        {label}
      </div>
    </div>
  )
}

export default function EventRecapPage() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const event = data?.event || null
  const stats = data?.stats || null
  const bands = Array.isArray(data?.bands) ? data.bands : []
  const savedPerformanceIds = event ? getSavedPerformanceIds(event.slug) : new Set()
  const savedBands = bands.filter(band => savedPerformanceIds.has(band.performance_id))
  const missedBands = bands.filter(band => !savedPerformanceIds.has(band.performance_id))
  const venueRecap = groupBandsByVenue(bands)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchPublicJson(`/api/events/${slug}/recap`)
      .then(json => {
        if (!cancelled) setData(json)
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load event recap.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-linear-to-br from-bg-navy to-bg-purple">
        <Loading />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple p-6">
        <Alert variant="error">{error}</Alert>
      </div>
    )
  }

  if (!event || !stats || !Array.isArray(bands)) {
    return (
      <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple flex items-center justify-center p-4">
        <Alert variant="error">Event recap data is unavailable.</Alert>
      </div>
    )
  }

  const eventDate = event.date ? (parseLocalDate(event.date) ?? new Date(event.date)) : null
  const formattedDate = eventDate
    ? eventDate.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Date TBD'

  return (
    <>
      <Helmet>
        <title>{event.name} — Event Recap | SetTimes.ca</title>
        <meta
          name="description"
          content={`Recap for ${event.name} on ${formattedDate}. ${stats.total_sets ?? 0} sets across ${stats.venue_count ?? 0} venues.`}
        />
      </Helmet>

      <main id="main-content" className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple px-4 py-10">
        <div className="mx-auto max-w-5xl">
          <header className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-xs">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent-400">
              <span className="inline-flex items-center gap-2 rounded-full border border-accent-400/20 bg-accent-400/10 px-3 py-1">
                <Archive size={14} aria-hidden="true" />
                Archive
              </span>
              <span>Recap</span>
            </div>
            <h1 className="mt-4 text-4xl font-bold text-white">{event.name}</h1>
            <p className="mt-2 text-lg text-white/60">{formattedDate}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to={`/event/${event.slug}`}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent-400 px-5 py-3 font-semibold text-bg-navy transition-colors hover:bg-accent-400/90"
              >
                <CalendarDays size={16} aria-hidden="true" />
                View Archived Schedule
              </Link>
              <Link
                to="/"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/15 px-5 py-3 font-semibold text-white/80 transition-colors hover:bg-white/10"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Browse All Events
              </Link>
            </div>
          </header>

          <section aria-label="Event statistics" className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <StatCard label="Total Sets" value={stats.total_sets ?? '—'} />
            <StatCard label="Venues" value={stats.venue_count ?? '—'} />
            <StatCard label="First Timers" value={stats.first_timers ?? '—'} />
            <StatCard label="Returning Acts" value={stats.returning_acts ?? '—'} />
            <StatCard label="Saved Route" value={savedBands.length || '—'} />
          </section>

          <section aria-label="Your route recap" className="mb-10 rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="mb-5 flex items-center gap-2">
              <Route size={18} className="text-accent-400" aria-hidden="true" />
              <h2 className="text-2xl font-semibold text-white">Your Route Recap</h2>
            </div>

            {savedBands.length > 0 ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-bg-navy/40 p-4">
                  <h3 className="mb-3 text-lg font-semibold text-white">Saved in your route</h3>
                  <p className="mb-4 text-sm text-white/60">
                    You saved {savedBands.length} {savedBands.length === 1 ? 'set' : 'sets'} for this event.
                  </p>
                  <ul className="space-y-3">
                    {savedBands.map(band => (
                      <li key={band.performance_id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <Link
                          to={buildBandProfileHref(band.name, event.slug)}
                          className="font-medium text-accent-400 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
                        >
                          {band.name}
                        </Link>
                        <div className="mt-1 text-sm text-white/60">
                          {band.venue_name || 'Unscheduled'}
                          {(band.start_time || band.end_time) && ` • ${band.start_time || 'TBD'}–${band.end_time || 'TBD'}`}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-white/10 bg-bg-navy/40 p-4">
                  <h3 className="mb-3 text-lg font-semibold text-white">Bands you missed</h3>
                  <p className="mb-4 text-sm text-white/60">
                    {missedBands.length} {missedBands.length === 1 ? 'set was' : 'sets were'} outside your saved route.
                  </p>
                  <ul className="space-y-3">
                    {missedBands.slice(0, 6).map(band => (
                      <li key={band.performance_id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <Link
                          to={buildBandProfileHref(band.name, event.slug)}
                          className="font-medium text-accent-400 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
                        >
                          {band.name}
                        </Link>
                        <div className="mt-1 text-sm text-white/60">
                          {band.venue_name || 'Unscheduled'}
                          {(band.start_time || band.end_time) && ` • ${band.start_time || 'TBD'}–${band.end_time || 'TBD'}`}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/15 bg-bg-navy/30 p-4 text-sm text-white/70">
                No saved route was found for this event. The archive still preserves the full lineup, venue recap, and band history.
              </div>
            )}
          </section>

          <section aria-label="Venue recap" className="mb-10 rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="mb-5 flex items-center gap-2">
              <MapPin size={18} className="text-accent-400" aria-hidden="true" />
              <h2 className="text-2xl font-semibold text-white">Venue Recap</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {venueRecap.map(venue => (
                <article key={venue.id} className="rounded-xl border border-white/10 bg-bg-navy/40 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{venue.name}</h3>
                      <p className="text-sm text-white/60">
                        {venue.bands.length} {venue.bands.length === 1 ? 'set' : 'sets'} on the night
                      </p>
                    </div>
                    <Link
                      to={`/event/${event.slug}`}
                      className="text-xs font-semibold text-accent-400 transition-colors hover:text-accent-300"
                    >
                      View schedule →
                    </Link>
                  </div>
                  <ul className="space-y-2 text-sm text-white/70">
                    {venue.bands.map(band => (
                      <li key={band.performance_id} className="flex items-start justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
                        <Link to={buildBandProfileHref(band.name, event.slug)} className="min-w-0 truncate text-accent-400 hover:underline">
                          {band.name}
                        </Link>
                        <span className="shrink-0 text-white/50">{band.start_time || 'TBD'}–{band.end_time || 'TBD'}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <section aria-label="Archived lineup">
            <h2 className="mb-4 text-xl font-semibold text-white">Archived Lineup</h2>
            <ul className="space-y-3">
              {bands.length === 0 ? (
                <li className="text-white/50 text-sm py-4 text-center">No performers recorded for this event.</li>
              ) : (
                bands.map(band => (
                  <li key={band.id} className="bg-white/5 rounded-lg p-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <Link
                        to={buildBandProfileHref(band.name, event.slug)}
                        className="text-accent-400 font-medium hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 rounded"
                      >
                        {band.name}
                      </Link>
                      {band.genre && <span className="ml-2 text-white/50 text-sm">{band.genre}</span>}
                      <div className="mt-0.5 text-white/50 text-sm">
                        {band.venue_name || 'Unscheduled'}
                        {(band.start_time || band.end_time) && ` • ${band.start_time || 'TBD'}–${band.end_time || 'TBD'}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {band.is_returning === false && (
                        <span className="inline-block bg-accent-400/20 text-accent-400 text-xs font-medium px-2 py-0.5 rounded-full">
                          First timer
                        </span>
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section aria-label="Archive next steps" className="mt-12 rounded-2xl bg-white/5 p-6 text-center">
            <h2 className="mb-2 text-xl font-semibold text-white">Keep exploring the archive</h2>
            <p className="mb-4 text-white/60">
              Revisit the archived schedule, jump into band histories, or get notified when the next lineup drops.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to={`/event/${event.slug}`}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/15 px-5 py-3 font-semibold text-white/80 transition-colors hover:bg-white/10"
              >
                <CalendarDays size={16} aria-hidden="true" />
                Archived Schedule
              </Link>
              <Link
                to="/subscribe"
                className="inline-flex min-h-[44px] items-center rounded-lg bg-accent-400 px-5 py-3 font-semibold text-bg-navy transition-colors hover:bg-accent-400/90"
              >
                Get notified
              </Link>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
