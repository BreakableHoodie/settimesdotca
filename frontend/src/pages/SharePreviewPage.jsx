import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useNavigate, useParams } from 'react-router-dom'
import LockInLineupPanel from '../components/LockInLineupPanel'
import { Alert, BandCardSkeleton } from '../components/ui'
import { fetchPublicJson } from '../utils/publicApi'
import { AFTER_MIDNIGHT_THRESHOLD_HOUR } from '../utils/festivalDays'

/** Sentinel for an unresolvable date — sorts last, and never counts as a festival day. */
const UNKNOWN_DAY = Number.MAX_SAFE_INTEGER

/**
 * Parse an `HH:MM` clock value, rejecting anything out of range.
 * A NaN check alone is not enough: "25:99" parses to two perfectly good
 * numbers and would sort as 1599 minutes and render as "1:99 PM".
 * Shared by the sort and the formatter so they can never disagree on what
 * counts as a valid time.
 */
function parseTime(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

/**
 * Sort key applying the festival-day convention: a set starting before
 * AFTER_MIDNIGHT_THRESHOLD_HOUR belongs to the PREVIOUS evening and must sort
 * after the whole evening lineup, not at the top of it. Without this,
 * Cross Dog (00:15) and Dregs (01:10) lead the shared route.
 * The threshold has one canonical home (utils/festivalDays.js) — never re-encode it.
 * Returns `{ day, minutes }`; compare with compareBands, not by subtraction.
 */
function sortKey(band) {
  const time = parseTime(band.start_time)
  if (!time) return { day: UNKNOWN_DAY, minutes: Number.MAX_SAFE_INTEGER }
  const { hour: h, minute: m } = time

  const afterMidnight = h < AFTER_MIDNIGHT_THRESHOLD_HOUR
  const minutes = h * 60 + m + (afterMidnight ? 24 * 60 : 0)

  // A 00:15 set stored on Aug 3 belongs to Aug 2's evening, so its FESTIVAL day
  // is one calendar day earlier. Sorting on the raw date would split an evening
  // across two groups on a multi-day event; sorting on clock time alone (the
  // previous version) would interleave days that share a start time.
  //
  // Step back a CALENDAR day, not a fixed 24h: on a DST boundary a local day is
  // 23 or 25 hours long, so subtracting 86_400_000ms lands on the wrong date.
  // setDate() goes through the calendar and stays correct across the transition.
  let day = UNKNOWN_DAY
  if (band.performance_date) {
    const parsed = new Date(`${band.performance_date}T00:00:00`)
    if (!Number.isNaN(parsed.getTime())) {
      if (afterMidnight) parsed.setDate(parsed.getDate() - 1)
      day = parsed.getTime()
    }
  }
  return { day, minutes }
}

function compareBands(a, b) {
  const ka = sortKey(a)
  const kb = sortKey(b)
  return ka.day - kb.day || ka.minutes - kb.minutes
}

/** Festival day label, shown only when a route spans more than one. */
function festivalDayLabel(band) {
  const key = sortKey(band).day
  if (key === UNKNOWN_DAY) return null
  return new Date(key).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatSetTime(band) {
  const start = parseTime(band.start_time)
  if (!start) return null
  // A bad end_time drops the range rather than rendering "8:00 PM – NaN:NaN AM";
  // the start on its own is still useful to a fan.
  const end = parseTime(band.end_time)
  const to12h = ({ hour, minute }) => {
    const period = hour >= 12 ? 'PM' : 'AM'
    const h12 = hour % 12 === 0 ? 12 : hour % 12
    return `${h12}:${String(minute).padStart(2, '0')} ${period}`
  }
  return end ? `${to12h(start)} – ${to12h(end)}` : to12h(start)
}

export default function SharePreviewPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [shareData, setShareData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    setError(false)
    setShareData(null)
    fetchPublicJson(`/api/schedule/share/${encodeURIComponent(slug)}`)
      .then(data => {
        if (!cancelled) setShareData(data)
      })
      .catch(err => {
        if (cancelled) return
        if (err.status === 404) setNotFound(true)
        else setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  const pageTitle = notFound
    ? 'Shared Route Not Found | SetTimes'
    : error
      ? 'Error | SetTimes'
      : shareData
        ? `Shared Route — ${shareData.event_name} | SetTimes`
        : 'Shared Route | SetTimes'

  // react-helmet-async does not reliably set document.title in React 19 — set it
  // directly to match the <Helmet> titles below. See BandProfilePage.jsx.
  useEffect(() => {
    document.title = pageTitle
  }, [pageTitle])

  const handleImport = () => {
    if (!shareData) return
    navigate(`/event/${shareData.event_slug}?share=${slug}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <Link
            to="/"
            className="mb-6 inline-flex items-center gap-2 text-sm text-text-tertiary hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to events
          </Link>
          <div className="space-y-4">
            {Array.from({ length: 4 }, (_, i) => (
              <BandCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-bg-navy to-bg-purple px-4 text-center">
        <Helmet>
          <title>Shared Route Not Found | SetTimes</title>
        </Helmet>
        <p className="text-2xl font-semibold text-text-primary">This route has expired or doesn&apos;t exist.</p>
        <p className="mt-2 text-text-secondary">Share links are valid for 30 days.</p>
        <Link to="/" className="mt-6 text-accent-400 hover:underline">
          Browse events
        </Link>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple p-6">
        <Helmet>
          <title>Error | SetTimes</title>
        </Helmet>
        <Alert variant="error">Unable to load this shared route. Please try again later.</Alert>
      </div>
    )
  }

  // `bands` is the canonical render list -- it excludes performances that have
  // been hard-deleted since the link was shared (#733). `band_names` is the
  // untouched snapshot kept for the ?import=1 apply path, so counting it here
  // would render N-1 rows under an "N-stop route" heading.
  const stopCount = shareData.bands?.length ?? shareData.band_names.length

  return (
    <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple">
      <Helmet>
        <title>Shared Route — {shareData.event_name} | SetTimes</title>
      </Helmet>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link
          to={`/event/${shareData.event_slug}`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={14} />
          Back to {shareData.event_name}
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">{stopCount}-stop route</h1>
          <p className="mt-1 text-text-secondary">{shareData.event_name}</p>
        </div>

        <ul aria-label="Bands in this route" className="mb-8 list-none space-y-3 p-0">
          {(shareData.bands?.length
            ? [...shareData.bands].sort(compareBands)
            : shareData.band_names.map(name => ({ name }))
          ).map((band, i, list) => (
            <li key={band.performance_id ?? i} className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="font-semibold text-text-primary">
                {band.is_cancelled ? <s className="text-text-secondary">{band.name}</s> : band.name}
              </p>
              {band.is_cancelled === 1 && (
                <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-warning-500/25 px-2.5 py-1 text-xs font-semibold text-text-primary">
                  <TriangleAlert size={14} aria-hidden="true" />
                  Cancelled
                </span>
              )}
              {(formatSetTime(band) || band.venue) &&
                (() => {
                  // Only surface the day on a multi-day route — on a single-night
                  // crawl it is noise on every row.
                  // Count only KNOWN days. A band deleted since sharing has a
                  // null performance_date, and letting that sentinel count would
                  // stamp a date on every row of a single-night route.
                  const knownDays = new Set(list.map(b => sortKey(b).day).filter(d => d !== UNKNOWN_DAY))
                  const multiDay = knownDays.size > 1
                  const dayLabel = multiDay ? festivalDayLabel(band) : null
                  const parts = [dayLabel, formatSetTime(band), band.venue].filter(Boolean)
                  return <p className="mt-1 text-sm text-text-secondary">{parts.join(' · ')}</p>
                })()}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={handleImport}
          className="mb-6 w-full min-h-[48px] rounded-xl bg-accent-500 px-6 py-3 font-semibold text-bg-navy transition-colors hover:brightness-110"
        >
          Add {stopCount} stop{stopCount !== 1 ? 's' : ''} to my route for {shareData.event_name}
        </button>

        {/* shareData.bands is the LIVE, filtered list (#733 drops hard-deleted
            rows); shareData.performance_ids is the untouched snapshot kept
            only for the ?import=1 apply path (App.jsx) and still contains ids
            that no longer resolve. Deriving from bands here keeps the follow
            request in sync with what stopCount and the rows above actually
            show. */}
        <LockInLineupPanel
          performanceIds={shareData.bands?.map(b => b.performance_id) ?? shareData.performance_ids}
          bandCount={stopCount}
        />
      </div>
    </div>
  )
}
