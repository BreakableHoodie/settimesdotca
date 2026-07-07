import { useState } from 'react'
import PropTypes from 'prop-types'

/**
 * Announcement planning (#556): collapsible panel listing UNANNOUNCED sets
 * that have at least one verified follower, in the API's order (unannounced
 * first, follower interest desc). Renders nothing when there's no follower
 * signal to act on — including for single-day events with no follows yet.
 *
 * Purely presentational: rows come in via `planning` (the raw
 * metrics.announcementPlanning array); announcing is delegated to the parent.
 * Admin surface is dark-pinned, so hardcoded white here is intentional.
 */
export default function AnnouncementPlanningPanel({ planning, onAnnounce, togglingId = null, readOnly = false }) {
  const [expanded, setExpanded] = useState(false)

  const rows = (planning ?? []).filter(row => !row.is_announced && row.follower_count > 0)
  if (rows.length === 0) return null

  return (
    <div className="bg-bg-purple rounded-lg border border-accent-500/20">
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 min-h-[44px] text-left"
        aria-expanded={expanded}
      >
        <span className="font-semibold text-accent-400">
          Announcement planning — {rows.length} engaged {rows.length === 1 ? 'set' : 'sets'} not yet announced
        </span>
        <span className="text-white/60 text-sm">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded && (
        <ul className="px-4 pb-4 space-y-2">
          {rows.map(row => (
            <li
              key={row.performance_id}
              className="flex flex-wrap items-center justify-between gap-2 bg-bg-navy/40 rounded px-3 py-2"
            >
              <div>
                <span className="text-white font-medium">{row.band_name}</span>
                <span className="text-white/60 text-sm ml-3">
                  {row.follower_count} {row.follower_count === 1 ? 'follower' : 'followers'} · +{row.recent_growth} this
                  week · {row.would_notify_count} to notify
                </span>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onAnnounce(row.performance_id, row.is_announced)}
                  disabled={togglingId === row.performance_id}
                  className="px-4 py-2 min-h-[44px] bg-accent-500 text-bg-navy rounded hover:bg-accent-600 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {togglingId === row.performance_id ? 'Announcing…' : 'Announce'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

AnnouncementPlanningPanel.propTypes = {
  planning: PropTypes.arrayOf(
    PropTypes.shape({
      performance_id: PropTypes.number.isRequired,
      band_name: PropTypes.string.isRequired,
      is_announced: PropTypes.number,
      follower_count: PropTypes.number,
      recent_growth: PropTypes.number,
      would_notify_count: PropTypes.number,
    })
  ),
  onAnnounce: PropTypes.func.isRequired,
  togglingId: PropTypes.number,
  readOnly: PropTypes.bool,
}
