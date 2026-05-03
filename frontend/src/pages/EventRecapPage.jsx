import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams } from 'react-router-dom'
import { Alert, Loading } from '../components/ui'
import { fetchPublicJson } from '../utils/publicApi'
import { parseLocalDate } from '../utils/timeFormat'

function StatCard({ label, value }) {
  return (
    <div
      className="bg-white/5 rounded-lg p-4 text-center"
      aria-label={`${label}: ${value ?? '—'}`}
    >
      <div className="text-3xl font-bold text-white" aria-hidden="true">{value ?? '—'}</div>
      <div className="text-sm text-white/60 mt-1" aria-hidden="true">{label}</div>
    </div>
  )
}

export default function EventRecapPage() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

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

  const { event, stats, bands } = data ?? {}
  const eventDate = event?.date ? (parseLocalDate(event.date) ?? new Date(event.date)) : null
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

      <main
        id="main-content"
        className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple px-4 py-10"
      >
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <header className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-white mb-2">{event.name}</h1>
            <p className="text-white/60 text-lg">{formattedDate}</p>
          </header>

          {/* Stat cards */}
          <section aria-label="Event statistics" className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
            <StatCard label="Total Sets" value={stats.total_sets ?? '—'} />
            <StatCard label="Venues" value={stats.venue_count ?? '—'} />
            <StatCard label="First Timers" value={stats.first_timers ?? '—'} />
            <StatCard label="Returning Acts" value={stats.returning_acts ?? '—'} />
          </section>

          {/* Band list */}
          <section aria-label="Performing bands">
            <h2 className="text-xl font-semibold text-white mb-4">Lineup</h2>
            <ul className="space-y-3">
              {bands.length === 0 ? (
                <li className="text-white/50 text-sm py-4 text-center">No performers recorded for this event.</li>
              ) : (
                bands.map((band) => (
                  <li key={band.id} className="bg-white/5 rounded-lg p-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/band/${band.id}`}
                        className="text-accent-400 font-medium hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 rounded"
                      >
                        {band.name}
                      </Link>
                      {band.genre && (
                        <span className="ml-2 text-white/50 text-sm">{band.genre}</span>
                      )}
                      {band.venue_name && (
                        <div className="text-white/50 text-sm mt-0.5">{band.venue_name}</div>
                      )}
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

          {/* Subscribe CTA */}
          <section aria-label="Stay notified" className="mt-12 bg-white/5 rounded-lg p-6 text-center">
            <h2 className="text-xl font-semibold text-white mb-2">Don&apos;t miss the next one</h2>
            <p className="text-white/60 mb-4">Get notified when new events and lineups are announced.</p>
            <Link
              to="/subscribe"
              className="inline-block bg-accent-400 text-bg-navy font-semibold px-6 py-2.5 rounded-lg hover:bg-accent-400/90 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-bg-navy"
            >
              Get notified
            </Link>
          </section>
        </div>
      </main>
    </>
  )
}
