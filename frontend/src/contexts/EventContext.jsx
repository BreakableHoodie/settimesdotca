import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { eventsApi } from '../utils/adminApi'

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
    return stored ? parseInt(stored, 10) : null
  })

  const [currentEvent, setCurrentEvent] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const currentEventIdRef = useRef(currentEventId)

  useEffect(() => {
    currentEventIdRef.current = currentEventId
  }, [currentEventId])

  // Fetch events list
  const fetchEvents = useCallback(async () => {
    try {
      setError(null)
      const data = await eventsApi.getAll()
      setEvents(data.events || [])

      // Update current event if we have a currentEventId
      const activeEventId = currentEventIdRef.current
      if (activeEventId) {
        const event = (data.events || []).find(e => e.id === activeEventId)
        setCurrentEvent(event || null)
      }
    } catch (error) {
      console.error('Failed to fetch events:', error)
      setError(error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // Switch to a different event
  const switchEvent = eventId => {
    const id = eventId ? parseInt(eventId, 10) : null
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
  const refreshEvents = useCallback(() => {
    fetchEvents()
  }, [fetchEvents])

  return (
    <EventContext.Provider
      value={{
        currentEventId,
        currentEvent,
        events,
        loading,
        error,
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
