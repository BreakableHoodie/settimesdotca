import { useState, useEffect, useCallback } from 'react'
import { authApi, eventsApi } from '../utils/adminApi'
import EventsTab from './EventsTab'
import VenuesTab from './VenuesTab'
import RosterTab from './RosterTab'
import LineupTab from './LineupTab'
import UserManagement from './UserManagement'
import UserSettings from './UserSettings'
import PlatformSettings from './PlatformSettings'
import EventWizard from './EventWizard'
import BottomNav from './BottomNav'
import ContextBanner from './components/ContextBanner'
import Breadcrumbs from './components/Breadcrumbs'
import MfaSettingsModal from './components/MfaSettingsModal'
import { Button, Loading, Alert, ConfirmDialog } from '../components/ui'

/**
 * AdminPanel - Main container for admin panel with tab navigation
 *
 * Features:
 * - Tab navigation (Events, Lineup, Roster, Venues, Users)
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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showMfaModal, setShowMfaModal] = useState(false)
  const [currentUser, setCurrentUser] = useState(() => authApi.getCurrentUser())

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true)
      const result = await eventsApi.getAll()
      setEvents(result.events || [])

      // Default to global view (no event selected)
      // User can optionally select an event from the dropdown
      setSelectedEventId(null)
    } catch (err) {
      console.error('Load events error:', err, 'Status:', err.status, 'Message:', err.message)
      if (err.status === 401 || err.message?.includes('Valid session required')) {
        onLogout()
        return
      }
      showToast('Failed to load events: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [onLogout])

  // Load events on mount
  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  useEffect(() => {
    let isMounted = true
    const refreshUser = async () => {
      const sessionData = await authApi.verifySession()
      if (isMounted && sessionData?.user) {
        setCurrentUser(sessionData.user)
      }
    }
    refreshUser()
    return () => {
      isMounted = false
    }
  }, [])

  const isAdmin = currentUser?.role === 'admin'
  const isViewer = currentUser?.role === 'viewer'
  const canEdit = !isViewer
  const canManageUsers = isAdmin

  // Listen for custom filter events from event detail view
  useEffect(() => {
    const handleFilterVenue = event => {
      const { venueId } = event.detail
      setActiveTab('venues')
      // Store the venue ID to filter in VenuesTab
      sessionStorage.setItem('filterVenueId', venueId.toString())
    }

    const handleFilterBand = event => {
      // If filtering by band from an event context, we probably mean Lineup or Roster?
      // Let's default to Roster for now as it's the global search
      setActiveTab('roster')
      // Store the band name to filter
      sessionStorage.setItem('filterBandName', event.detail.bandName)
    }

    window.addEventListener('filterVenue', handleFilterVenue)
    window.addEventListener('filterBand', handleFilterBand)

    return () => {
      window.removeEventListener('filterVenue', handleFilterVenue)
      window.removeEventListener('filterBand', handleFilterBand)
    }
  }, [])

  // Auto-switch tabs when event selection changes
  useEffect(() => {
    if (selectedEventId) {
      // If we just selected an event, maybe go to Lineup if we were on Events?
      if (activeTab === 'events') setActiveTab('lineup')
    } else {
      // If we cleared event, and were on Lineup, go back to Events
      if (activeTab === 'lineup') setActiveTab('events')
    }
  }, [selectedEventId, activeTab])

  useEffect(() => {
    if (activeTab === 'platform' && !isAdmin) {
      setActiveTab('settings')
    }
  }, [activeTab, isAdmin])

  useEffect(() => {
    if (activeTab === 'users' && !canManageUsers) {
      setActiveTab('events')
    }
  }, [activeTab, canManageUsers])

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
    setShowLogoutConfirm(true)
  }

  const confirmLogout = () => {
    setShowLogoutConfirm(false)
    onLogout()
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

  // Dynamic Tabs Configuration
  const tabs = [
    { id: 'events', label: 'Events' },
    // Only show Lineup if an event is selected
    ...(selectedEventId ? [{ id: 'lineup', label: 'Lineup' }] : []),
    { id: 'roster', label: 'Roster' },
    { id: 'venues', label: 'Venues' },
    ...(canManageUsers ? [{ id: 'users', label: 'Users' }] : []),
    { id: 'settings', label: 'Settings' },
    ...(isAdmin ? [{ id: 'platform', label: 'Platform' }] : []),
  ]

  return (
    <div className="admin-shell min-h-screen bg-bg-navy">
      {/* Skip Navigation Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-6 focus:py-3 focus:bg-accent-500 focus:text-white focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 focus:ring-offset-bg-navy"
      >
        Skip to main content
      </a>

      {/* Header */}
      <header className="bg-bg-purple border-b border-accent-500/20 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-bold font-display mb-2">
                <span className="text-accent-500">Set</span>
                <span className="text-white">Times</span>
                <span className="text-text-tertiary text-base font-normal ml-2">Admin</span>
              </h1>

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
                    className="min-h-[44px] px-3 py-1.5 rounded bg-bg-navy text-white border border-white/20 focus:border-accent-500 focus:outline-none text-sm"
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

            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <Button onClick={() => setShowWizard(true)} variant="primary" size="sm">
                  Create Event
                </Button>
              )}

              <Button onClick={handleLogout} variant="danger" size="sm">
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-bg-purple border-b border-accent-500/20 hidden md:block">
        <div className="container mx-auto px-4">
          <div className="flex gap-1 sm:gap-2 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 sm:px-6 py-3 font-medium transition-all whitespace-nowrap min-h-[48px] flex items-center ${
                  activeTab === tab.id
                    ? 'text-accent-400 border-b-2 border-accent-500'
                    : 'text-white/70 hover:text-white hover:bg-bg-navy/30'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div id="main-content" className="container mx-auto px-4 py-6 pb-24 md:pb-6">
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
          <div className="flex items-center justify-center py-12">
            <Loading size="lg" text="Loading admin panel..." />
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
                readOnly={!canEdit}
              />
            )}

            {activeTab === 'venues' && <VenuesTab showToast={showToast} readOnly={!canEdit} />}

            {activeTab === 'lineup' && selectedEventId && (
              <LineupTab
                selectedEventId={selectedEventId}
                selectedEvent={selectedEvent}
                events={events}
                showToast={showToast}
                onEventFilterChange={setSelectedEventId}
                readOnly={!canEdit}
              />
            )}

            {activeTab === 'roster' && <RosterTab showToast={showToast} readOnly={!canEdit} />}

            {activeTab === 'users' && canManageUsers && <UserManagement />}

            {activeTab === 'settings' && <UserSettings user={currentUser} onOpenMfa={() => setShowMfaModal(true)} />}

            {activeTab === 'platform' && <PlatformSettings isAdmin={isAdmin} />}
          </>
        )}
      </div>

      {/* Event Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-bg-purple rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <EventWizard onComplete={handleWizardComplete} onCancel={handleWizardCancel} />
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 md:bottom-4 right-4 z-50 animate-slide-up max-w-md" style={{ bottom: '90px' }}>
          <Alert variant={toast.type === 'error' ? 'error' : 'success'} className="shadow-xl">
            {toast.message}
          </Alert>
        </div>
      )}

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
        title="Confirm Logout"
        message="Are you sure you want to logout? Any unsaved changes will be lost."
        confirmText="Logout"
        cancelText="Cancel"
        variant="danger"
      />

      <MfaSettingsModal isOpen={showMfaModal} onClose={() => setShowMfaModal(false)} />

      {/* Bottom Navigation (Mobile Only) */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        showLineup={Boolean(selectedEventId)}
        showUsers={canManageUsers}
        showPlatform={isAdmin}
      />
    </div>
  )
}
