import { Archive, Bell, CircleAlert, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Breadcrumbs from './components/Breadcrumbs'
import ComingUp from './components/ComingUp'
import Footer from './components/Footer'
import Header from './components/Header'
import OfflineIndicator from './components/OfflineIndicator'
import PrivacyBanner from './components/PrivacyBanner'
import ConfirmDialog from './components/ui/ConfirmDialog'
import LiveContextBar from './components/LiveContextBar'
import ScheduleView from './components/ScheduleView'
import ScheduleSkeleton from './components/ScheduleSkeleton'
import { trackEventView, trackPageView } from './utils/metrics'
import { validateBandsData } from './utils/validation'
import { prepareBands } from './utils/bandUtils'

const HINT_DISMISSED_KEY = 'scheduleHintDismissed'

const MySchedule = lazy(() => import('./components/MySchedule'))
const VenueInfo = lazy(() => import('./components/VenueInfo'))

const DEBUG_TIME_STORAGE_KEY = 'debugScheduleTime'

const FALLBACK_BANDS = []
const HAS_FALLBACK = false
const SCHEDULE_SESSION_KEY = 'scheduleSessionId'
const SELECTED_BANDS_KEY = 'selectedBandsByEvent'
const LEGACY_SELECTED_BANDS_KEY = 'selectedBands'

const generateSecureSessionId = () => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint8Array(16)
    window.crypto.getRandomValues(bytes)
    const hex = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    return `sched_${hex}`
  }

  // Fallback without Math.random; uniqueness is based on timestamp only.
  return `sched_${Date.now()}`
}

const getStoredSelection = slug => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return []
  }

  try {
    const scoped = window.localStorage.getItem(SELECTED_BANDS_KEY)
    if (scoped) {
      const parsed = JSON.parse(scoped)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const key = slug || 'default'
        const stored = parsed[key]
        return Array.isArray(stored) ? stored : []
      }
    }

    const legacy = window.localStorage.getItem(LEGACY_SELECTED_BANDS_KEY)
    if (!legacy) return []
    const parsedLegacy = JSON.parse(legacy)
    return Array.isArray(parsedLegacy) ? parsedLegacy : []
  } catch (error) {
    console.warn('[App] Failed to parse stored selectedBands', error)
    return []
  }
}

const getScheduleSessionId = () => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null
  }

  let sessionId = window.localStorage.getItem(SCHEDULE_SESSION_KEY)
  if (!sessionId) {
    if (window.crypto?.randomUUID) {
      sessionId = window.crypto.randomUUID()
    } else {
      sessionId = generateSecureSessionId()
    }
    window.localStorage.setItem(SCHEDULE_SESSION_KEY, sessionId)
  }

  return sessionId
}

const parseDebugTime = value => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const getInitialDebugTime = () => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null
  }

  const params = new URLSearchParams(window.location.search)
  const paramValue = params.get('debugTime')
  if (paramValue) {
    const parsed = parseDebugTime(paramValue)
    if (parsed) {
      return parsed
    }
  }

  const stored = window.localStorage.getItem(DEBUG_TIME_STORAGE_KEY)
  return parseDebugTime(stored)
}

