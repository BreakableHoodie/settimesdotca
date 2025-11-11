import EventStatusBadge from './EventStatusBadge'

/**
 * ContextBanner - Visual indicator showing current event context
 *
 * Provides clear distinction between global view and event-filtered view.
 * Shows event information and prominent "Back to All Events" button.
 *
 * @param {Object} event - Currently selected event object
 * @param {Function} onClear - Callback to clear event filter
 */
export default function ContextBanner({ event, onClear }) {
  if (!event) return null

  // Format date for display
  const formatDate = dateString => {
    if (!dateString) return ''
    const date = new Date(dateString + 'T00:00:00')
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="bg-band-orange/20 border-l-4 border-band-orange px-4 py-3 mb-4 rounded-r animate-slide-down">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎯</span>
          <div>
            <div className="text-white/70 text-sm">Working on event:</div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-band-orange font-bold text-lg">{event.name}</span>
              <span className="text-white/50 text-sm">
                ({event.band_count || 0} performers
                {event.date && ` • ${formatDate(event.date)}`})
              </span>
              <EventStatusBadge status={event.status} />
            </div>
          </div>
        </div>
        <button
          onClick={onClear}
          className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded font-medium transition-colors min-h-[48px] flex items-center justify-center gap-2 whitespace-nowrap border border-white/20 hover:border-white/40"
          title="Return to global view (all events, venues, and performers)"
        >
          <span className="text-lg">←</span>
          <span>Back to All Events</span>
        </button>
      </div>
    </div>
  )
}
