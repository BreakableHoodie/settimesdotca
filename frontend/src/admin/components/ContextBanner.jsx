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

  return (
    <div className="bg-accent-500/10 border-l-2 border-accent-500 px-4 py-2 mb-4 rounded-r animate-slide-down shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faBullseye} className="text-accent-500 text-lg" />
          <span className="text-text-secondary text-xs uppercase tracking-wide">Event</span>
          <span className="text-accent-500 font-semibold text-sm">{event.name}</span>
          <EventStatusBadge status={event.status} />
        </div>
        <Button
          onClick={onClear}
          variant="secondary"
          size="sm"
          icon={<FontAwesomeIcon icon={faArrowLeft} />}
          iconPosition="left"
          className="whitespace-nowrap"
        >
          All Events
        </Button>
      </div>
    </div>
  )
}
