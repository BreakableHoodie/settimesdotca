import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons'

/**
 * Breadcrumbs - Navigation hierarchy indicator
 * Sprint 2.3: Enhanced with design system components and icons
 *
 * Shows the current navigation path:
 * - All Events (root)
 * - Event Name (when event selected)
 * - Tab Name (when not on Events tab)
 *
 * @param {Object} selectedEvent - Currently selected event object
 * @param {Function} onClearEvent - Callback to clear event filter
 * @param {string} activeTab - Currently active tab ID
 * @param {Array} tabs - Array of tab objects with id and label
 */
export default function Breadcrumbs({ selectedEvent, onClearEvent, activeTab, tabs }) {
  // Don't show breadcrumbs if we're in global view on Events tab
  const showBreadcrumbs = selectedEvent || activeTab !== 'events'

  if (!showBreadcrumbs) return null

  const currentTab = tabs.find(t => t.id === activeTab)

  return (
    <nav className="flex items-center gap-2 text-sm mb-4 flex-wrap" aria-label="Breadcrumb">
      {/* Root: All Events */}
      <button
        onClick={onClearEvent}
        className="text-text-secondary hover:text-accent-500 transition-colors focus:outline-none focus:text-accent-500 focus:ring-2 focus:ring-accent-500/50 rounded px-2 py-1"
        aria-label="Return to all events view"
      >
        All Events
      </button>

      {/* Event Name (if selected) */}
      {selectedEvent && (
        <>
          <FontAwesomeIcon icon={faChevronRight} className="text-text-tertiary text-xs" aria-hidden="true" />
          <span className="text-accent-500 font-semibold">{selectedEvent.name}</span>
        </>
      )}

      {/* Tab Name (if not on Events tab) */}
      {activeTab !== 'events' && currentTab && (
        <>
          <FontAwesomeIcon icon={faChevronRight} className="text-text-tertiary text-xs" aria-hidden="true" />
          <span className="text-text-primary">{currentTab.label}</span>
        </>
      )}
    </nav>
  )
}