const formatDebugInputValue = dateValue => {
  if (!(dateValue instanceof Date)) return ''
  const pad = value => String(value).padStart(2, '0')
  const year = dateValue.getFullYear()
  const month = pad(dateValue.getMonth() + 1)
  const day = pad(dateValue.getDate())
  const hours = pad(dateValue.getHours())
  const minutes = pad(dateValue.getMinutes())
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function App() {
  const { slug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [bands, setBands] = useState(FALLBACK_BANDS)
  const [eventData, setEventData] = useState(null)
  const [selectedBands, setSelectedBands] = useState(() => getStoredSelection(slug))
  const [view, setView] = useState(() => (getStoredSelection(slug).length > 0 ? 'mine' : 'all'))
  const [showHint, setShowHint] = useState(
    () => typeof window !== 'undefined' && !localStorage.getItem(HINT_DISMISSED_KEY)
  )
  const [timeFilter] = useState('all')
  const [loading, setLoading] = useState(!HAS_FALLBACK)
  const [error, setError] = useState(null)
  const [showPast, setShowPast] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [debugTime, setDebugTime] = useState(() => getInitialDebugTime())
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [sharedScheduleConfirmOpen, setSharedScheduleConfirmOpen] = useState(false)
  const [pendingSharedBands, setPendingSharedBands] = useState([])

  useEffect(() => {
    const controller = new AbortController()

    // Try loading from API first, then fallback to static file
    const loadData = async () => {
      try {
        // Try API endpoint first - use slug from URL or 'current' for default
        const eventParam = slug || 'current'
        const apiRes = await fetch(`/api/schedule?event=${eventParam}`, {
          signal: controller.signal,
        })

        if (!apiRes.ok) {
          throw new Error(`Failed to load schedule (HTTP ${apiRes.status})`)
        }

        const data = await apiRes.json()
        // API response can be { bands: [...], event: {...} } or just [...]
        const bandsData = Array.isArray(data) ? data : data.bands
        const eventInfo = data.event || null

        const validation = validateBandsData(bandsData)
        if (!validation.valid) {
          throw new Error(validation.error)
        }

        setError(null)
        setBands(prepareBands(bandsData))
        setEventData(eventInfo)
        setLoading(false)
      } catch (err) {
        if (controller.signal.aborted) {
          return
        }
        console.error('Failed to load bands:', err)
        if (!HAS_FALLBACK) {
          setError(err.message || 'Failed to load schedule. Please try refreshing the page.')
        }
        setLoading(false)
      }
    }

    loadData()
    return () => controller.abort()
  }, [slug])

  useEffect(() => {
    trackPageView(`/event/${slug || 'current'}`)
  }, [slug])

  useEffect(() => {
    if (eventData?.id) {
      trackEventView(eventData.id)
    }
  }, [eventData?.id])

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return
    }

    if (debugTime) {
      window.localStorage.setItem(DEBUG_TIME_STORAGE_KEY, debugTime.toISOString())
      window.__debugScheduleTime = debugTime.toISOString()
    } else {
      window.localStorage.removeItem(DEBUG_TIME_STORAGE_KEY)
      window.__debugScheduleTime = null
    }
  }, [debugTime])

  useEffect(() => {
    const stored = getStoredSelection(slug)
    setSelectedBands(stored)
    setView(stored.length > 0 ? 'mine' : 'all')
  }, [slug])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return
    }

    try {
      const key = slug || 'default'
      let nextState = {}
      const existing = window.localStorage.getItem(SELECTED_BANDS_KEY)
      if (existing) {
        const parsed = JSON.parse(existing)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          nextState = { ...parsed }
        }
      }

      nextState[key] = selectedBands
      window.localStorage.setItem(SELECTED_BANDS_KEY, JSON.stringify(nextState))
    } catch (error) {
      console.warn('[App] Failed to persist selectedBands', error)
    }
  }, [selectedBands, slug])

  useEffect(() => {
    const sParam = searchParams.get('s')
    if (!sParam || bands.length === 0) return

    const requestedIds = new Set(
      sParam
        .split(',')
        .map(s => s.trim())
        .filter(s => /^\d+$/.test(s))
    )

    const matchedStringIds = bands
      .filter(band => {
        const parts = band.id.split('-')
        const perfId = parts[parts.length - 1]
        return requestedIds.has(perfId)
      })
      .map(band => band.id)

    if (matchedStringIds.length === 0) return

    const existing = getStoredSelection(slug)

    const applySelection = () => {
      setSelectedBands(matchedStringIds)
      setView('mine')
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          next.delete('s')
          return next
        },
        { replace: true }
      )
    }

    if (existing.length === 0) {
      applySelection()
    } else {
      setPendingSharedBands(matchedStringIds)
      setSharedScheduleConfirmOpen(true)
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          next.delete('s')
          return next
        },
        { replace: true }
      )
    }
  }, [bands, searchParams, slug])

  const trackScheduleBuilds = async bandsToTrack => {
    if (!eventData?.id || !Array.isArray(bandsToTrack) || bandsToTrack.length === 0) {
      return
    }

    const performanceIds = bandsToTrack
      .map(band => band?.performance_id)
      .filter(id => typeof id === 'number' && Number.isFinite(id))

    if (performanceIds.length === 0) {
      return
    }

    const userSession = getScheduleSessionId()
    if (!userSession) {
      return
    }

    try {
      await fetch('/api/schedule/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventData.id,
          performance_ids: performanceIds,
          user_session: userSession,
        }),
      })
    } catch (error) {
      console.warn('[App] Failed to record schedule build', error)
    }
  }

  const dismissHint = () => {
    setShowHint(false)
    localStorage.setItem(HINT_DISMISSED_KEY, '1')
  }

  const toggleBand = bandId => {
    setSelectedBands(prev => {
      const isSelected = prev.includes(bandId)
      if (isSelected) {
        return prev.filter(id => id !== bandId)
      }

      const band = bands.find(candidate => candidate.id === bandId)
      trackScheduleBuilds(band ? [band] : [])
      // Auto-dismiss hint on first band selection
      if (showHint) dismissHint()
      return [...prev, bandId]
    })
  }

  const clearSchedule = () => {
    setClearConfirmOpen(true)
  }

  const selectAll = () => {
    const allBandIds = bands.map(band => band.id)
    trackScheduleBuilds(bands)
    setSelectedBands(allBandIds)
  }

  const isArchived = Boolean(eventData?.is_archived)
  const myBands = bands.filter(band => selectedBands.includes(band.id))
  const toggleShowPast = () => setShowPast(prev => !prev)
  const shouldShowLoading = loading && bands.length === 0
  const effectiveNow = debugTime || currentTime
  const debugEnabled = (() => {
    if (typeof window === 'undefined') return false
    const hostname = window.location.hostname || ''
    const isPreviewHost = hostname.startsWith('dev.') || hostname.endsWith('.pages.dev')
    const params = new URLSearchParams(window.location.search)
    return Boolean(params.get('debugTime')) || isPreviewHost || import.meta.env.DEV
  })()

  if (shouldShowLoading) {
    return <ScheduleSkeleton />
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="text-red-400 mb-4" aria-hidden="true">
            <CircleAlert size={64} />
          </div>
          <h2 className="text-white text-2xl font-bold mb-2">Oops! Something went wrong</h2>
          <p className="text-accent-400 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-accent-500 text-bg-navy font-semibold rounded-lg hover:brightness-110 transition-all"
          >
            Refresh Page
          </button>
        </div>
      </div>
    )
  }

  // Breadcrumb navigation
  const breadcrumbs = [{ label: 'Events', href: '/' }, { label: eventData?.name || 'Event Schedule' }]

  const eventDescription = eventData?.name
    ? `View the full schedule and set times for ${eventData.name}. Browse all artists and plan your evening.`
    : null

  const eventJsonLd = eventData
    ? JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: eventData.name,
        startDate: eventData.date,
        url: `https://settimes.ca/event/${slug}`,
        description: `Full set times and schedule for ${eventData.name}.`,
        ...(eventData.city && { location: { '@type': 'Place', address: eventData.city } }),
        organizer: { '@type': 'Organization', name: 'SetTimes', url: 'https://settimes.ca' },
      })
    : null

  return (
    <div className="min-h-screen pb-20">
      <Helmet>
        <title>{eventData?.name ? `${eventData.name} | SetTimes` : 'SetTimes'}</title>
        {eventDescription && <meta name="description" content={eventDescription} />}
        {slug && <link rel="canonical" href={`https://settimes.ca/event/${slug}`} />}
        {eventData && <meta property="og:title" content={`${eventData.name} | SetTimes`} />}
        {eventDescription && <meta property="og:description" content={eventDescription} />}
        <meta property="og:type" content="website" />
        {slug && <meta property="og:url" content={`https://settimes.ca/event/${slug}`} />}
        <meta property="og:site_name" content="SetTimes" />
        <meta name="twitter:card" content="summary" />
        {eventData && <meta name="twitter:title" content={`${eventData.name} | SetTimes`} />}
        {eventDescription && <meta name="twitter:description" content={eventDescription} />}
        {eventJsonLd && <script type="application/ld+json">{eventJsonLd}</script>}
      </Helmet>
      <OfflineIndicator />
      {isArchived ? (
        <header className="sticky top-0 z-50 border-b-2 border-white/10 bg-bg-navy/90 backdrop-blur-xs px-4 py-3">
          <div className="container mx-auto max-w-6xl flex items-center justify-between">
            <Link to="/" className="font-bold text-white font-display text-2xl hover:opacity-80 transition-opacity">
              <span className="text-accent-500">Set</span>Times
            </Link>
            <Link to="/" className="text-sm text-text-secondary hover:text-white transition-colors">
              ← All Events
            </Link>
          </div>
        </header>
      ) : (
        <Header
          view={view}
          setView={setView}
          selectedCount={myBands.length}
          eventName={eventData?.name}
          eventDate={eventData?.date}
        />
      )}
      {!isArchived && <ComingUp bands={myBands} currentTime={effectiveNow} />}
      {!isArchived && (
        <LiveContextBar eventData={eventData} currentTime={effectiveNow} bands={bands} selectedCount={myBands.length} />
      )}
      <main
        id="main-content"
        className="container mx-auto px-4 max-w-(--breakpoint-2xl) mt-4 sm:mt-6 space-y-6 sm:space-y-8"
      >
        <Breadcrumbs items={breadcrumbs} />

        {/* Archived event banner */}
        {isArchived && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-text-secondary">
            <Archive size={16} className="mt-0.5 shrink-0 text-text-tertiary" aria-hidden="true" />
            <div>
              <span className="font-semibold text-text-primary">This event has concluded.</span> You&apos;re viewing the
              archived lineup for reference.
            </div>
          </div>
        )}

        {/* First-time onboarding hint */}
        {!isArchived && showHint && selectedBands.length === 0 && bands.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-accent-500/10 border border-accent-500/20 text-sm">
            <p className="text-accent-300">
              <span className="font-semibold">How it works:</span> Tap any performer to add them to{' '}
              <span className="font-semibold">My Schedule</span> — your personal lineup for the night.
            </p>
            <button
              onClick={dismissHint}
              aria-label="Dismiss tip"
              className="shrink-0 text-accent-400 hover:text-white transition-colors p-1"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Reveal mode teaser — more bands dropping soon */}
        {!isArchived && eventData?.reveal_mode === 1 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-accent-500/10 border border-accent-500/20 text-sm">
            <Bell size={16} className="text-accent-400 shrink-0" aria-hidden="true" />
            <p className="text-accent-300">
              <span className="font-semibold">More bands dropping soon.</span>{' '}
              <a href="/subscribe" className="underline hover:text-accent-200 transition-colors">
                Subscribe for updates
              </a>{' '}
              or follow individual bands on their profile pages.
            </p>
          </div>
        )}

        {debugEnabled && (
          <section className="bg-bg-purple/80 border border-accent-500/30 rounded-lg p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h2 className="text-white font-semibold text-lg">Realtime Test Time</h2>
                <p className="text-white/60 text-sm">
                  Use this to simulate &ldquo;Now Playing&rdquo; and upcoming sets before event day.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-white/80 text-sm" htmlFor="debug-time">
                  Time override
                </label>
                <input
                  id="debug-time"
                  type="datetime-local"
                  value={formatDebugInputValue(debugTime)}
                  onChange={event => {
                    const value = event.target.value
                    if (!value) {
                      setDebugTime(null)
                      return
                    }
                    const parsed = parseDebugTime(value)
                    setDebugTime(parsed)
                  }}
                  className="px-3 py-2 rounded bg-bg-navy text-white border border-white/20 focus:border-accent-500 focus:outline-hidden text-sm"
                />
                <button
                  type="button"
                  onClick={() => setDebugTime(new Date())}
                  className="px-3 py-2 rounded bg-accent-500/20 border border-accent-500/40 text-accent-400 text-sm hover:bg-accent-500/30"
                >
                  Set to now
                </button>
                <button
                  type="button"
                  onClick={() => setDebugTime(null)}
                  className="px-3 py-2 rounded bg-white/10 border border-white/20 text-white/80 text-sm hover:bg-white/20"
                >
                  Clear override
                </button>
              </div>
            </div>
          </section>
        )}
        {isArchived || view === 'all' ? (
          <ScheduleView
            bands={bands}
            selectedBands={isArchived ? [] : selectedBands}
            onToggleBand={isArchived ? undefined : toggleBand}
            onSelectAll={isArchived ? undefined : selectAll}
            currentTime={effectiveNow}
            showPast={showPast}
            onToggleShowPast={toggleShowPast}
            timeFilter={timeFilter}
          />
        ) : (
          <Suspense
            fallback={
              <div className="py-16 text-center text-white/70" role="status" aria-live="polite">
                Loading your schedule...
              </div>
            }
          >
            <MySchedule
              bands={myBands}
              onToggleBand={toggleBand}
              onClearSchedule={clearSchedule}
              showPast={showPast}
              onToggleShowPast={toggleShowPast}
              nowOverride={debugTime}
            />
          </Suspense>
        )}
      </main>
      <Suspense
        fallback={
          <div className="py-12 text-center text-white/60" role="status" aria-live="polite">
            Loading venue tips...
          </div>
        }
      >
        <VenueInfo eventData={eventData} />
      </Suspense>
      <Footer />
      <PrivacyBanner />
      <ConfirmDialog
        isOpen={clearConfirmOpen}
        title="Clear Schedule"
        message="Are you sure you want to clear your entire schedule?"
        confirmText="Clear"
        onConfirm={() => {
          setClearConfirmOpen(false)
          setSelectedBands([])
          setView('all')
        }}
        onCancel={() => setClearConfirmOpen(false)}
        variant="danger"
      />
      <ConfirmDialog
        isOpen={sharedScheduleConfirmOpen}
        title="Load Shared Schedule?"
        message="Loading this shared schedule will replace your current picks."
        confirmText="Load"
        onConfirm={() => {
          setSharedScheduleConfirmOpen(false)
          setSelectedBands(pendingSharedBands)
          setView('mine')
          setPendingSharedBands([])
        }}
        onCancel={() => {
          setSharedScheduleConfirmOpen(false)
          setPendingSharedBands([])
        }}
      />
    </div>
  )
}

export default App
