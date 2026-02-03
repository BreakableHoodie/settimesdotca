import { useState, useRef, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGlobe, faLocationDot, faPlus } from '@fortawesome/free-solid-svg-icons'
import { useEventContext } from '../contexts/EventContext'
import EventStatusBadge from './components/EventStatusBadge'

/**
 * EventSelector - Dropdown for switching between events
 *
 * Features:
 * - Shows current event name
 * - Lists active events first, then archived events in a separate section
 * - Option to view "All Events"
 * - Status badge for each event
 * - Create new event option
 *
 * This component is always visible in the admin header to ensure users
 * always know which event context they're in. Archived events are shown
 * in a separate section to allow adding bands for historical data.
 */
export default function EventSelector({ onCreateEvent }) {
  const { currentEvent, events, switchEvent, loading } = useEventContext()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen])

  // Separate active and archived events for display
  const activeEvents = events.filter(e => e.status !== 'archived')
  const archivedEvents = events.filter(e => e.status === 'archived')

  const handleSelectEvent = eventId => {
    switchEvent(eventId)
    setIsOpen(false)
  }

  const handleCreateNew = () => {
    setIsOpen(false)
    if (onCreateEvent) {
      onCreateEvent()
    }
  }

  if (loading) {
    return <div className="text-white/50 text-sm">Loading events...</div>
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Current Event Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-band-purple hover:bg-band-navy border border-band-orange/30 rounded-lg text-white transition-colors min-h-[44px]"
        title="Switch event context"
      >
        <FontAwesomeIcon icon={faLocationDot} className="text-lg" aria-hidden="true" />
        <div className="text-left">
          <div className="text-xs text-white/50">Event Context:</div>
          <div className="font-medium">{currentEvent ? currentEvent.name : 'All Events'}</div>
        </div>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-band-purple border border-band-orange/30 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
          {/* All Events Option */}
          <button
            onClick={() => handleSelectEvent(null)}
            className={`w-full px-4 py-3 text-left hover:bg-band-navy/50 transition-colors border-b border-band-orange/20 ${
              !currentEvent ? 'bg-band-orange/20' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faGlobe} className="text-lg" aria-hidden="true" />
              <div className="flex-1">
                <div className="font-medium text-white">All Events</div>
                <div className="text-xs text-white/50">Global view across all events</div>
              </div>
            </div>
          </button>

          {/* Active Events */}
          {activeEvents.length > 0 ? (
            <div className="py-1">
              {activeEvents.map(event => (
                <button
                  key={event.id}
                  onClick={() => handleSelectEvent(event.id)}
                  className={`w-full px-4 py-3 text-left hover:bg-band-navy/50 transition-colors ${
                    currentEvent?.id === event.id ? 'bg-band-orange/20' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">{event.name}</div>
                      <div className="text-xs text-white/50">
                        {event.date &&
                          new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        {' • '}
                        {event.band_count || 0} bands
                      </div>
                    </div>
                    <EventStatusBadge status={event.status} />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-white/50 text-sm">
              No active events. Create your first event to get started!
            </div>
          )}

          {/* Archived Events Section */}
          {archivedEvents.length > 0 && (
            <div className="border-t border-band-orange/20">
              <div className="px-4 py-2 text-xs text-white/50 bg-band-navy/30 font-medium">Archived Events</div>
              {archivedEvents.map(event => (
                <button
                  key={event.id}
                  onClick={() => handleSelectEvent(event.id)}
                  className={`w-full px-4 py-3 text-left hover:bg-band-navy/50 transition-colors opacity-75 ${
                    currentEvent?.id === event.id ? 'bg-band-orange/20 opacity-100' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">{event.name}</div>
                      <div className="text-xs text-white/50">
                        {event.date &&
                          new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        {' • '}
                        {event.band_count || 0} bands
                      </div>
                    </div>
                    <EventStatusBadge status={event.status} />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Create New Event Option */}
          <button
            onClick={handleCreateNew}
            className="w-full px-4 py-3 text-left hover:bg-band-navy/50 transition-colors border-t border-band-orange/20 bg-band-orange/10"
          >
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faPlus} className="text-lg" aria-hidden="true" />
              <div className="font-medium text-band-orange">Create New Event</div>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}
