import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import ScheduleView from '../components/ScheduleView'
import { validateBandsData } from '../utils/validation'

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

export default function EmbedPage() {
  const { slug } = useParams()
  const [bands, setBands] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentTime, setCurrentTime] = useState(() => new Date())

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    const loadEventData = async () => {
      try {
        setLoading(true)

        // Try to load event data by slug
        const response = await fetch(`/api/schedule?event=${encodeURIComponent(slug)}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Event not found: ${slug}`)
        }

        const data = await response.json()
        const bandsData = Array.isArray(data) ? data : data?.bands
        const validation = validateBandsData(bandsData)
        if (!validation.valid) {
          throw new Error(validation.error)
        }

        setBands(prepareBands(bandsData))
        setError(null)
      } catch (err) {
        if (controller.signal.aborted) {
          return
        }
        console.error('Failed to load event:', err)
        setError(err.message)
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    if (slug) {
      loadEventData()
    }

    return () => controller.abort()
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-navy flex items-center justify-center">
        <div className="text-accent-400 text-lg">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg-navy flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-white text-xl font-bold mb-2">Event Not Found</h2>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-navy p-2">
      <ScheduleView
        bands={bands}
        selectedBands={[]}
        onToggleBand={() => {}} // No-op for embed
        onSelectAll={() => {}} // No-op for embed
        currentTime={currentTime}
        showPast={false}
        onToggleShowPast={() => {}} // No-op for embed
        timeFilter="all"
        embedded={true}
      />
    </div>
  )
}
