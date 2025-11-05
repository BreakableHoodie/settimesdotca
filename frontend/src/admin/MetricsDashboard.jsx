import { useState, useEffect } from 'react'
import { eventsApi } from '../utils/adminApi'

export default function MetricsDashboard({ eventId }) {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMetrics()
  }, [eventId])

  const loadMetrics = async () => {
    try {
      const data = await eventsApi.getMetrics(eventId)
      setMetrics(data.metrics)
    } catch (error) {
      console.error('Failed to load metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="text-white">Loading metrics...</div>

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-white">Event Metrics</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Schedule Builds */}
        <div className="bg-band-purple rounded-lg p-4">
          <div className="text-gray-400 text-sm">Schedule Builds</div>
          <div className="text-3xl font-bold text-white mt-2">{metrics.totalScheduleBuilds}</div>
        </div>

        {/* Unique Visitors */}
        <div className="bg-band-purple rounded-lg p-4">
          <div className="text-gray-400 text-sm">Unique Visitors</div>
          <div className="text-3xl font-bold text-white mt-2">{metrics.uniqueVisitors}</div>
        </div>

        {/* Last Updated */}
        <div className="bg-band-purple rounded-lg p-4">
          <div className="text-gray-400 text-sm">Last Activity</div>
          <div className="text-lg text-white mt-2">
            {metrics.lastUpdated ? new Date(metrics.lastUpdated).toLocaleDateString() : 'Never'}
          </div>
        </div>
      </div>

      {/* Popular Bands */}
      <div className="bg-band-purple rounded-lg p-4">
        <h4 className="text-white font-semibold mb-3">Most Added Bands</h4>
        <div className="space-y-2">
          {metrics.popularBands.length > 0 ? (
            metrics.popularBands.map((band, idx) => (
              <div key={band.band_id} className="flex justify-between text-sm">
                <span className="text-white">
                  {idx + 1}. {band.band_name}
                </span>
                <span className="text-gray-400">{band.schedule_count} schedules</span>
              </div>
            ))
          ) : (
            <p className="text-gray-400 text-sm">No data available yet</p>
          )}
        </div>
      </div>
    </div>
  )
}
