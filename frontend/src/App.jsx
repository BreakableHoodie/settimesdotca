import { Archive, Bell, CircleAlert, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Breadcrumbs from './components/Breadcrumbs'
import ComingUp from './components/ComingUp'
import Footer from './components/Footer'
import Header from './components/Header'
import OfflineIndicator from './components/OfflineIndicator'
import PrivacyBanner from './components/PrivacyBanner'
import LiveContextBar from './components/LiveContextBar'
import ScheduleView from './components/ScheduleView'
import ScheduleSkeleton from './components/ScheduleSkeleton'
import { ConfirmDialog, Modal } from './components/ui'
import { trackEventView, trackPageView } from './utils/metrics'
import { getTimeFilterOptions } from './utils/timeFilter'
import { validateBandsData } from './utils/validation'
import { prepareBands } from './utils/bandUtils'
import { saveSelectedBands } from './utils/scheduleStorage'

const HINT_DISMISSED_KEY = 'scheduleHintDismissed'
const TIME_FILTERS_STORAGE_KEY = 'timeFiltersByEvent'
const SCHEDULE_TOAST_DURATION_MS = 5000
const VALID_TIME_FILTERS = new Set(getTimeFilterOptions().map(option => option.value))

const MySchedule = lazy(() => import('./components/MySchedule'))
const VenueInfo = lazy(() => import('./components/VenueInfo'))

const DEBUG_TIME_STORAGE_KEY = 'debugScheduleTime'

const FALLBACK_BANDS = []
const HAS_FALLBACK = false
const SCHEDULE_SESSION_KEY = 'scheduleSessionId'
const SELECTED_BANDS_KEY = 'selectedBandsByEvent'
const LEGACY_SELECTED_BANDS_KEY = 'selectedBands'

const getStoredTimeFilter = slug => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return 'all'
  }

  try {
    const stored = window.localStorage.getItem(TIME_FILTERS_STORAGE_KEY)
    if (!stored) return 'all'

    const parsed = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return 'all'
    }

    const nextFilter = parsed[slug || 'default']
    return VALID_TIME_FILTERS.has(nextFilter) ? nextFilter : 'all'
  } catch {
    return 'all'
  }
}

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
  const [loading, setLoading] = useState(!HAS_FALLBACK)
  const [error, setError] = useState(null)
  const [showPast, setShowPast] = useState(false)
  const [timeFilter, setTimeFilter] = useState(() => getStoredTimeFilter(slug))
  const [venueFilter, setVenueFilter] = useState(null)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [debugTime, setDebugTime] = useState(() => getInitialDebugTime())
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [sharedScheduleConfirmOpen, setSharedScheduleConfirmOpen] = useState(false)
  const [pendingSharedBands, setPendingSharedBands] = useState([])
  const [pendingSharedBandNames, setPendingSharedBandNames] = useState([])
  const [lastClearedBands, setLastClearedBands] = useState([])
  const [scheduleToast, setScheduleToast] = useState(null)
  const scheduleToastTimeoutRef = useRef(null)

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
    setTimeFilter(getStoredTimeFilter(slug))
    setVenueFilter(null)
  }, [slug])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return
    }

    try {
      const key = slug || 'default'
      let nextState = {}
      const existing = window.localStorage.getItem(TIME_FILTERS_STORAGE_KEY)
      if (existing) {
        const parsed = JSON.parse(existing)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          nextState = { ...parsed }
        }
      }

      nextState[key] = VALID_TIME_FILTERS.has(timeFilter) ? timeFilter : 'all'
      window.localStorage.setItem(TIME_FILTERS_STORAGE_KEY, JSON.stringify(nextState))
    } catch (error) {
      console.warn('[App] Failed to persist timeFilter', error)
    }
  }, [slug, timeFilter])

  useEffect(() => {
    return () => {
      if (scheduleToastTimeoutRef.current) {
        window.clearTimeout(scheduleToastTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    saveSelectedBands(slug || 'default', selectedBands, eventData?.date)
  }, [selectedBands, slug, eventData?.date])

  // react-helmet-async does not reliably set document.title in React 19 — set it
  // directly. Mirrors the <Helmet> <title> below. See BandProfilePage.jsx.
  useEffect(() => {
    document.title = eventData?.name ? `${eventData.name} | SetTimes` : 'SetTimes'
  }, [eventData?.name])

  const clearScheduleToast = useCallback(({ clearUndoState = false } = {}) => {
    if (scheduleToastTimeoutRef.current) {
      window.clearTimeout(scheduleToastTimeoutRef.current)
      scheduleToastTimeoutRef.current = null
    }
    setScheduleToast(null)
    if (clearUndoState) {
      setLastClearedBands([])
    }
  }, [])

  const showScheduleToast = useCallback(
    (nextToast, { duration = SCHEDULE_TOAST_DURATION_MS, clearUndoStateOnDismiss = false } = {}) => {
      clearScheduleToast()
      setScheduleToast(nextToast)

      if (duration <= 0 || typeof window === 'undefined') {
        return
      }

      scheduleToastTimeoutRef.current = window.setTimeout(() => {
        setScheduleToast(null)
        if (clearUndoStateOnDismiss) {
          setLastClearedBands([])
        }
        scheduleToastTimeoutRef.current = null
      }, duration)
    },
    [clearScheduleToast]
  )

  const trackScheduleBuilds = useCallback(
    async bandsToTrack => {
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
    },
    [eventData]
  )

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
      const importedBands = bands.filter(band => matchedStringIds.includes(band.id))
      trackScheduleBuilds(importedBands)
      setSelectedBands(matchedStringIds)
      setView('mine')
      showScheduleToast({
        type: 'success',
        message: `Loaded ${matchedStringIds.length} shared ${matchedStringIds.length === 1 ? 'stop' : 'stops'}.`,
      })
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
  }, [bands, searchParams, setSearchParams, showScheduleToast, slug, trackScheduleBuilds])

  useEffect(() => {
    const shareSlug = searchParams.get('share')
    if (!shareSlug || bands.length === 0) return

    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev)
        next.delete('share')
        return next
      },
      { replace: true }
    )

    // ?import=1 — this is the apply-the-route refetch after the preview already
    // counted the view, so it must not inflate share view_count (see share/[slug].js).
    fetch(`/api/schedule/share/${encodeURIComponent(shareSlug)}?import=1`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(data => {
        const matchedBands = bands.filter(band => {
          const parts = band.id.split('-')
          const perfId = Number(parts[parts.length - 1])
          return data.performance_ids.includes(perfId)
        })
        const matchedIds = matchedBands.map(band => band.id)
        const matchedNames = matchedBands.map(band => band.name || '')

        if (matchedIds.length === 0) return

        setPendingSharedBands(matchedIds)
        setPendingSharedBandNames(matchedNames)
        setSharedScheduleConfirmOpen(true)
      })
      .catch(err => {
        console.warn('[App] Failed to load share link', err)
      })
  }, [bands, searchParams, setSearchParams])

  const dismissHint = () => {
    setShowHint(false)
    localStorage.setItem(HINT_DISMISSED_KEY, '1')
  }

  const applySharedSchedule = mode => {
    const selectedBandIds = new Set(selectedBands)
    const importedBands = bands.filter(
      band => pendingSharedBands.includes(band.id) && (mode === 'replace' || !selectedBandIds.has(band.id))
    )
    const nextSelectedBands =
      mode === 'merge' ? Array.from(new Set([...selectedBands, ...pendingSharedBands])) : [...pendingSharedBands]

    if (importedBands.length > 0) {
      trackScheduleBuilds(importedBands)
    }

    setSharedScheduleConfirmOpen(false)
    setSelectedBands(nextSelectedBands)
    setView('mine')
    setPendingSharedBands([])
    setPendingSharedBandNames([])
    showScheduleToast({
      type: 'success',
      message:
        mode === 'merge'
          ? `Merged ${importedBands.length} new ${importedBands.length === 1 ? 'stop' : 'stops'} into your route.`
          : `Replaced your route with ${pendingSharedBands.length} shared ${pendingSharedBands.length === 1 ? 'stop' : 'stops'}.`,
    })
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
    if (selectedBands.length === 0) {
      return
    }
    setClearConfirmOpen(true)
  }

  const doActualClear = () => {
    const clearedBands = [...selectedBands]
    setLastClearedBands(clearedBands)
    setSelectedBands([])
    setView('all')
    setClearConfirmOpen(false)
    showScheduleToast(
      {
        type: 'undo',
        message: `Cleared ${clearedBands.length} ${clearedBands.length === 1 ? 'stop' : 'stops'} from your route.`,
      },
      { clearUndoStateOnDismiss: true }
    )
  }

  const undoClearSchedule = () => {
    if (lastClearedBands.length === 0) {
      return
    }

    setSelectedBands(lastClearedBands)
    setView('mine')
    clearScheduleToast({ clearUndoState: true })
  }

  const selectAll = (bandsToSelect = bands) => {
    const normalizedBands = Array.isArray(bandsToSelect)
      ? bandsToSelect.filter(band => band && typeof band.id === 'string')
      : []

    if (normalizedBands.length === 0) {
      return
    }

    const selectedBandIds = new Set(selectedBands)
    const newlySelectedBands = normalizedBands.filter(band => !selectedBandIds.has(band.id))

    if (newlySelectedBands.length === 0) {
      return
    }

    if (showHint) {
      dismissHint()
    }

    trackScheduleBuilds(newlySelectedBands)
    setSelectedBands(prev => {
      const nextSelectedBandIds = new Set(prev)
      normalizedBands.forEach(band => nextSelectedBandIds.add(band.id))
      return Array.from(nextSelectedBandIds)
    })
  }

  const isArchived = Boolean(eventData?.is_archived)
  const myBands = bands.filter(band => selectedBands.includes(band.id))
  const sharedBandsAlreadySelectedCount = pendingSharedBands.filter(id => selectedBands.includes(id)).length
  const sharedBandsNewCount = pendingSharedBands.length - sharedBandsAlreadySelectedCount
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
          <h2 className="text-text-primary text-2xl font-bold mb-2">Oops! Something went wrong</h2>
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
        '@type': 'MusicEvent',
        name: eventData.name,
        startDate: eventData.date,
        endDate: eventData.end_date || eventData.date,
        url: `https://settimes.ca/event/${slug}`,
        description: `Full set times and schedule for ${eventData.name}.`,
        location: {
          '@type': 'Place',
          ...(eventData.city
            ? { address: { '@type': 'PostalAddress', addressLocality: eventData.city, addressCountry: 'CA' } }
            : { name: 'Canada', address: { '@type': 'PostalAddress', addressCountry: 'CA' } }),
        },
        organizer: { '@type': 'Organization', name: 'SetTimes', url: 'https://settimes.ca' },
        ...(eventData.ticket_url && {
          offers: {
            '@type': 'Offer',
            url: eventData.ticket_url,
            availability: 'https://schema.org/InStock',
          },
        }),
        ...(bands?.length && {
          performer: bands.filter(b => b.name).map(b => ({ '@type': 'MusicGroup', name: b.name })),
        }),
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
        <meta property="og:type" content="event" />
        {slug && <meta property="og:url" content={`https://settimes.ca/event/${slug}`} />}
        <meta property="og:site_name" content="SetTimes" />
        <meta name="twitter:card" content="summary" />
        {eventData && <meta name="twitter:title" content={`${eventData.name} | SetTimes`} />}
        {eventDescription && <meta name="twitter:description" content={eventDescription} />}
        {eventJsonLd && <script type="application/ld+json">{eventJsonLd}</script>}
      </Helmet>
      <OfflineIndicator />
      {isArchived ? (
        <header className="sticky top-0 z-50 border-b-2 border-border bg-bg-navy/90 backdrop-blur-xs px-4 py-3">
          <div className="container mx-auto max-w-6xl flex items-center justify-between">
            <Link
              to="/"
              className="font-bold text-text-primary font-display text-2xl hover:opacity-80 transition-opacity"
            >
              <span className="text-accent-500">Set</span>Times
            </Link>
            <Link to="/" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
              ← All Events
            </Link>
          </div>
        </header>
      ) : (
        <Header eventName={eventData?.name} eventDate={eventData?.date} />
      )}
      {!isArchived && <ComingUp bands={myBands} currentTime={effectiveNow} />}
      {!isArchived && (
        <LiveContextBar
          eventData={eventData}
          currentTime={effectiveNow}
          bands={bands}
          selectedCount={myBands.length}
          view={view}
          onViewChange={setView}
          venueFilter={venueFilter}
          onVenueFilterChange={setVenueFilter}
          timeFilter={timeFilter}
          onTimeFilterChange={setTimeFilter}
        />
      )}
      <main
        id="main-content"
        className="container mx-auto px-4 max-w-(--breakpoint-2xl) mt-3 sm:mt-6 space-y-6 sm:space-y-8"
      >
        {/* Primary page heading for SEO/a11y. The event name is shown visually in
            the LiveContextBar (as h2); this gives the <main> landmark a correct h1
            naming the page topic without duplicating it on screen. */}
        <h1 className="sr-only">{eventData?.name ? `${eventData.name} — set times & schedule` : 'Event schedule'}</h1>
        <div className="hidden sm:block">
          <Breadcrumbs items={breadcrumbs} />
        </div>

        {/* Archived event banner */}
        {isArchived && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-surface border border-border text-text-secondary">
            <Archive size={16} className="mt-0.5 shrink-0 text-text-tertiary" aria-hidden="true" />
            <div>
              <span className="font-semibold text-text-primary">This event has concluded.</span> You&apos;re viewing the
              archived lineup for reference.
            </div>
          </div>
        )}

        {/* First-time onboarding hint */}
        {!isArchived && showHint && selectedBands.length === 0 && bands.length > 0 && (
          <div className="flex items-start justify-between gap-2 rounded-lg border border-accent-500/20 bg-accent-500/10 px-3 py-2.5 text-xs sm:items-center sm:gap-3 sm:px-4 sm:py-3 sm:text-sm">
            <p className="text-text-secondary">
              <span className="font-semibold">How it works:</span> Tap any performer to add them to{' '}
              <span className="font-semibold">My Route</span> — your personal lineup for the night.
            </p>
            <button
              onClick={dismissHint}
              aria-label="Dismiss tip"
              className="shrink-0 p-1 text-accent-400 transition-colors hover:text-text-primary sm:p-1.5"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Reveal mode teaser — more bands dropping soon */}
        {!isArchived && eventData?.reveal_mode === 1 && (
          <div className="flex items-start gap-2 rounded-lg border border-accent-500/20 bg-accent-500/10 px-3 py-2.5 text-xs sm:items-center sm:gap-3 sm:px-4 sm:py-3 sm:text-sm">
            <Bell size={16} className="shrink-0 text-accent-400" aria-hidden="true" />
            <p className="text-text-secondary">
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
                <h2 className="text-text-primary font-semibold text-lg">Realtime Test Time</h2>
                <p className="text-text-tertiary text-sm">
                  Use this to simulate &ldquo;Now Playing&rdquo; and upcoming sets before event day.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-text-secondary text-sm" htmlFor="debug-time">
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
                  className="px-3 py-2 rounded bg-bg-navy text-text-primary border border-border focus:border-accent-500 focus:outline-hidden text-sm"
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
                  className="px-3 py-2 rounded bg-surface border border-border text-text-secondary text-sm hover:bg-surface-hover"
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
            venueFilter={venueFilter}
            onVenueFilterChange={setVenueFilter}
            showVenueFilter={false}
            eventSlug={slug || eventData?.slug}
          />
        ) : (
          <Suspense
            fallback={
              <div className="py-16 text-center text-text-secondary" role="status" aria-live="polite">
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
              onBrowseAll={() => setView('all')}
              eventSlug={slug || eventData?.slug}
              eventId={eventData?.id}
            />
          </Suspense>
        )}
      </main>
      <Suspense
        fallback={
          <div className="py-12 text-center text-text-tertiary" role="status" aria-live="polite">
            Loading venue tips...
          </div>
        }
      >
        <VenueInfo eventData={eventData} />
      </Suspense>
      <Footer />
      <PrivacyBanner />
      <Modal
        isOpen={sharedScheduleConfirmOpen}
        onClose={() => {
          setSharedScheduleConfirmOpen(false)
          setPendingSharedBands([])
          setPendingSharedBandNames([])
        }}
        title="Load Shared Route"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setSharedScheduleConfirmOpen(false)
                setPendingSharedBands([])
                setPendingSharedBandNames([])
              }}
              className="min-h-[44px] rounded-lg border border-border px-4 py-2 text-text-secondary transition-colors hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => applySharedSchedule('merge')}
              className="min-h-[44px] rounded-lg border border-accent-500/30 bg-accent-500/10 px-4 py-2 font-semibold text-accent-400 transition-colors hover:bg-accent-500/20"
            >
              Merge
            </button>
            <button
              type="button"
              onClick={() => applySharedSchedule('replace')}
              className="min-h-[44px] rounded-lg bg-accent-500 px-4 py-2 font-semibold text-bg-navy transition-colors hover:brightness-110"
            >
              Replace
            </button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-text-secondary">
          <p>Choose how to apply this shared route to your current picks.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface p-3">
              <div className="text-xs uppercase tracking-wide text-text-tertiary">Incoming stops</div>
              <div className="mt-1 text-2xl font-semibold text-text-primary">{pendingSharedBands.length}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3">
              <div className="text-xs uppercase tracking-wide text-text-tertiary">Already in your route</div>
              <div className="mt-1 text-2xl font-semibold text-text-primary">{sharedBandsAlreadySelectedCount}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3">
              <div className="text-xs uppercase tracking-wide text-text-tertiary">New to add</div>
              <div className="mt-1 text-2xl font-semibold text-text-primary">{sharedBandsNewCount}</div>
            </div>
          </div>
          <p className="text-text-secondary">
            <span className="font-semibold text-text-primary">Merge</span> keeps your current route and adds only the
            new shared stops. <span className="font-semibold text-text-primary">Replace</span> swaps your route for the
            shared one.
          </p>
          {pendingSharedBandNames.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-border bg-surface p-3 text-sm text-text-secondary list-none">
              {pendingSharedBandNames.slice(0, 5).map((name, i) => (
                <li key={i}>{name}</li>
              ))}
              {pendingSharedBandNames.length > 5 && (
                <li className="text-text-tertiary">and {pendingSharedBandNames.length - 5} more…</li>
              )}
            </ul>
          )}
        </div>
      </Modal>
      <ConfirmDialog
        isOpen={clearConfirmOpen}
        title="Clear Route"
        message="Are you sure you want to clear your entire route?"
        confirmText="Clear"
        onConfirm={doActualClear}
        onCancel={() => setClearConfirmOpen(false)}
      />
      {scheduleToast && (
        <div className="fixed bottom-4 left-1/2 z-50 w-full max-w-md -translate-x-1/2 px-4">
          <div className="rounded-xl border border-border bg-bg-purple/95 px-4 py-3 shadow-xl backdrop-blur-xs">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-text-secondary">{scheduleToast.message}</p>
              {scheduleToast.type === 'undo' ? (
                <button
                  type="button"
                  onClick={undoClearSchedule}
                  className="min-h-[44px] shrink-0 rounded-lg border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-sm font-semibold text-accent-400 transition-colors hover:bg-accent-500/20"
                >
                  Undo
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => clearScheduleToast({ clearUndoState: true })}
                  className="text-text-tertiary transition-colors hover:text-text-primary"
                  aria-label="Dismiss message"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
