import { useState, useEffect } from 'react'
import Header from './components/Header'
import ComingUp from './components/ComingUp'
import ScheduleView from './components/ScheduleView'
import MySchedule from './components/MySchedule'
import VenueInfo from './components/VenueInfo'

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
  const [showPast, setShowPast] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())

  useEffect(() => {
    // Load bands data
    fetch('/bands.json')
      .then(res => res.json())
      .then(data => {
        setBands(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load bands:', err)
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
