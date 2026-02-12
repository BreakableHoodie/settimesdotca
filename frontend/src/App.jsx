import { faCircleExclamation } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import BackToTop from './components/BackToTop'
import Breadcrumbs from './components/Breadcrumbs'
import ComingUp from './components/ComingUp'
import Footer from './components/Footer'
import Header from './components/Header'
import OfflineIndicator from './components/OfflineIndicator'
import PrivacyBanner from './components/PrivacyBanner'
import ScheduleView from './components/ScheduleView'
import { BandCardSkeletonGrid } from './components/ui/Skeleton'
import { validateBandsData } from './utils/validation'
import { trackEventView, trackPageView } from './utils/metrics'

const MySchedule = lazy(() => import('./components/MySchedule'))
const VenueInfo = lazy(() => import('./components/VenueInfo'))

const DEBUG_TIME_STORAGE_KEY = 'debugScheduleTime'

function prepareBands(list) {
  return list.map(band => {
    const startMs = Date.parse(`${band.date}T${band.startTime}:00`)
    let endMs = Date.parse(`${band.date}T${band.endTime}:00`)

    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs < startMs) {
      endMs += 24 * 60 * 60 * 1000
    }

    return {
      ...band,
      startMs: Number.isNaN(startMs) ? 0 : startMs,
      endMs: Number.isNaN(endMs) ? 0 : endMs,
    }
  })
}

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
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [bands, setBands] = useState(FALLBACK_BANDS)
  const [eventData, setEventData] = useState(null)
  const [selectedBands, setSelectedBands] = useState(() => getStoredSelection(slug))
  const [view, setView] = useState(() => (getStoredSelection(slug).length > 0 ? 'mine' : 'all'))
  const [timeFilter] = useState('all')
  const [loading, setLoading] = useState(!HAS_FALLBACK)
  const [error, setError] = useState(null)
  const [showPast, setShowPast] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [debugTime, setDebugTime] = useState(() => getInitialDebugTime())
  const [isSharedSchedule, setIsSharedSchedule] = useState(false)
  const sharedScheduleRef = useRef(false)

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
    const sharedParam = searchParams.get('s')
    if (sharedParam) {
      const sharedIds = sharedParam
        .split(',')
        .map(Number)
        .filter(id => Number.isFinite(id) && id > 0)
      if (sharedIds.length > 0) {
        setSelectedBands(sharedIds)
        setView('mine')
        setIsSharedSchedule(true)
        sharedScheduleRef.current = true
        // Clean the ?s= param from the URL so refreshing uses localStorage
        navigate(`/event/${slug}`, { replace: true })
        return
      }
    }
    // Skip localStorage reset when navigate just cleared the ?s= param
    if (sharedScheduleRef.current) {
      sharedScheduleRef.current = false
      return
    }
    setIsSharedSchedule(false)
    const stored = getStoredSelection(slug)
    setSelectedBands(stored)
    setView(stored.length > 0 ? 'mine' : 'all')
  }, [slug, searchParams, navigate])

  // Sanitize shared IDs against loaded bands to avoid phantom selections
  useEffect(() => {
    if (bands.length === 0 || !searchParams.get('s')) return
    const validIds = new Set(bands.map(b => b.id))
    setSelectedBands(prev => {
      const filtered = prev.filter(id => validIds.has(id))
      return filtered.length === prev.length ? prev : filtered
    })
  }, [bands, searchParams])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return
    }

    // Don't overwrite localStorage when viewing a shared schedule
    if (isSharedSchedule) {
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
  }, [selectedBands, slug, isSharedSchedule])

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

  const toggleBand = bandId => {
    setSelectedBands(prev => {
      const isSelected = prev.includes(bandId)
      if (isSelected) {
        return prev.filter(id => id !== bandId)
      }

      const band = bands.find(candidate => candidate.id === bandId)
      trackScheduleBuilds(band ? [band] : [])
      return [...prev, bandId]
    })
  }

  const clearSchedule = () => {
    if (window.confirm('Are you sure you want to clear your entire schedule?')) {
      setSelectedBands([])
      setView('all')
    }
  }

  const selectAll = () => {
    const allBandIds = bands.map(band => band.id)
    trackScheduleBuilds(bands)
    setSelectedBands(allBandIds)
  }

  const myBands = bands.filter(band => selectedBands.includes(band.id))
  const shareUrl =
    selectedBands.length > 0 && slug ? `${window.location.origin}/event/${slug}?s=${selectedBands.join(',')}` : null
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
    return (
      <div className="min-h-screen pb-20">
        <Header view={view} setView={setView} selectedCount={selectedBands.length} />
        <main className="container mx-auto px-4 max-w-screen-2xl mt-4 sm:mt-6 space-y-6 sm:space-y-8">
          <div className="py-6">
            <BandCardSkeletonGrid count={6} />
          </div>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="text-red-400 text-6xl mb-4" aria-hidden="true">
            <FontAwesomeIcon icon={faCircleExclamation} />
          </div>
          <h2 className="text-white text-2xl font-bold mb-2">Oops! Something went wrong</h2>
          <p className="text-band-orange mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-band-orange text-band-navy font-semibold rounded-lg hover:brightness-110 transition-all"
          >
            Refresh Page
          </button>
        </div>
      </div>
    )
  }

  // Breadcrumb navigation
  const breadcrumbs = [{ label: 'Events', href: '/' }, { label: eventData?.name || 'Event Schedule' }]

  return (
    <div className="min-h-screen pb-20">
      <Helmet>
        <title>{eventData?.name ? `${eventData.name} | SetTimes` : 'SetTimes'}</title>
      </Helmet>
      <OfflineIndicator />
      <Header view={view} setView={setView} selectedCount={selectedBands.length} />
      <ComingUp bands={myBands} currentTime={effectiveNow} />
      <main id="main-content" className="container mx-auto px-4 max-w-screen-2xl mt-4 sm:mt-6 space-y-6 sm:space-y-8">
        <Breadcrumbs items={breadcrumbs} />
        {debugEnabled && (
          <section className="bg-band-purple/80 border border-band-orange/30 rounded-lg p-4">
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
                  className="px-3 py-2 rounded bg-band-navy text-white border border-white/20 focus:border-band-orange focus:outline-none text-sm"
                />
                <button
                  type="button"
                  onClick={() => setDebugTime(new Date())}
                  className="px-3 py-2 rounded bg-band-orange/20 border border-band-orange/40 text-band-orange text-sm hover:bg-band-orange/30"
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
        {view === 'all' ? (
          <ScheduleView
            bands={bands}
            selectedBands={selectedBands}
            onToggleBand={toggleBand}
            onSelectAll={selectAll}
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
              shareUrl={shareUrl}
              onBrowseAll={() => setView('all')}
              isSharedSchedule={isSharedSchedule}
              onDismissShared={() => {
                const stored = getStoredSelection(slug)
                setSelectedBands(stored)
                setView(stored.length > 0 ? 'mine' : 'all')
                setIsSharedSchedule(false)
              }}
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
      <BackToTop />
      <PrivacyBanner />
    </div>
  )
}

export default App
