import { useState, useEffect } from 'react'
import Header from './components/Header'
import ComingUp from './components/ComingUp'
import ScheduleView from './components/ScheduleView'
import MySchedule from './components/MySchedule'
import VenueInfo from './components/VenueInfo'
import { validateBandsData } from './utils/validation'

// Cache-busting version - updates with each build
const DATA_VERSION = '7'
const BUILD_TIMESTAMP = Date.now()

function App() {
  const [bands, setBands] = useState([])
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showPast, setShowPast] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())

  useEffect(() => {
    // Load bands data with cache-busting version and timestamp
    fetch(`/bands.json?v=${DATA_VERSION}&t=${BUILD_TIMESTAMP}`)
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to load schedule (HTTP ${res.status})`)
        }
        return res.json()
      })
      .then(data => {
        // Validate schedule data
        const validation = validateBandsData(data)
        if (!validation.valid) {
          throw new Error(validation.error)
        }
        setBands(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load bands:', err)
        setError(err.message || 'Failed to load schedule. Please try refreshing the page.')
        setLoading(false)
      })
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

  const toggleBand = (bandId) => {
    setSelectedBands(prev =>
      prev.includes(bandId)
        ? prev.filter(id => id !== bandId)
        : [...prev, bandId]
    )
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

  if (loading) {
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
          <div className="text-red-400 text-6xl mb-4">
            <i className="fa-solid fa-circle-exclamation"></i>
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
      <Header view={view} setView={setView} />
      <ComingUp bands={myBands} />
      <main className="container mx-auto px-4 max-w-6xl mt-4 sm:mt-6 space-y-6 sm:space-y-8">
        {view === 'all' ? (
          <ScheduleView
            bands={bands}
            selectedBands={selectedBands}
            onToggleBand={toggleBand}
            onSelectAll={selectAll}
            currentTime={currentTime}
            showPast={showPast}
            onToggleShowPast={toggleShowPast}
          />
        ) : (
          <MySchedule
            bands={myBands}
            onToggleBand={toggleBand}
            onClearSchedule={clearSchedule}
            showPast={showPast}
            onToggleShowPast={toggleShowPast}
          />
        )}
      </main>
      <VenueInfo />
    </div>
  )
}

export default App
