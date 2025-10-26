import { faCircleExclamation } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { lazy, Suspense, useEffect, useState } from 'react'
import bandsFallbackRaw from '../public/bands.json?raw'
import ComingUp from './components/ComingUp'
import Header from './components/Header'
import OfflineIndicator from './components/OfflineIndicator'
import ScheduleView from './components/ScheduleView'
import { validateBandsData } from './utils/validation'

const MySchedule = lazy(() => import('./components/MySchedule'))
const VenueInfo = lazy(() => import('./components/VenueInfo'))

// Cache-busting version - updates with each build
const DATA_VERSION = '8'

function prepareBands(list) {
  return list.map(band => {
    const startMs = Date.parse(`${band.date}T${band.startTime}:00`)
    const endMs = Date.parse(`${band.date}T${band.endTime}:00`)
    return {
      ...band,
      startMs: Number.isNaN(startMs) ? 0 : startMs,
      endMs: Number.isNaN(endMs) ? 0 : endMs,
    }
  })
}

const FALLBACK_BANDS = (() => {
  try {
    const parsed = JSON.parse(bandsFallbackRaw)
    return Array.isArray(parsed) ? prepareBands(parsed) : []
  } catch (error) {
    console.warn('[App] Failed to parse embedded bands fallback', error)
    return []
  }
})()
const HAS_FALLBACK = FALLBACK_BANDS.length > 0

function App() {
  const [bands, setBands] = useState(FALLBACK_BANDS)
  const [eventData, setEventData] = useState(null)
  const [selectedBands, setSelectedBands] = useState(() => {
    const saved = localStorage.getItem('selectedBands')
    return saved ? JSON.parse(saved) : []
  })
  const [view, setView] = useState(() => {
    // If user has selected bands, default to 'mine' view
    const saved = localStorage.getItem('selectedBands')
    const hasBands = saved && JSON.parse(saved).length > 0
    return hasBands ? 'mine' : 'all'
  })
  const [timeFilter, setTimeFilter] = useState('all')
  const [loading, setLoading] = useState(!HAS_FALLBACK)
  const [error, setError] = useState(null)
  const [showPast, setShowPast] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())

  useEffect(() => {
    const controller = new AbortController()

    // Try loading from API first, then fallback to static file
    const loadData = async () => {
      try {
        // Try API endpoint first
        const apiRes = await fetch('/api/schedule?event=current', {
          signal: controller.signal,
        })

        if (apiRes.ok) {
          const data = await apiRes.json()
          // API response can be { bands: [...], event: {...} } or just [...]
          const bandsData = Array.isArray(data) ? data : data.bands
          const eventInfo = data.event || null

          const validation = validateBandsData(bandsData)
          if (validation.valid) {
            setError(null)
            setBands(prepareBands(bandsData))
            setEventData(eventInfo)
            setLoading(false)
            return
          }
        }

        // API failed or returned invalid data, try static file
        const staticRes = await fetch(`/bands.json?v=${DATA_VERSION}`, {
          signal: controller.signal,
        })

        if (!staticRes.ok) {
          throw new Error(`Failed to load schedule (HTTP ${staticRes.status})`)
        }

        const data = await staticRes.json()
        const validation = validateBandsData(data)
        if (!validation.valid) {
          throw new Error(validation.error)
        }

        setError(null)
        setBands(prepareBands(data))
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
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Persist selected bands to localStorage
    localStorage.setItem('selectedBands', JSON.stringify(selectedBands))
  }, [selectedBands])

  const toggleBand = bandId => {
    setSelectedBands(prev => (prev.includes(bandId) ? prev.filter(id => id !== bandId) : [...prev, bandId]))
  }

  const clearSchedule = () => {
    if (window.confirm('Are you sure you want to clear your entire schedule?')) {
      setSelectedBands([])
      setView('all')
    }
  }

  const selectAll = () => {
    const allBandIds = bands.map(band => band.id)
    setSelectedBands(allBandIds)
  }

  const myBands = bands.filter(band => selectedBands.includes(band.id))
  const toggleShowPast = () => setShowPast(prev => !prev)
  const shouldShowLoading = loading && bands.length === 0

  if (shouldShowLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-band-orange text-xl">Loading...</div>
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

  return (
    <div className="min-h-screen pb-20">
      <OfflineIndicator />
      <Header 
        view={view} 
        setView={setView} 
        timeFilter={timeFilter}
        onTimeFilterChange={setTimeFilter}
      />
      <ComingUp bands={myBands} />
      <main className="container mx-auto px-4 max-w-screen-2xl mt-4 sm:mt-6 space-y-6 sm:space-y-8">
        {view === 'all' ? (
          <ScheduleView
            bands={bands}
            selectedBands={selectedBands}
            onToggleBand={toggleBand}
            onSelectAll={selectAll}
            currentTime={currentTime}
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
    </div>
  )
}

export default App
