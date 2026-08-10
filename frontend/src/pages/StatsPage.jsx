import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { fetchPublicJson } from '../utils/publicApi'
import { buildBandProfileHref } from '../utils/bandProfileLink'

const STAT_DEFS = [
  { key: 'bands', label: 'Bands' },
  { key: 'venues', label: 'Venues' },
  { key: 'events', label: 'Events' },
  { key: 'performances', label: 'Sets played' },
  { key: 'routes_shared', label: 'Routes shared' },
  { key: 'route_views', label: 'Route views' },
  { key: 'fans_following', label: 'Fans following bands' },
  { key: 'page_views', label: 'Page views' },
]

function formatNumber(value) {
  return (value || 0).toLocaleString()
}

// Zero-value metrics (expected pre-launch for engagement counters like fans
// following or routes shared) render in a muted tone instead of the bold
// accent color, so an early low count never reads as a broken/prominent "0".
function StatCard({ label, value }) {
  const isZero = !value
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-center">
      <div className={`text-2xl font-bold ${isZero ? 'text-text-tertiary' : 'text-accent-400'}`}>
        {formatNumber(value)}
      </div>
      <div className="mt-1 text-xs text-text-tertiary">{label}</div>
    </div>
  )
}

function TopBandRow({ band, rank }) {
  return (
    <Link
      to={buildBandProfileHref(band.name)}
      className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 transition hover:border-accent-400/50 hover:bg-surface-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
    >
      <span className="w-5 shrink-0 text-sm font-semibold text-text-tertiary">{rank}</span>
      <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{band.name}</span>
      {band.score > 0 && <span className="shrink-0 text-xs text-text-tertiary">{formatNumber(band.score)} pts</span>}
    </Link>
  )
}

export default function StatsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // react-helmet-async does not reliably set document.title in React 19 — set it
  // directly to match the <Helmet> title below. See BandProfilePage.jsx.
  useEffect(() => {
    document.title = 'Stats | SetTimes'
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    fetchPublicJson('/api/stats/public', {}, 'Failed to load stats')
      .then(result => {
        if (active) setData(result)
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
  }, [])

  return (
    <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple">
      {/* Identity meta (canonical/og:* /description) is SSR-owned for this route
          -- functions/utils/staticPageMeta.js's STATIC_PAGES["/stats"] entry
          injects it server-side. Declaring it here too would duplicate it on
          mount instead of replacing it (react-helmet-async can't adopt tags it
          didn't create). */}
      <Helmet>
        <title>Stats | SetTimes</title>
      </Helmet>

      <main id="main-content" tabIndex={-1} className="container mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8">
          <Link to="/" className="text-sm text-accent-400 transition-colors hover:text-accent-500">
            ← Back to SetTimes
          </Link>
        </div>

        <h1 className="mb-3 text-3xl font-bold text-text-primary">SetTimes by the Numbers</h1>
        <p className="mb-10 leading-relaxed text-text-secondary">
          A live look at the free, community-run schedule tool for Waterloo Region — every count below updates as the
          Vol. 17 lineup comes together.
        </p>

        {loading && <p className="py-16 text-center text-text-tertiary">Loading stats…</p>}

        {error && !loading && (
          <p className="py-16 text-center text-text-secondary">
            {error.message || "Couldn't load stats right now. Please try again shortly."}
          </p>
        )}

        {!loading && !error && data && (
          <>
            <div className="mb-12 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {STAT_DEFS.map(({ key, label }) => (
                <StatCard key={key} label={label} value={data[key]} />
              ))}
            </div>

            {Array.isArray(data.top_bands) && data.top_bands.length > 0 && (
              <section>
                <h2 className="mb-4 text-lg font-semibold text-text-primary">Top bands</h2>
                <ol className="space-y-2">
                  {data.top_bands.map((band, index) => (
                    <li key={band.slug || band.name}>
                      <TopBandRow band={band} rank={index + 1} />
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
