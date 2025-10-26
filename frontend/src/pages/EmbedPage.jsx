import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import ScheduleView from '../components/ScheduleView'

export default function EmbedPage() {
  const { slug } = useParams()
  const [bands, setBands] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadEventData = async () => {
      try {
        setLoading(true)
        
        // Try to load event data by slug
        const response = await fetch(`/api/schedule?event=${slug}`)
        
        if (!response.ok) {
          throw new Error(`Event not found: ${slug}`)
        }
        
        const data = await response.json()
        setBands(data)
        setError(null)
      } catch (err) {
        console.error('Failed to load event:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (slug) {
      loadEventData()
    }
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen bg-band-navy flex items-center justify-center">
        <div className="text-band-orange text-lg">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-band-navy flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-white text-xl font-bold mb-2">Event Not Found</h2>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-band-navy p-2">
      <ScheduleView 
        bands={bands}
        selectedBands={[]}
        onToggleBand={() => {}} // No-op for embed
        onSelectAll={() => {}} // No-op for embed
        currentTime={new Date()}
        showPast={false}
        onToggleShowPast={() => {}} // No-op for embed
        timeFilter="all"
        embedded={true}
      />
    </div>
  )
}
