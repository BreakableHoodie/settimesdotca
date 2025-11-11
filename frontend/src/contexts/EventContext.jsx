import React, { createContext, useContext, useState, useEffect } from 'react'

const EventContext = createContext()

/**
 * EventProvider - Manages current event context across the admin panel
 *
 * Provides:
 * - currentEventId: ID of the currently selected event
 * - currentEvent: Full event object for the currently selected event
 * - events: Array of all available events
 * - switchEvent: Function to switch to a different event
 * - refreshEvents: Function to reload the events list
 *
 * The current event ID is persisted in localStorage so users maintain
 * context even after page refreshes.
 */
export function EventProvider({ children }) {
  const [currentEventId, setCurrentEventId] = useState(() => {
    const stored = localStorage.getItem('currentEventId')
    return stored ? parseInt(stored) : null
  })

  const [currentEvent, setCurrentEvent] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  // Fetch events list
  const fetchEvents = async () => {
    try {
      const token = sessionStorage.getItem('sessionToken')
      if (!token) {
        setLoading(false)
        return
      }

      const response = await fetch('/api/admin/events', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setEvents(data.events || [])

        // Update current event if we have a currentEventId
        if (currentEventId) {
          const event = (data.events || []).find(e => e.id === currentEventId)
          setCurrentEvent(event || null)

          // Clear currentEventId if event no longer exists
          if (!event) {
            setCurrentEventId(null)
            localStorage.removeItem('currentEventId')
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch events:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch events on mount and when currentEventId changes
  useEffect(() => {
    fetchEvents()
  }, [currentEventId])

  // Switch to a different event
  const switchEvent = (eventId) => {
    const id = eventId ? parseInt(eventId) : null
    setCurrentEventId(id)

    if (id) {
      localStorage.setItem('currentEventId', id.toString())
      const event = events.find(e => e.id === id)
      setCurrentEvent(event || null)
    } else {
      localStorage.removeItem('currentEventId')
      setCurrentEvent(null)
    }
  }

  // Refresh events list (useful after creating/updating/deleting events)
  const refreshEvents = () => {
    fetchEvents()
  }

  return (
    <EventContext.Provider
      value={{
        currentEventId,
        currentEvent,
        events,
        loading,
        switchEvent,
        refreshEvents,
      }}
    >
      {children}
    </EventContext.Provider>
  )
}

/**
 * useEventContext - Hook to access event context
 *
 * Must be used within an EventProvider.
 * Throws an error if used outside the provider.
 */
export function useEventContext() {
  const context = useContext(EventContext)
  if (!context) {
    throw new Error('useEventContext must be used within EventProvider')
  }
  return context
}
