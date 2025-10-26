import { useState, useEffect, useCallback } from 'react'
import { eventsApi } from '../utils/adminApi'
import EventsTab from './EventsTab'
import VenuesTab from './VenuesTab'
import BandsTab from './BandsTab'
import EventWizard from './EventWizard'

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

      // Auto-select first published event, or first event
      if (result.events && result.events.length > 0) {
        const publishedEvent = result.events.find(e => e.is_published)
        setSelectedEventId(publishedEvent?.id || result.events[0].id)
      }
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

  const handleWizardComplete = (event) => {
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
    { id: 'bands', label: 'Performances' }
  ]

  return (
    <div className='min-h-screen bg-band-navy'>
      {/* Header */}
      <header className='bg-band-purple border-b border-band-orange/20 sticky top-0 z-50'>
        <div className='container mx-auto px-4 py-4'>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
            <div className='flex-1'>
              <h1 className='text-xl sm:text-2xl font-bold text-band-orange mb-2'>
                Band Crawl Admin
              </h1>

              {/* Event Selector */}
              {events.length > 0 && (
                <div className='flex items-center gap-2'>
                  <label htmlFor='event-selector' className='text-white/70 text-sm'>Event:</label>
                  <select
                    id='event-selector'
                    value={selectedEventId || ''}
                    onChange={(e) => setSelectedEventId(Number(e.target.value))}
                    className='px-3 py-1.5 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none text-sm'
                  >
                    {events.map(event => (
                      <option key={event.id} value={event.id}>
                        {event.name} {event.is_published ? '(Published)' : '(Draft)'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className='flex items-center gap-3'>
              <button
                onClick={() => setShowWizard(true)}
                className='px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors text-sm sm:text-base'
              >
                Create Event
              </button>
              
              <button
                onClick={handleLogout}
                className='px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm sm:text-base'
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className='bg-band-purple border-b border-band-orange/20'>
        <div className='container mx-auto px-4'>
          <div className='flex gap-1 sm:gap-2 overflow-x-auto'>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 sm:px-6 py-3 font-medium transition-all whitespace-nowrap ${
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
      <div className='container mx-auto px-4 py-6'>
        {loading ? (
          <div className='text-center py-12'>
            <div className='text-band-orange text-lg'>Loading...</div>
          </div>
        ) : (
          <>
            {activeTab === 'events' && (
              <EventsTab
                events={events}
                onEventsChange={loadEvents}
                showToast={showToast}
              />
            )}

            {activeTab === 'venues' && (
              <VenuesTab showToast={showToast} />
            )}

            {activeTab === 'bands' && (
              <BandsTab
                selectedEventId={selectedEventId}
                selectedEvent={selectedEvent}
                events={events}
                showToast={showToast}
              />
            )}
          </>
        )}
      </div>

      {/* Event Wizard Modal */}
      {showWizard && (
        <div className='fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50'>
          <div className='bg-band-purple rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto'>
            <EventWizard
              onComplete={handleWizardComplete}
              onCancel={handleWizardCancel}
            />
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className='fixed bottom-4 right-4 z-50 animate-slide-up'>
          <div
            className={`px-6 py-3 rounded-lg shadow-xl max-w-md ${
              toast.type === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-green-600 text-white'
            }`}
          >
            <div className='flex items-center gap-2'>
              <span className='text-lg'>
                {toast.type === 'error' ? '✕' : '✓'}
              </span>
              <span>{toast.message}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
