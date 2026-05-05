import { ArrowLeft, Target } from 'lucide-react'
import { Button } from '../../components/ui'
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
    <div className="bg-accent-500/10 border-l-2 border-accent-500 px-4 py-2 mb-4 rounded-r animate-slide-down shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target size={18} className="text-accent-500" />
          <span className="text-text-secondary text-xs uppercase tracking-wide">Event</span>
          <span className="text-accent-500 font-semibold text-sm">{event.name}</span>
          <EventStatusBadge status={event.status} />
        </div>
        <Button
          onClick={onClear}
          variant="secondary"
          size="sm"
          icon={<ArrowLeft size={14} />}
          iconPosition="left"
          className="whitespace-nowrap"
        >
          All Events
        </Button>
      </div>
    </div>
  )
}
