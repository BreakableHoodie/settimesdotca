import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { ArrowLeft, Globe, MapPin, Navigation } from 'lucide-react'
import Footer from '../components/Footer'
import ThemeToggle from '../components/ThemeToggle.jsx'
import BandCard from '../components/BandCard'
import { formatPerformanceDayLabel } from '../utils/timeFormat'
import { prepareBands } from '../utils/bandUtils'
import { fetchPublicJson } from '../utils/publicApi'
import { trackPageView } from '../utils/metrics'
import { safeExternalHref } from '../utils/urlSafety'
import { buildDirectionsHref } from '../utils/directions'

// Read-only performer card (#742). Selection (add-to-route) deliberately
// isn't wired up here -- that pulls in scheduleStorage and the `end_date ||
// date` staleness rule (see CLAUDE.md "Schedule Storage"), which is scope
// this page doesn't need: a venue's lineup spans many events, so there is no
// single event date to key staleness on. Tracked as a follow-up, not built.
function VenuePerformerCard({ perf, venueName, currentTime }) {
  // BandCard/prepareBands expect camelCase startTime/endTime and a `date`
  // that is the FESTIVAL DAY this set belongs to -- performance_date, falling
  // back to the event's start date (the #543 convention functions/api/venues/[id].js's
  // own isPast/mapPerf already follow). prepareBands() applies the
  // AFTER_MIDNIGHT_THRESHOLD_HOUR offset from that pair, exactly like every
  // other schedule surface, so an after-midnight set (e.g. a 00:25 start)
  // sorts and displays after -- not before -- the same evening's earlier sets.
  const [band] = prepareBands([
    {
      id: perf.band_id,
      name: perf.band_name,
      // Feeds BandCard's non-interactive aria-label (`${name} at ${venue}`) --
      // showVenue={false} below only hides the *visible* venue line, not this.
      venue: venueName,
      photo_url: perf.photo_url,
      genre: perf.genre,
      is_cancelled: perf.is_cancelled,
      startTime: perf.start_time,
      endTime: perf.end_time,
      date: perf.performance_date || perf.event_date,
    },
  ])

  // getTimeDescription (inside BandCard) can't distinguish same-week days at
  // the same clock time -- during a 3-day event like Buddies Fest 2, three
  // sets at 8 PM on three different nights all read as a bare "8:00 PM" with
  // nothing to tell them apart. formatPerformanceDayLabel is the explicit,
  // already-multi-day-aware carrier: it adds "(Day N)", suppresses itself on
  // single-day events (#540/#541), and does NOT re-offset an after-midnight
  // set's stored (already-previous-evening) date.
  const dayLabel = formatPerformanceDayLabel(perf)

  return (
    <div>
      <BandCard
        band={band}
        clickable={false}
        showToggleButton={false}
        showVenue={false}
        eventSlug={perf.event_slug}
        currentTime={currentTime}
        dayLabel={dayLabel}
      />
      {/* A venue's lineup spans multiple events over time (e.g. Vol. 17 and
          Buddies Fest 2 both play the same rooms) -- the day label alone
          doesn't say WHICH event a past set belonged to. */}
      {perf.event_name && (
        <p className="mt-2 text-center text-xs text-text-tertiary">
          {perf.event_slug ? (
            <Link to={`/event/${perf.event_slug}`} className="hover:text-accent-400">
              {perf.event_name}
            </Link>
          ) : (
            perf.event_name
          )}
        </p>
      )}
    </div>
  )
}

function Section({ title, items, venueName, currentTime }) {
  if (!items.length) return null
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-xl font-bold text-text-primary">{title}</h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(perf => (
          <VenuePerformerCard key={perf.performance_id} perf={perf} venueName={venueName} currentTime={currentTime} />
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
  const [currentTime, setCurrentTime] = useState(() => new Date())

  // BandCard derives "Starts in Nm" / "Live Now" from this prop, so a frozen
  // value strands a fan on a stale countdown -- and this is the page someone
  // opens standing outside the venue. Same 60s cadence as App.jsx,
  // EmbedPage.jsx and MySchedule.jsx.
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)

    return () => clearInterval(interval)
  }, [])

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
  // Same trim rule as the helper: a whitespace-only address is truthy and would
  // otherwise render an empty address row with no link beside it.
  const displayAddress = typeof venue?.address === 'string' ? venue.address.trim() : ''

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-gradient-dark">
      {/* description/canonical/og:* /twitter:* AND JSON-LD are all SSR-owned
          for this route -- functions/venue/[id].js injects them server-side
          (with a structured PostalAddress and a broader sameAs than this
          component ever emitted). Declaring any of them here too would
          duplicate them on mount instead of replacing them. <title> has no
          SSR equivalent (SSR sets <title> on the raw HTML response only) and
          stays client-owned, backed by the direct document.title assignment
          in the effect above -- same React 19 Helmet-unreliability reasoning
          as every other SSR-injected route. */}
      <Helmet>
        <title>{venue ? `${venue.name} – SetTimes` : 'Venue – SetTimes'}</title>
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
            {displayAddress && (
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-tertiary">
                <span>{displayAddress}</span>
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

            <Section title="Upcoming" items={upcoming} venueName={venue.name} currentTime={currentTime} />
            <Section title="Past shows" items={past} venueName={venue.name} currentTime={currentTime} />

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
