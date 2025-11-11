import { useState, useEffect, useCallback } from 'react'
import { eventsApi } from '../utils/adminApi'
import EventsTab from './EventsTab'
import VenuesTab from './VenuesTab'
import BandsTab from './BandsTab'
import UserManagement from './UserManagement'
import EventWizard from './EventWizard'
import BottomNav from './BottomNav'
import ContextBanner from './components/ContextBanner'
import Breadcrumbs from './components/Breadcrumbs'

/**
 * AdminPanel - Main container for admin panel with tab navigation
 *
 * Features:
 * - Tab navigation (Events, Venues, Bands)
 * - Event selector dropdown at top
 * - Toast notifications for success/error
 * - Logout functionality
 * - Responsive mobile-first design
 */
export default function AdminPanel({ onLogout }) {
  const [activeTab, setActiveTab] = useState('events')
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [showWizard, setShowWizard] = useState(false)

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true)
      const result = await eventsApi.getAll()
      setEvents(result.events || [])

      // Default to global view (no event selected)
      // User can optionally select an event from the dropdown
      setSelectedEventId(null)
    } catch (err) {
      showToast('Failed to load events: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load events on mount
  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  // Listen for custom filter events from event detail view
  useEffect(() => {
    const handleFilterVenue = event => {
      const { venueId } = event.detail
      setActiveTab('venues')
      // Store the venue ID to filter in VenuesTab
      sessionStorage.setItem('filterVenueId', venueId.toString())
    }

    const handleFilterBand = event => {
      const { bandName } = event.detail
      setActiveTab('bands')
      // Store the band name to filter in BandsTab
      sessionStorage.setItem('filterBandName', bandName)
    }

    window.addEventListener('filterVenue', handleFilterVenue)
    window.addEventListener('filterBand', handleFilterBand)

    return () => {
      window.removeEventListener('filterVenue', handleFilterVenue)
      window.removeEventListener('filterBand', handleFilterBand)
    }
  }, [])

  /**
   * Show toast notification
   * @param {string} message - Message to display
   * @param {string} type - 'success' or 'error'
   */
  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 5000)
  }

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      onLogout()
    }
  }

  const handleWizardComplete = event => {
    setShowWizard(false)
    showToast(`Event "${event.name}" created successfully!`, 'success')
    loadEvents() // Refresh events list
  }

  const handleWizardCancel = () => {
    setShowWizard(false)
  }

  const selectedEvent = events.find(e => e.id === selectedEventId)

  const tabs = [
    { id: 'events', label: 'Events' },
    { id: 'venues', label: 'Venues' },
    { id: 'bands', label: 'Performers' },
    { id: 'users', label: 'Users' },
  ]

  return (
    <div className="min-h-screen bg-band-navy">
      {/* Header */}
      <header className="bg-band-purple border-b border-band-orange/20 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-bold text-band-orange mb-2">Band Crawl Admin</h1>

              {/* Event Selector */}
              {events.length > 0 && (
                <div className="flex items-center gap-2">
                  <label htmlFor="event-selector" className="text-white/70 text-sm">
                    Filter:
                  </label>
                  <select
                    id="event-selector"
                    value={selectedEventId || ''}
                    onChange={e => {
                      const value = e.target.value
                      setSelectedEventId(value ? Number(value) : null)
                    }}
                    className="px-3 py-1.5 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none text-sm"
                  >
                    <option value="">All Venues/Bands (Global View)</option>
                    {events.map(event => (
                      <option key={event.id} value={event.id}>
                        {event.name} {event.is_published ? '(Published)' : '(Draft)'}
                      </option>
                    ))}
                  </select>
                  {selectedEventId && (
                    <button
                      onClick={() => setSelectedEventId(null)}
                      className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm font-medium transition-colors min-h-[44px] flex items-center justify-center whitespace-nowrap"
                      title="Clear event filter"
                    >
                      Clear Filter
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowWizard(true)}
                className="px-6 py-3 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors text-base sm:text-lg font-medium min-h-[48px] flex items-center justify-center"
              >
                Create Event
              </button>

              <button
                onClick={handleLogout}
                className="px-6 py-3 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-base font-medium min-h-[44px] flex items-center justify-center"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-band-purple border-b border-band-orange/20">
        <div className="container mx-auto px-4">
          <div className="flex gap-1 sm:gap-2 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 sm:px-6 py-3 font-medium transition-all whitespace-nowrap min-h-[48px] flex items-center ${
                  activeTab === tab.id
                    ? 'text-band-orange border-b-2 border-band-orange'
                    : 'text-white/70 hover:text-white hover:bg-band-navy/30'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="container mx-auto px-4 py-6 pb-24 md:pb-6">
        {/* Context Banner - Shows when event is selected */}
        <ContextBanner event={selectedEvent} onClear={() => setSelectedEventId(null)} />

        {/* Breadcrumbs - Navigation hierarchy */}
        <Breadcrumbs
          selectedEvent={selectedEvent}
          onClearEvent={() => setSelectedEventId(null)}
          activeTab={activeTab}
          tabs={tabs}
        />

        {loading ? (
          <div className="text-center py-12">
            <div className="text-band-orange text-lg">Loading...</div>
          </div>
        ) : (
          <>
            {activeTab === 'events' && (
              <EventsTab
                events={events}
                onEventsChange={loadEvents}
                showToast={showToast}
                selectedEventId={selectedEventId}
                selectedEvent={selectedEvent}
                onEventFilterChange={setSelectedEventId}
              />
            )}

            {activeTab === 'venues' && <VenuesTab showToast={showToast} />}

            {activeTab === 'bands' && (
              <BandsTab
                selectedEventId={selectedEventId}
                selectedEvent={selectedEvent}
                events={events}
                showToast={showToast}
                onEventFilterChange={setSelectedEventId}
              />
            )}

            {activeTab === 'users' && <UserManagement />}
          </>
        )}
      </div>

      {/* Event Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-band-purple rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <EventWizard onComplete={handleWizardComplete} onCancel={handleWizardCancel} />
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 md:bottom-4 right-4 z-50 animate-slide-up" style={{ bottom: '90px' }}>
          <div
            className={`px-6 py-3 rounded-lg shadow-xl max-w-md ${
              toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{toast.type === 'error' ? '✕' : '✓'}</span>
              <span>{toast.message}</span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation (Mobile Only) */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}
