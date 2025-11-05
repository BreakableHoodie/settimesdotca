/**
 * Breadcrumbs - Navigation hierarchy indicator
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
        className="text-white/70 hover:text-band-orange transition-colors focus:outline-none focus:text-band-orange"
        aria-label="Return to all events view"
      >
        All Events
      </button>

      {/* Event Name (if selected) */}
      {selectedEvent && (
        <>
          <span className="text-white/40" aria-hidden="true">
            ›
          </span>
          <span className="text-band-orange font-semibold">{selectedEvent.name}</span>
        </>
      )}

      {/* Tab Name (if not on Events tab) */}
      {activeTab !== 'events' && currentTab && (
        <>
          <span className="text-white/40" aria-hidden="true">
            ›
          </span>
          <span className="text-white">{currentTab.label}</span>
        </>
      )}
    </nav>
  )
}
