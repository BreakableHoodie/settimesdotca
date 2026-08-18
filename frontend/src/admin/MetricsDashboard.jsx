import { useState, useEffect, useCallback } from 'react'
import { eventsApi } from '../utils/adminApi'

export default function MetricsDashboard({ eventId }) {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadMetrics = useCallback(async () => {
    try {
      const data = await eventsApi.getMetrics(eventId)
      setMetrics(data.metrics)
    } catch (error) {
      console.error('Failed to load metrics:', error)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    loadMetrics()
  }, [loadMetrics])

  if (loading) return <div className="text-white">Loading metrics...</div>

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-white">Event Metrics</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Sets Picked */}
        <div className="bg-bg-purple rounded-lg p-4">
          <div className="text-gray-400 text-sm">Sets Picked</div>
          <div className="text-3xl font-bold text-white mt-2">{metrics.totalScheduleBuilds}</div>
        </div>

        {/* Route Builders */}
        <div className="bg-bg-purple rounded-lg p-4">
          <div className="text-gray-400 text-sm">Fans Who Built a Route</div>
          <div className="text-3xl font-bold text-white mt-2">{metrics.routeBuilders}</div>
        </div>

        {/* Route Completion Rate */}
        <div className="bg-bg-purple rounded-lg p-4">
          <div className="text-gray-400 text-sm">Route Completion Rate</div>
          <div className="text-3xl font-bold text-white mt-2">
            {typeof metrics.completionRate === 'number'
              ? `${Math.min(metrics.completionRate, 100).toFixed(1)}%`
              : 'n/a'}
          </div>
          <p className="text-gray-400 text-xs mt-2">
            Routes built ÷ event page views, not unique visitors. Page-view history may be shorter than the event
            page&apos;s full history.
          </p>
        </div>

        {/* Last Updated */}
        <div className="bg-bg-purple rounded-lg p-4">
          <div className="text-gray-400 text-sm">Last Activity</div>
          <div className="text-lg text-white mt-2">
            {metrics.lastUpdated ? new Date(metrics.lastUpdated).toLocaleDateString() : 'Never'}
          </div>
        </div>

        {/* Shares Created */}
        <div className="bg-bg-purple rounded-lg p-4">
          <div className="text-gray-400 text-sm">Shares Created</div>
          <div className="text-3xl font-bold text-white mt-2">{metrics.totalShares ?? 0}</div>
        </div>

        {/* Share Views */}
        <div className="bg-bg-purple rounded-lg p-4">
          <div className="text-gray-400 text-sm">Share Views</div>
          <div className="text-3xl font-bold text-white mt-2">{metrics.totalShareViews ?? 0}</div>
        </div>

        {/* Shares Imported — the conversion signal: a fan adopted someone else's route */}
        <div className="bg-bg-purple rounded-lg p-4">
          <div className="text-gray-400 text-sm">Shares Imported</div>
          <div className="text-3xl font-bold text-white mt-2">{metrics.totalShareImports ?? 0}</div>
        </div>
      </div>

      {/* Route-size distribution */}
      <div className="bg-bg-purple rounded-lg p-4">
        <h4 className="text-white font-semibold mb-3">Route Size Distribution</h4>
        <div className="space-y-2">
          {(metrics.routeSizeDistribution || []).map(route => (
            <div key={route.bucket} className="flex justify-between text-sm">
              <span className="text-white">
                {route.bucket} {route.bucket === '1' ? 'set' : 'sets'}
              </span>
              <span className="text-gray-400">
                {route.route_count} {route.route_count === 1 ? 'route' : 'routes'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Popular Bands */}
      <div className="bg-bg-purple rounded-lg p-4">
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

      {/* Most-Viewed Shared Routes */}
      <div className="bg-bg-purple rounded-lg p-4">
        <h4 className="text-white font-semibold mb-3">Most-Viewed Shared Routes</h4>
        <div className="space-y-2">
          {(metrics.topSharedRoutes || []).length > 0 ? (
            (metrics.topSharedRoutes || []).map((route, idx) => (
              <div key={route.slug} className="flex justify-between text-sm">
                <span className="text-white">
                  {idx + 1}. /s/{route.slug}
                </span>
                <span className="text-gray-400">
                  {route.band_count} {route.band_count === 1 ? 'band' : 'bands'}
                  {route.created_at ? (
                    <>
                      {' · '}
                      {route.created_at.slice(0, 10)}
                    </>
                  ) : null}
                  {' · '}
                  {route.view_count} {route.view_count === 1 ? 'view' : 'views'}
                </span>
              </div>
            ))
          ) : (
            <p className="text-gray-400 text-sm">No shared routes with views yet</p>
          )}
        </div>
        <p className="text-gray-400 text-xs mt-3">
          Views count unique visitors per link — reloads and crawlers don&apos;t inflate them. Imports count per-fetch
          adoptions.
        </p>
      </div>
    </div>
  )
}
