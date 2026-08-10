import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { ArrowLeft, MapPin, Search } from 'lucide-react'
import Footer from '../components/Footer'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { fetchPublicJson } from '../utils/publicApi'
import { trackPageView } from '../utils/metrics'

const PAGE_SIZE = 24
const PAGE_TITLE = 'Venues – SetTimes'

function VenueCard({ venue }) {
  const counts = [
    `${venue.performance_count} ${venue.performance_count === 1 ? 'set' : 'sets'}`,
    `${venue.event_count} ${venue.event_count === 1 ? 'event' : 'events'}`,
  ].join(' · ')

  return (
    <Link
      to={`/venue/${venue.id}`}
      className="flex items-center gap-4 rounded-xl border border-border bg-gradient-card p-4 transition hover:scale-[1.01] hover:border-accent-400/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-500/20 text-accent-400">
        <MapPin size={22} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <h2 className="truncate font-display text-lg font-bold text-text-primary">{venue.name}</h2>
        {venue.location && <p className="truncate text-sm text-text-tertiary">{venue.location}</p>}
        <p className="mt-0.5 text-xs text-text-tertiary">{counts}</p>
      </div>
    </Link>
  )
}

export default function VenuesPage() {
  const [query, setQuery] = useState('')
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const offsetRef = useRef(0)

  useEffect(() => {
    document.title = PAGE_TITLE
    trackPageView('/venues')
  }, [])

  const load = useCallback(async (q, offset, append) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(offset))
    const data = await fetchPublicJson(`/api/venues?${params.toString()}`, {}, 'Failed to load venues')
    setHasMore(Boolean(data.hasMore))
    setVenues(prev => (append ? [...prev, ...data.venues] : data.venues))
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    offsetRef.current = 0
    const handle = setTimeout(() => {
      load(query.trim(), 0, false)
        .catch(err => {
          if (active) setError(err)
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 250)
    return () => {
      active = false
      clearTimeout(handle)
    }
  }, [query, load])

  const handleLoadMore = async () => {
    setLoadingMore(true)
    const nextOffset = offsetRef.current + PAGE_SIZE
    try {
      await load(query.trim(), nextOffset, true)
      offsetRef.current = nextOffset
    } catch (err) {
      setError(err)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-gradient-dark">
      {/* Identity meta (canonical/og:* /description) is SSR-owned for this route
          -- functions/utils/staticPageMeta.js's STATIC_PAGES["/venues"] entry
          injects it server-side. Declaring it here too would duplicate it on
          mount instead of replacing it (react-helmet-async can't adopt tags it
          didn't create). */}
      <Helmet>
        <title>{PAGE_TITLE}</title>
      </Helmet>

      <header className="border-b border-accent-500/30 px-4 py-8">
        <div className="container mx-auto flex max-w-7xl items-start justify-between gap-4">
          <div>
            <Link
              to="/"
              className="mb-2 inline-flex items-center gap-1.5 text-sm text-accent-400 transition-colors hover:text-accent-300"
            >
              <ArrowLeft size={14} aria-hidden="true" /> SetTimes
            </Link>
            <h1 className="font-display text-4xl font-bold text-text-primary">Venues</h1>
            <p className="mt-1 text-lg text-accent-400">Every stage that&apos;s hosted a SetTimes event</p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="relative mb-8 max-w-md">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search venues by name or city…"
            aria-label="Search venues by name or city"
            className="min-h-[44px] w-full rounded-full border border-border bg-bg-purple/60 py-3 pl-10 pr-4 text-text-primary placeholder:text-text-tertiary focus:border-accent-400 focus:outline-hidden"
          />
        </div>

        {error ? (
          <p className="py-16 text-center text-text-secondary">{error.message}</p>
        ) : loading ? (
          <p className="py-16 text-center text-text-tertiary">Loading venues…</p>
        ) : venues.length === 0 ? (
          <p className="py-16 text-center text-text-secondary">
            {query.trim() ? `No venues match “${query.trim()}”.` : 'No venues to show yet.'}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {venues.map(venue => (
                <VenueCard key={venue.id} venue={venue} />
              ))}
            </div>
            {hasMore && (
              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="min-h-[44px] rounded-full border border-accent-500/50 bg-accent-500/15 px-6 py-3 font-semibold text-accent-400 transition hover:bg-accent-500/25 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Footer />
    </main>
  )
}
