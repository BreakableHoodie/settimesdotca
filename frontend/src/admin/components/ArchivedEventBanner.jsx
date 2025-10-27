import { getDaysSinceEvent, getGracePeriodHoursRemaining, formatEventState } from '../../utils/eventLifecycle'

/**
 * ArchivedEventBanner - Warning banner for archived events
 *
 * Shows when viewing/editing events that are 48h+ past their date.
 * Provides visual warning and "Copy as Template" action.
 *
 * @param {Object} event - Event object with date
 * @param {Function} onCopyAsTemplate - Callback to copy event as template
 * @param {string} state - Event lifecycle state ('archived', 'recently_completed', 'upcoming')
 */
export default function ArchivedEventBanner({ event, onCopyAsTemplate, state }) {
  if (!event || state === 'upcoming') return null

  const stateInfo = formatEventState(event.date)
  const daysAgo = getDaysSinceEvent(event.date)
  const hoursRemaining = getGracePeriodHoursRemaining(event.date)

  // Grace period banner (yellow warning)
  if (state === 'recently_completed') {
    return (
      <div className="bg-yellow-900/30 border-l-4 border-yellow-400 px-4 py-3 mb-4 rounded-r animate-slide-down">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl" role="img" aria-label="Clock">
              ⏰
            </span>
            <div>
              <div className="text-yellow-300 font-semibold">
                {stateInfo.label} - {hoursRemaining}h Remaining
              </div>
              <div className="text-white/70 text-sm mt-1">
                Event ended {daysAgo} {daysAgo === 1 ? 'day' : 'days'} ago. You can still make
                edits during the 48-hour grace period.
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Archived banner (gray, non-dismissible)
  if (state === 'archived') {
    return (
      <div className="bg-gray-900/80 border-l-4 border-gray-500 px-4 py-3 mb-4 rounded-r">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl" role="img" aria-label="Archive">
              🗄️
            </span>
            <div>
              <div className="text-gray-300 font-semibold">{stateInfo.label}</div>
              <div className="text-white/60 text-sm mt-1">
                This event ended {daysAgo} {daysAgo === 1 ? 'day' : 'days'} ago. Editing historical
                data is restricted to preserve event records.
              </div>
            </div>
          </div>
          {onCopyAsTemplate && (
            <button
              onClick={() => onCopyAsTemplate(event)}
              className="px-6 py-3 bg-band-orange hover:bg-orange-600 text-white rounded font-medium transition-colors min-h-[48px] flex items-center justify-center gap-2 whitespace-nowrap"
              title="Create a new event based on this archived event"
            >
              <span className="text-lg" role="img" aria-label="Copy">
                📋
              </span>
              <span>Copy as Template for New Event</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  return null
}
