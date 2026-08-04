import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { ArrowLeft, CalendarDays, Globe, MapPin, Navigation, TriangleAlert } from 'lucide-react'
import Footer from '../components/Footer'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { formatPerformanceDayLabel } from '../utils/timeFormat'
import { fetchPublicJson } from '../utils/publicApi'
import { trackPageView } from '../utils/metrics'
import { buildBandProfileHref } from '../utils/bandProfileLink'
import { safeExternalHref } from '../utils/urlSafety'
import { buildDirectionsHref } from '../utils/directions'

function PerformanceRow({ perf }) {
  // #732 — functions/api/venues/[id].js already returns is_cancelled (row
  // always included), but this row rendered it exactly like an ordinary
  // performance. The visible "Cancelled" label is the accessible carrier
  // (WCAG 1.4.1) -- strikethrough alone isn't announced by screen readers.
  const isCancelled = Boolean(perf.is_cancelled)
  // Computed once: the guard and the rendered value must be the same
  // expression, or they can drift apart. Unlike EventTimeline this is NOT
  // gated on the event being multi-day -- this row shows no other date, so on
  // a single-day event the label is the only one present and suppressing it
  // would remove information rather than redundancy.
  const dayLabel = formatPerformanceDayLabel(perf)
  return (
    <div className="rounded-lg border border-border bg-bg-purple/40 p-4">
      {perf.band_name && (
        <Link
          to={buildBandProfileHref(perf.band_name)}
          className={`font-display text-lg font-semibold transition-colors hover:text-accent-400 ${
            isCancelled ? 'text-text-secondary' : 'text-text-primary'
          }`}
        >
          {isCancelled ? <s>{perf.band_name}</s> : perf.band_name}
        </Link>
      )}
      {isCancelled && (
        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-warning-500/25 px-2.5 py-1 text-xs font-semibold text-text-primary">
          <TriangleAlert size={14} aria-hidden="true" />
          Cancelled
        </span>
      )}
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-tertiary">
        {perf.event_slug ? (
          <Link to={`/event/${perf.event_slug}`} className="hover:text-accent-400">
            {perf.event_name}
          </Link>
        ) : (
          <span>{perf.event_name}</span>
        )}
        {dayLabel && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays size={13} aria-hidden="true" />
            {dayLabel}
          </span>
        )}
      </p>
    </div>
  )
}

function Section({ title, items }) {
  if (!items.length) return null
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-xl font-bold text-text-primary">{title}</h2>
      <div className="space-y-3">
        {items.map(perf => (
          <PerformanceRow key={perf.performance_id} perf={perf} />
        ))}
      </div>
    </section>
  )
}

export default function VenuePage() {
  const { id } = useParams()
  const [venue, setVenue] = useState(null)
  const [upcoming, setUpcoming] = useState([])
  const [past, setPast] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    trackPageView(`/venue/${id}`)
    fetchPublicJson(`/api/venues/${id}`, {}, 'Failed to load venue')
      .then(data => {
        if (!active) return
        setVenue(data.venue)
        setUpcoming(data.upcoming || [])
        setPast(data.past || [])
        document.title = `${data.venue?.name || 'Venue'} – SetTimes`
      })
      .catch(err => {
        if (active) setError(err)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id])

  const website = venue ? safeExternalHref(venue.website) : '#'
  const directionsHref = venue ? buildDirectionsHref(venue.name, venue.address) : null

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-gradient-dark">
      <Helmet>
        <title>{venue ? `${venue.name} – SetTimes` : 'Venue – SetTimes'}</title>
        {venue && (
          <meta
            name="description"
            content={`${venue.name}${venue.location ? ` in ${venue.location}` : ''} — events and lineups on SetTimes.`}
          />
        )}
        {venue && <link rel="canonical" href={`https://settimes.ca/venue/${venue.id}`} />}
        {venue && (
          <script type="application/ld+json">
            {JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'MusicVenue',
              name: venue.name,
              url: `https://settimes.ca/venue/${venue.id}`,
              ...(venue.address && { address: venue.address }),
              ...(safeExternalHref(venue.website) !== '#' && { sameAs: [venue.website] }),
            })}
          </script>
        )}
      </Helmet>

      <header className="border-b border-accent-500/30 px-4 py-6">
        <div className="container mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Link
            to="/venues"
            className="inline-flex items-center gap-1.5 text-sm text-accent-400 transition-colors hover:text-accent-300"
          >
            <ArrowLeft size={14} aria-hidden="true" /> All venues
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="container mx-auto max-w-5xl px-4 py-8">
        {loading ? (
          <p className="py-16 text-center text-text-tertiary">Loading venue…</p>
        ) : error ? (
          <p className="py-16 text-center text-text-secondary">{error.message}</p>
        ) : venue ? (
          <>
            <h1 className="font-display text-4xl font-bold text-text-primary">{venue.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-text-secondary">
              {venue.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={15} aria-hidden="true" /> {venue.location}
                </span>
              )}
              {website !== '#' && (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-accent-400 hover:text-accent-300"
                >
                  <Globe size={15} aria-hidden="true" /> Website
                </a>
              )}
            </div>
            {venue.address && (
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-tertiary">
                <span>{venue.address}</span>
                {directionsHref && (
                  <a
                    href={directionsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Directions to ${venue.name}`}
                    className="inline-flex min-h-[44px] items-center gap-1.5 text-accent-400 hover:text-accent-300"
                  >
                    <Navigation size={14} aria-hidden="true" />
                    Directions
                  </a>
                )}
              </p>
            )}

            <Section title="Upcoming" items={upcoming} />
            <Section title="Past shows" items={past} />

            {upcoming.length === 0 && past.length === 0 && (
              <p className="py-16 text-center text-text-secondary">No published performances at this venue yet.</p>
            )}
          </>
        ) : null}
      </div>

      <Footer />
    </main>
  )
}
