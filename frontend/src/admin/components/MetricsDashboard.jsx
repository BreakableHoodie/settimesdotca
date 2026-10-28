import { useState, useEffect, useCallback } from 'react'
import { eventsApi } from '../../utils/adminApi'
import LoadError from './LoadError'
import { AFTER_MIDNIGHT_THRESHOLD_HOUR } from '../../utils/festivalDays'

const REFERRER_LABELS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  google: 'Google',
  other_search: 'Other search',
  direct: 'Direct',
  other: 'Other site',
}

// "6 PM", "12 AM", "1 AM": whole hours only, so formatTime's ":00" would be noise.
function hourLabel(hour) {
  return `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`
}

// Position of an hour in the festival night: 6 AM first ... 11 PM, then 12-5 AM.
const festivalKey = hour => (hour + 24 - AFTER_MIDNIGHT_THRESHOLD_HOUR) % 24

// One date's rows from its first recorded hour to its last, with the quiet
// hours in between as 0. Only hours with views are stored, and a missing row
// would read as "no data" rather than "nobody came".
function fillNight(dateRows) {
  const byKey = new Map(dateRows.map(r => [festivalKey(r.hour), r]))
  const keys = [...byKey.keys()]
  const filled = []
  for (let k = Math.min(...keys); k <= Math.max(...keys); k++) {
    const hour = (k + AFTER_MIDNIGHT_THRESHOLD_HOUR) % 24
    filled.push(byKey.get(k) ?? { festival_date: dateRows[0].festival_date, hour, views: 0 })
  }
  return filled
}

// Show-night usage curve (#1246 Q1). Rows arrive in festival order (6 AM ... 11 PM,
// then 12-5 AM). A date heading appears only on a multi-day edition.
function ShowNightCurve({ curve }) {
  // null is the server saying the read failed, and an absent field is a payload
  // this component does not understand: never show either as "no views".
  if (curve == null) {
    return (
      <div className="bg-bg-purple rounded-lg p-4">
        <h4 className="text-white font-semibold mb-3">Show-night traffic</h4>
        <p className="text-gray-400 text-sm">Show-night traffic could not be loaded.</p>
      </div>
    )
  }
  const rows = curve
  const max = Math.max(1, ...rows.map(r => r.views))
  const dates = [...new Set(rows.map(r => r.festival_date))]
  const multiDay = dates.length > 1

  const renderRow = row => (
    <li key={`${row.festival_date}-${row.hour}`} className="flex items-center gap-3 text-sm">
      <span className="text-white w-14 shrink-0">{hourLabel(row.hour)}</span>
      <div className="flex-1 bg-black/20 rounded h-3" aria-hidden="true">
        <div className="bg-accent-500 h-3 rounded" style={{ width: `${(row.views / max) * 100}%` }} />
      </div>
      <span className="text-gray-400 w-24 text-right shrink-0">
        {row.views} {row.views === 1 ? 'view' : 'views'}
      </span>
    </li>
  )

  return (
    <div className="bg-bg-purple rounded-lg p-4">
      <h4 className="text-white font-semibold mb-3">Show-night traffic</h4>
      {rows.length === 0 ? (
        <p className="text-gray-400 text-sm">
          No show-night views recorded yet. Hourly counts started in October 2026, so earlier editions have none.
        </p>
      ) : (
        <>
          {dates.map(date => (
            <div key={date} className="mb-3 last:mb-0">
              {multiDay && <h5 className="text-white text-sm font-medium mb-2">{date}</h5>}
              <ul
                className="space-y-1"
                aria-label={multiDay ? `Event page views by hour, ${date}` : 'Event page views by hour'}
              >
                {fillNight(rows.filter(r => r.festival_date === date)).map(renderRow)}
              </ul>
            </div>
          ))}
          <p className="text-gray-400 text-xs mt-3">
            Event-page views per Toronto hour on show days. After-midnight hours count toward the previous evening.
            Counts only, no visitor information.
          </p>
        </>
      )}
    </div>
  )
}

export default function MetricsDashboard({ eventId }) {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const loadMetrics = useCallback(async () => {
    try {
      const data = await eventsApi.getMetrics(eventId)
      setMetrics(data.metrics)
      setLoadError(false)
    } catch (error) {
      console.error('Failed to load metrics:', error)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    loadMetrics()
  }, [loadMetrics])

  if (loading) return <div className="text-white">Loading metrics...</div>
  if (loadError || !metrics) return <LoadError what="metrics" onRetry={loadMetrics} />

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
          <div className="text-gray-400 text-sm">Share Views (unique visitors per link, all-time)</div>
          <div className="text-3xl font-bold text-white mt-2">{metrics.totalShareViews ?? 0}</div>
          {!!metrics.totalShareViewsLegacy && (
            <div className="mt-1 text-sm font-normal text-gray-400">
              {metrics.totalShareViewsLegacy} pre-cutover raw fetches
            </div>
          )}
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

      <ShowNightCurve curve={metrics.showNightCurve} />

      <div className="bg-bg-purple rounded-lg p-4">
        <h4 className="text-white font-semibold mb-3">How fans arrived</h4>
        {(metrics.referrers || []).length > 0 ? (
          <ul className="space-y-2" aria-label="Visits by referring site kind">
            {metrics.referrers.map(row => (
              <li key={row.bucket} className="flex justify-between text-sm">
                <span className="text-white">{REFERRER_LABELS[row.bucket] || 'Other site'}</span>
                <span className="text-gray-400">
                  {row.visits} {row.visits === 1 ? 'visit' : 'visits'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-400 text-sm">No visit sources recorded yet</p>
        )}
        <p className="text-gray-400 text-xs mt-3">Totals by referring site kind, never the referring address.</p>
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
                  {route.view_count} unique {route.view_count === 1 ? 'visitor' : 'visitors'}
                  {!!route.view_count_legacy && (
                    <span className="text-gray-500">
                      {' · '}
                      {route.view_count_legacy} pre-cutover raw fetches
                    </span>
                  )}
                </span>
              </div>
            ))
          ) : (
            <p className="text-gray-400 text-sm">No shared routes with views yet</p>
          )}
        </div>
        <p className="text-gray-400 text-xs mt-3">
          Unique visitors are deduplicated per link; pre-cutover raw fetches are undeduplicated per-fetch. Imports count
          per-fetch adoptions.
        </p>
      </div>
    </div>
  )
}
