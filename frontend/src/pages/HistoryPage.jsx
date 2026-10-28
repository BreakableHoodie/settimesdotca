import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { ArrowLeft } from 'lucide-react'
import Footer from '../components/Footer'
import ThemeToggle from '../components/ThemeToggle.jsx'
import PosterImage from '../components/PosterImage'
import { fetchPublicJson } from '../utils/publicApi'
import { trackPageView } from '../utils/metrics'
import { parseLocalDate } from '../utils/timeFormat'

const PAGE_TITLE = 'Every edition | SetTimes'

const monthDay = date => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const year = date => date.getFullYear()

/** "May 22, 2022", or a range for a multi-day edition: "Jul 10–12, 2026", "Jul 31–Aug 2, 2026". */
export function formatEditionDate(start, end) {
  const s = parseLocalDate(start)
  if (!s) return ''
  const e = end ? parseLocalDate(end) : null
  if (!e || end === start) return `${monthDay(s)}, ${year(s)}`
  const sameMonth = s.getMonth() === e.getMonth() && year(s) === year(e)
  const tail = sameMonth ? e.getDate() : monthDay(e)
  return year(s) === year(e)
    ? `${monthDay(s)}–${tail}, ${year(e)}`
    : `${monthDay(s)}, ${year(s)}–${monthDay(e)}, ${year(e)}`
}

const yearOf = date => parseLocalDate(date)?.getFullYear()

// One edition on the wall. A concluded edition opens its recap; an upcoming one
// its live page. With no poster, or one that cannot load (#1368), a card with
// the name holds the same place, so the grid never shows a hole or a broken image.
function EditionTile({ edition }) {
  const [unavailablePoster, setUnavailablePoster] = useState(null)
  const href = edition.concluded ? `/events/${edition.slug}/recap` : `/event/${edition.slug}`
  const showPoster = edition.poster_url && unavailablePoster !== edition.poster_url
  const when = formatEditionDate(edition.date, edition.end_date)

  return (
    <li>
      <Link
        to={href}
        className="group block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 rounded-lg"
      >
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {showPoster ? (
            <PosterImage
              src={edition.poster_url}
              width={240}
              alt=""
              loading="lazy"
              decoding="async"
              className="aspect-[auto_3/4] h-auto w-full transition-opacity group-hover:opacity-90"
              onUnavailable={() => setUnavailablePoster(edition.poster_url)}
            />
          ) : (
            <div className="flex aspect-[3/4] flex-col justify-end bg-bg-purple p-3">
              <span className="font-display text-lg font-bold leading-tight text-text-primary">{edition.name}</span>
            </div>
          )}
        </div>
        <p className="mt-2 text-sm font-semibold leading-snug text-text-primary group-hover:text-accent-400">
          {edition.name}
        </p>
        <p className="text-sm text-text-tertiary">{when}</p>
      </Link>
    </li>
  )
}

export default function HistoryPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    document.title = PAGE_TITLE
    trackPageView('/history')
  }, [])

  // One request at a time: a Retry aborts the request it replaces, and leaving
  // the page aborts whichever is current, not just the first.
  const controllerRef = useRef(null)

  const load = useCallback(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setError(null)
    setData(null)
    fetchPublicJson('/api/history', { signal: controller.signal }, 'Failed to load the editions')
      .then(setData)
      .catch(err => {
        if (err?.name !== 'AbortError') setError(err)
      })
  }, [])

  useEffect(() => {
    load()
    return () => controllerRef.current?.abort()
  }, [load])

  const editions = data?.editions ?? []
  const oldest = editions.at(-1)
  const newest = editions.at(0)

  return (
    <div className="min-h-screen">
      {/* Identity meta (canonical, og:*, description) is SSR-owned for this
          route: STATIC_PAGES["/history"] in functions/utils/staticPageMeta.js. */}
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
            <h1 className="font-display text-4xl font-bold text-text-primary">Every edition</h1>
            {oldest && (
              <p className="mt-1 text-lg text-accent-400">
                {editions.length} editions since{' '}
                {parseLocalDate(oldest.date)?.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}, from{' '}
                {oldest.name} to {newest.name}.
              </p>
            )}
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main id="main-content" className="container mx-auto max-w-7xl space-y-12 px-4 py-8">
        {error ? (
          <div role="alert" className="py-16 text-center text-text-secondary">
            <p>Couldn&apos;t load the editions right now.</p>
            <button
              type="button"
              onClick={load}
              className="mt-4 min-h-[44px] rounded-lg bg-accent-500 px-4 py-2 font-semibold text-bg-navy hover:bg-accent-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500"
            >
              Retry
            </button>
          </div>
        ) : !data ? (
          <p className="py-16 text-center text-text-tertiary">Loading editions…</p>
        ) : (
          <>
            <section aria-labelledby="wall-heading">
              <h2 id="wall-heading" className="sr-only">
                Posters
              </h2>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {editions.map(edition => (
                  <EditionTile key={edition.slug} edition={edition} />
                ))}
              </ul>
            </section>

            {data.regulars.length > 0 && (
              <section aria-labelledby="regulars-heading">
                <h2 id="regulars-heading" className="font-display text-2xl font-bold text-text-primary">
                  Regulars
                </h2>
                <p className="mt-1 text-sm text-text-tertiary">Artists who have played the most editions.</p>
                <table className="mt-4 w-full text-left text-sm">
                  <thead className="text-text-tertiary">
                    <tr className="border-b border-border">
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Artist
                      </th>
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Editions
                      </th>
                      <th scope="col" className="py-2 font-medium">
                        First played
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.regulars.map(r => (
                      <tr key={r.band_profile_id} className="border-b border-border">
                        <td className="py-2 pr-4">
                          <Link to={`/band/${r.band_profile_id}`} className="text-accent-400 hover:text-accent-300">
                            {r.name}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 tabular-nums text-text-primary">{r.editions}</td>
                        <td className="py-2 text-text-secondary">{r.first.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {data.venues.length > 0 && (
              <section aria-labelledby="venues-heading">
                <h2 id="venues-heading" className="font-display text-2xl font-bold text-text-primary">
                  Venues
                </h2>
                {/* Older editions were entered without venues, so say where the
                    record starts rather than imply every venue began then. */}
                <p className="mt-1 text-sm text-text-tertiary">
                  Venues are on record from{' '}
                  {parseLocalDate(
                    data.venues.reduce((min, v) => (v.first_date < min ? v.first_date : min), '9999')
                  )?.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}{' '}
                  on.
                </p>
                <table className="mt-4 w-full text-left text-sm">
                  <thead className="text-text-tertiary">
                    <tr className="border-b border-border">
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Venue
                      </th>
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Editions
                      </th>
                      <th scope="col" className="py-2 font-medium">
                        Years
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.venues.map(v => {
                      const first = yearOf(v.first_date)
                      const last = yearOf(v.last_date)
                      return (
                        <tr key={v.venue_id} className="border-b border-border">
                          <td className="py-2 pr-4 text-text-primary">{v.name}</td>
                          <td className="py-2 pr-4 tabular-nums text-text-primary">{v.editions}</td>
                          <td className="py-2 tabular-nums text-text-secondary">
                            {first === last ? first : `${first}–${last}`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  )
}
