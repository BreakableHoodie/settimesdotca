import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import ScheduleView from '../components/ScheduleView'
import { validateBandsData } from '../utils/validation'
import { prepareBands } from '../utils/bandUtils'
import { fetchPublicJson } from '../utils/publicApi'

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
        const data = await fetchPublicJson(
          `/api/schedule?event=${encodeURIComponent(slug)}`,
          { signal: controller.signal },
          `Event not found: ${slug}`
        )

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
    } else {
      setLoading(false)
      setError('No event slug provided.')
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
          <h2 className="text-text-primary text-xl font-bold mb-2">Event Not Found</h2>
          <p className="text-text-tertiary">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-navy p-2">
      <ScheduleView
        bands={bands}
        selectedBands={[]}
        currentTime={currentTime}
        showPast={false}
        timeFilter="all"
        eventSlug={slug}
      />
    </div>
  )
}
