import { Button, Badge } from '../../components/ui'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCalendarDays, faArrowLeft, faBullseye } from '@fortawesome/free-solid-svg-icons'
import EventStatusBadge from './EventStatusBadge'

/**
 * ContextBanner - Visual indicator showing current event context
 * Sprint 2.3: Enhanced with design system components
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
      year: 'numeric',
    })
  }

  return (
    <div className="bg-accent-500/10 border-l-4 border-accent-500 px-4 py-3 mb-4 rounded-r animate-slide-down shadow-md">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <FontAwesomeIcon icon={faBullseye} className="text-accent-500 text-2xl" />
          <div>
            <div className="text-text-secondary text-sm">Working on event:</div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-accent-500 font-bold text-lg">{event.name}</span>
              <Badge variant="secondary" className="text-xs">
                {event.band_count || 0} performers
              </Badge>
              {event.date && (
                <span className="text-text-secondary text-sm flex items-center gap-1">
                  <FontAwesomeIcon icon={faCalendarDays} className="text-accent-500" />
                  {formatDate(event.date)}
                </span>
              )}
              <EventStatusBadge status={event.status} />
            </div>
          </div>
        </div>
        <Button
          onClick={onClear}
          variant="secondary"
          icon={<FontAwesomeIcon icon={faArrowLeft} />}
          iconPosition="left"
          className="whitespace-nowrap"
        >
          Back to All Events
        </Button>
      </div>
    </div>
  )
}
