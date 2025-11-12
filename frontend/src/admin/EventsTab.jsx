import { useState, useEffect } from 'react'
import { eventsApi } from '../utils/adminApi'
import { useEventContext } from '../contexts/EventContext'
import EventFormModal from './EventFormModal'
import EventStatusBadge from './components/EventStatusBadge'
import EmbedCodeGenerator from './EmbedCodeGenerator'
import MetricsDashboard from './MetricsDashboard'
import ArchivedEventBanner from './components/ArchivedEventBanner'
import HelpPanel from './components/HelpPanel'
import {
  getEventState,
  isEventArchived,
  confirmArchivedEventEdit,
  confirmArchivedEventDelete,
} from '../utils/eventLifecycle'

/**
 * EventsTab - Manage events (create, duplicate, publish/unpublish)
 *
 * Features:
 * - List all events with name, date, slug, published status, band count
 * - Create new event form
 * - Duplicate event with new name/date/slug
 * - Toggle publish/unpublish status
 * - Mobile-responsive table/cards
 */
export default function EventsTab({
  events,
  onEventsChange,
  showToast,
  selectedEventId,
  selectedEvent,
  onEventFilterChange,
}) {
  const { refreshEvents } = useEventContext()
  const [showModal, setShowModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState(null)
  const [duplicatingEventId, setDuplicatingEventId] = useState(null)
  const [showEmbedCode, setShowEmbedCode] = useState(null)
  const [showMetrics, setShowMetrics] = useState(null)
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [eventVenues, setEventVenues] = useState([])
  const [eventBands, setEventBands] = useState([])
  const [showHelp, setShowHelp] = useState(false)

  // Load venues and bands when event is selected
  useEffect(() => {
    if (selectedEventId) {
      const loadEventData = async () => {
        try {
          const bandsResponse = await fetch('/api/admin/bands', {
            headers: { Authorization: `Bearer ${window.sessionStorage.getItem('sessionToken')}` },
          })
          const bandsData = await bandsResponse.json()
          const eventBandsData = bandsData.bands.filter(b => b.event_id === selectedEventId)

          // Get venue names from the bands
          const uniqueVenues = {}
          eventBandsData.forEach(band => {
            if (band.venue_id && band.venue_name) {
              uniqueVenues[band.venue_id] = band.venue_name
            }
          })

          setEventVenues(Object.entries(uniqueVenues).map(([id, name]) => ({ id: Number(id), name })))
          setEventBands(eventBandsData)
        } catch (err) {
          console.error('Failed to load event data:', err)
        }
      }
      loadEventData()
    } else {
      setEventVenues([])
      setEventBands([])
    }
  }, [selectedEventId])

  const handleSort = key => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const sortedEvents = [...events].sort((a, b) => {
    if (!sortConfig.key) return 0
    let aVal = a[sortConfig.key]
    let bVal = b[sortConfig.key]

    if (sortConfig.key === 'band_count') {
      aVal = parseInt(aVal) || 0
      bVal = parseInt(bVal) || 0
    } else if (sortConfig.key === 'date') {
      aVal = new Date(aVal).getTime()
      bVal = new Date(bVal).getTime()
    } else if (sortConfig.key === 'status') {
      // Sort order: published > draft > archived
      const statusOrder = { published: 2, draft: 1, archived: 0 }
      aVal = statusOrder[a.status] || 0
      bVal = statusOrder[b.status] || 0
    }

    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  const handleEventSaved = savedEvent => {
    showToast(editingEvent ? 'Event updated successfully!' : 'Event created successfully!', 'success')
    refreshEvents()
    onEventsChange()
    setEditingEvent(null)
    setShowModal(false)
  }

  const startEdit = event => {
    // Check if event is archived
    if (isEventArchived(event.date)) {
      // Show two-confirmation gate
      if (!confirmArchivedEventEdit(event)) {
        showToast('Edit cancelled. Use "Copy as Template" to create a new event instead.', 'error')
        return
      }
      showToast(`Editing archived event "${event.name}". Changes will be logged.`, 'success')
    }

    setEditingEvent(event)
    setShowModal(true)
  }

  const handleDuplicate = async e => {
    e.preventDefault()
    setLoading(true)

    // Get event data from duplicatingEventId
    const eventToDuplicate = events.find(e => e.id === duplicatingEventId)
    if (!eventToDuplicate) {
      showToast('Event not found', 'error')
      setLoading(false)
      return
    }

    try {
      await eventsApi.duplicate(duplicatingEventId, {
        name: eventToDuplicate.name + ' (Copy)',
        date: eventToDuplicate.date,
        slug: eventToDuplicate.slug + '-copy',
      })
      showToast('Event duplicated successfully!', 'success')
      setDuplicatingEventId(null)
      refreshEvents()
      onEventsChange()
    } catch (err) {
      showToast('Failed to duplicate event: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleTogglePublish = async event => {
    const publish = event.status !== 'published'
    const action = publish ? 'publish' : 'unpublish'

    if (!window.confirm(`Are you sure you want to ${action} this event?`)) {
      return
    }

    try {
      const token = sessionStorage.getItem('sessionToken')
      const response = await fetch(`/api/admin/events/${event.id}/publish`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publish }),
      })

      const data = await response.json()

      if (!response.ok) {
        showToast(data.message || `Failed to ${action} event`, 'error')
        return
      }

      showToast(`Event ${action}ed successfully!`, 'success')
      refreshEvents()
      onEventsChange()
    } catch (err) {
      showToast(`Failed to ${action} event: ` + err.message, 'error')
    }
  }

  const handleArchive = async event => {
    if (!window.confirm(`Archive "${event.name}"? It will be hidden from the default view and unpublished.`)) {
      return
    }

    try {
      const token = sessionStorage.getItem('sessionToken')
      const response = await fetch(`/api/admin/events/${event.id}/archive`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        showToast(data.message || 'Failed to archive event', 'error')
        return
      }

      showToast('Event archived successfully!', 'success')
      refreshEvents()
      onEventsChange()
    } catch (err) {
      showToast('Failed to archive event: ' + err.message, 'error')
    }
  }

  const handleDelete = async event => {
    const { id: eventId, name: eventName, date: eventDate, band_count: bandCount } = event

    // Check if event is archived
    if (isEventArchived(eventDate)) {
      // Use special confirmation for archived events
      if (!confirmArchivedEventDelete(event)) {
        showToast('Delete cancelled for archived event.', 'error')
        return
      }
    } else {
      // Regular confirmation for non-archived events
      const confirmMessage =
        bandCount > 0
          ? `Are you sure you want to delete "${eventName}"? This will remove the event but keep all ${bandCount} band(s) (they will become unassigned and can be moved to other events). This action cannot be undone.`
          : `Are you sure you want to delete "${eventName}"? This action cannot be undone.`

      if (!window.confirm(confirmMessage)) {
        return
      }
    }

    try {
      const result = await eventsApi.delete(eventId)
      showToast(result.message || `Event "${eventName}" deleted successfully!`, 'success')
      onEventsChange()
    } catch (err) {
      showToast('Failed to delete event: ' + err.message, 'error')
    }
  }

  const startDuplicate = event => {
    setDuplicatingEventId(event.id)
  }

  // If event is selected, show event detail view
  if (selectedEvent && selectedEventId) {
    const eventState = getEventState(selectedEvent.date)

    return (
      <div className="space-y-6">
        {/* Archived Event Warning Banner */}
        <ArchivedEventBanner
          event={selectedEvent}
          state={eventState}
          onCopyAsTemplate={event => {
            // Copy event as template (start duplicate with new date)
            startDuplicate(event)
            showToast('Event copied as template. Update the name, date, and slug for your new event.', 'success')
          }}
        />

        {/* Event Details Card */}
        <div className="bg-band-purple rounded-lg border border-band-orange/20 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-band-orange mb-2">{selectedEvent.name}</h2>
              <div className="space-y-1 text-white/70">
                <p>
                  <span className="font-semibold">Date:</span>{' '}
                  {new Date(selectedEvent.date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
                <p>
                  <span className="font-semibold">Slug:</span>{' '}
                  <span className="font-mono text-band-orange">{selectedEvent.slug}</span>
                </p>
                <p>
                  <span className="font-semibold">Status:</span> <EventStatusBadge status={selectedEvent.status} />
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowEmbedCode(selectedEvent)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium transition-colors min-h-[44px]"
              >
                Embed
              </button>
              <button
                onClick={() => setShowMetrics(selectedEvent)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium transition-colors min-h-[44px]"
              >
                Metrics
              </button>
              <button
                onClick={() => startEdit(selectedEvent)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors min-h-[44px]"
              >
                Edit
              </button>
              {selectedEvent.ticket_link && (
                <button
                  onClick={() => window.open(selectedEvent.ticket_link, '_blank')}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition-colors min-h-[44px]"
                >
                  🔗 Tickets
                </button>
              )}
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 mb-6">
            <div className="bg-band-navy/50 rounded-lg p-4">
              <div className="text-3xl font-bold text-band-orange mb-1">{selectedEvent.band_count || 0}</div>
              <div className="text-white/70 text-sm">Performers</div>
            </div>
            <div className="bg-band-navy/50 rounded-lg p-4">
              <div className="text-3xl font-bold text-band-orange mb-1">{eventVenues.length}</div>
              <div className="text-white/70 text-sm">Venues</div>
            </div>
            <div className="bg-band-navy/50 rounded-lg p-4">
              <div className="text-3xl font-bold text-band-orange mb-1 capitalize">
                {selectedEvent.status || 'Draft'}
              </div>
              <div className="text-white/70 text-sm">Status</div>
            </div>
          </div>

          {/* Venues List */}
          {eventVenues.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-white mb-3">Venues</h3>
              <div className="flex flex-wrap gap-2">
                {eventVenues.map(venue => (
                  <button
                    key={venue.id}
                    onClick={() => {
                      // Navigate to venues tab with this venue filtered
                      window.location.href = '#venues'
                      setTimeout(() => {
                        // Trigger a custom event to filter this venue
                        window.dispatchEvent(new CustomEvent('filterVenue', { detail: { venueId: venue.id } }))
                      }, 100)
                    }}
                    className="inline-block bg-band-orange/20 hover:bg-band-orange/30 text-band-orange px-3 py-1.5 rounded text-sm transition-colors cursor-pointer"
                    title={`View ${venue.name} profile`}
                  >
                    {venue.name || `Venue ${venue.id}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Performers List */}
          {eventBands.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-white mb-3">Performers</h3>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(eventBands.map(b => b.name))).map(bandName => (
                  <span
                    key={bandName}
                    className="inline-block bg-blue-900/20 text-blue-300 px-3 py-1.5 rounded text-sm"
                  >
                    {bandName}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Schedule by Venue */}
          {eventBands.length > 0 &&
            (() => {
              // Group bands by venue
              const bandsByVenue = {}
              eventBands.forEach(band => {
                const venueKey = band.venue_name || 'Unassigned'
                if (!bandsByVenue[venueKey]) {
                  bandsByVenue[venueKey] = []
                }
                bandsByVenue[venueKey].push(band)
              })

              // Sort venues alphabetically
              const sortedVenues = Object.keys(bandsByVenue).sort()

              return (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold text-white mb-3">Schedule by Venue</h3>
                  <div className="space-y-4">
                    {sortedVenues.map(venueName => (
                      <div key={venueName} className="bg-band-navy/30 rounded-lg border border-band-orange/10">
                        <button
                          type="button"
                          className="w-full px-4 py-3 text-base font-semibold text-band-orange border-b border-band-orange/20 cursor-pointer hover:bg-band-navy/20 transition-colors text-left"
                          onClick={() => {
                            // Find venue ID from eventBands
                            const venue = eventBands.find(b => b.venue_name === venueName)
                            if (venue?.venue_id) {
                              window.location.href = '#venues'
                              setTimeout(() => {
                                window.dispatchEvent(
                                  new CustomEvent('filterVenue', { detail: { venueId: venue.venue_id } })
                                )
                              }, 100)
                            }
                          }}
                          title="View venue profile"
                        >
                          {venueName}
                        </button>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-band-navy/20">
                              <tr>
                                <th className="px-4 py-2 text-left text-white/70 text-xs font-semibold">Time</th>
                                <th className="px-4 py-2 text-left text-white/70 text-xs font-semibold">Performer</th>
                                <th className="px-4 py-2 text-left text-white/70 text-xs font-semibold">Duration</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-band-orange/10">
                              {bandsByVenue[venueName]
                                .sort((a, b) => {
                                  // Convert time strings (HH:MM) to minutes for proper chronological sorting
                                  // Handle late-night performances (00:00-06:00) by adding 24 hours to them
                                  const parseTime = time => {
                                    if (!time) return 9999 // Put empty times at end
                                    const [hours, minutes] = time.split(':').map(Number)
                                    let totalMinutes = hours * 60 + minutes
                                    // Late night performances (00:00 to 05:59) should come after evening
                                    if (hours < 6) {
                                      totalMinutes += 24 * 60 // Add 24 hours for proper sequencing
                                    }
                                    return totalMinutes
                                  }

                                  const timeA = parseTime(a.start_time)
                                  const timeB = parseTime(b.start_time)
                                  return timeA - timeB
                                })
                                .map(band => {
                                  const duration =
                                    band.start_time && band.end_time
                                      ? (() => {
                                          const [startH, startM] = band.start_time.split(':').map(Number)
                                          const [endH, endM] = band.end_time.split(':').map(Number)
                                          const startMinutes = startH * 60 + startM
                                          const endMinutes = endH * 60 + endM

                                          // Handle midnight crossover (e.g., 23:40 to 00:00)
                                          if (endMinutes < startMinutes) {
                                            return 24 * 60 - startMinutes + endMinutes
                                          }
                                          return endMinutes - startMinutes
                                        })()
                                      : null

                                  return (
                                    <tr key={band.id} className="hover:bg-band-navy/20 transition-colors">
                                      <td className="px-4 py-2 text-white/90 font-mono text-sm">
                                        {band.start_time && band.end_time
                                          ? `${band.start_time} - ${band.end_time}`
                                          : '-'}
                                      </td>
                                      <td className="px-4 py-2">
                                        <button
                                          onClick={() => {
                                            window.location.href = '#bands'
                                            setTimeout(() => {
                                              window.dispatchEvent(
                                                new CustomEvent('filterBand', { detail: { bandName: band.name } })
                                              )
                                            }, 100)
                                          }}
                                          className="text-white hover:text-band-orange transition-colors cursor-pointer"
                                          title="View performer profile"
                                        >
                                          {band.name}
                                        </button>
                                      </td>
                                      <td className="px-4 py-2 text-white/70 text-sm">
                                        {duration ? `${duration} min` : '-'}
                                      </td>
                                    </tr>
                                  )
                                })}
                              {/* Venue Total Row */}
                              {(() => {
                                const venueTotal = bandsByVenue[venueName].reduce((sum, band) => {
                                  if (band.start_time && band.end_time) {
                                    const [startH, startM] = band.start_time.split(':').map(Number)
                                    const [endH, endM] = band.end_time.split(':').map(Number)
                                    const startMinutes = startH * 60 + startM
                                    const endMinutes = endH * 60 + endM

                                    // Handle midnight crossover
                                    if (endMinutes < startMinutes) {
                                      return sum + (24 * 60 - startMinutes + endMinutes)
                                    }
                                    return sum + (endMinutes - startMinutes)
                                  }
                                  return sum
                                }, 0)
                                return (
                                  <tr className="bg-band-orange/20 border-t-2 border-band-orange">
                                    <td className="px-4 py-2 text-band-orange font-semibold" colSpan="2">
                                      {venueName} Total
                                    </td>
                                    <td className="px-4 py-2 text-band-orange font-semibold">
                                      {venueTotal} min ({Math.round(venueTotal / 60)}h {venueTotal % 60}m)
                                    </td>
                                  </tr>
                                )
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}

                    {/* Overall Event Total */}
                    {(() => {
                      // Calculate event span (earliest start to latest end)
                      // First pass: Detect if we have midnight-crossing event
                      let hasEveningShows = false
                      let hasEarlyMorningShows = false

                      eventBands.forEach(band => {
                        if (band.start_time) {
                          const [h] = band.start_time.split(':').map(Number)
                          if (h >= 18) hasEveningShows = true
                          if (h < 6) hasEarlyMorningShows = true
                        }
                      })

                      const isMidnightCrossing = hasEveningShows && hasEarlyMorningShows

                      // Second pass: Calculate span with midnight adjustment if needed
                      let earliestStart = null
                      let latestEnd = null

                      eventBands.forEach(band => {
                        if (band.start_time && band.end_time) {
                          const [startH, startM] = band.start_time.split(':').map(Number)
                          const [endH, endM] = band.end_time.split(':').map(Number)
                          const startMinutes = startH * 60 + startM
                          const endMinutes = endH * 60 + endM

                          // Only adjust early morning times if we detected midnight crossing
                          let adjustedStart = startMinutes
                          let adjustedEnd = endMinutes

                          if (isMidnightCrossing) {
                            // Adjust early morning times (00:00-05:59) to next day
                            if (startH < 6) {
                              adjustedStart = startMinutes + 24 * 60
                            }
                            if (endH < 6) {
                              adjustedEnd = endMinutes + 24 * 60
                            }
                          } else if (endMinutes < startMinutes) {
                            // Single performance crosses midnight
                            adjustedEnd = endMinutes + 24 * 60
                          }

                          // Track earliest start
                          if (earliestStart === null || adjustedStart < earliestStart) {
                            earliestStart = adjustedStart
                          }

                          // Track latest end
                          if (latestEnd === null || adjustedEnd > latestEnd) {
                            latestEnd = adjustedEnd
                          }
                        }
                      })

                      const eventSpan = earliestStart && latestEnd ? latestEnd - earliestStart : 0

                      return (
                        <div className="mt-4 bg-band-orange/20 rounded-lg p-4 border-2 border-band-orange">
                          <div className="flex justify-between items-center">
                            <span className="text-band-orange font-semibold text-lg">Event Duration</span>
                            <span className="text-band-orange font-bold text-lg">
                              {eventSpan ? `${eventSpan} min (${Math.round(eventSpan / 60)}h ${eventSpan % 60}m)` : '-'}
                            </span>
                          </div>
                          <p className="text-white/60 text-sm mt-1">From first to last performance</p>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )
            })()}
        </div>

        {/* Modals */}
        {showEmbedCode && (
          <EmbedCodeGenerator event={showEmbedCode} onClose={() => setShowEmbedCode(null)} showToast={showToast} />
        )}
        {showMetrics && <MetricsDashboard event={showMetrics} onClose={() => setShowMetrics(null)} />}
      </div>
    )
  }

  // Otherwise show full events list
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <h2 className="text-2xl font-bold text-white">Events</h2>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="px-4 py-2 text-band-orange underline text-sm hover:text-orange-500 transition-colors min-h-[44px] sm:ml-4"
            aria-label="Toggle help"
          >
            {showHelp ? 'Hide Help' : 'Show Help'}
          </button>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-white cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 text-band-orange focus:ring-band-orange"
            />
            <span>Show Archived</span>
          </label>
          <button
            onClick={() => {
              setEditingEvent(null)
              setShowModal(true)
            }}
            className="px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors min-h-[44px]"
          >
            + Create New Event
          </button>
        </div>
      </div>

      {/* Help Panel */}
      {showHelp && <HelpPanel topic="events" isOpen={showHelp} onClose={() => setShowHelp(false)} />}

      {/* Event Form Modal */}
      <EventFormModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false)
          setEditingEvent(null)
        }}
        event={editingEvent}
        onSave={handleEventSaved}
      />

      {/* Events List */}
      <div className="bg-band-purple rounded-lg border border-band-orange/20 overflow-hidden">
        {events.length === 0 ? (
          <div className="p-8 text-center text-white/50">No events yet. Create your first event to get started!</div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-band-navy/50 border-b border-band-orange/20">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-band-orange/10"
                      onClick={() => handleSort('name')}
                    >
                      Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-band-orange/10"
                      onClick={() => handleSort('date')}
                    >
                      Date {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-band-orange/10"
                      onClick={() => handleSort('slug')}
                    >
                      Slug {sortConfig.key === 'slug' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-band-orange/10"
                      onClick={() => handleSort('status')}
                    >
                      Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-band-orange/10"
                      onClick={() => handleSort('band_count')}
                    >
                      Bands {sortConfig.key === 'band_count' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Tickets</th>
                    <th className="px-4 py-3 text-right text-white font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-band-orange/10">
                  {sortedEvents
                    .filter(event => showArchived || event.status !== 'archived')
                    .map(event => (
                      <tr key={event.id} className="hover:bg-band-navy/30 transition-colors">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => onEventFilterChange?.(event.id)}
                            className="text-white font-medium hover:text-band-orange transition-colors text-left"
                            title="Filter to this event"
                          >
                            {event.name}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-white/70">
                          {new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-3 text-band-orange font-mono text-sm">{event.slug}</td>
                        <td className="px-4 py-3">
                          <EventStatusBadge status={event.status} />
                        </td>
                        <td className="px-4 py-3 text-white/70">{event.band_count || 0}</td>
                        <td className="px-4 py-3">
                          {event.ticket_link ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => window.open(event.ticket_link, '_blank')}
                                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition-colors"
                                title="Visit ticket link"
                              >
                                🔗 Visit
                              </button>
                              <button
                                onClick={async () => {
                                  await navigator.clipboard.writeText(event.ticket_link)
                                  showToast('Ticket link copied!', 'success')
                                }}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                                title="Copy ticket link"
                              >
                                📋 Copy
                              </button>
                            </div>
                          ) : (
                            <span className="text-white/30 text-sm">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2 flex-wrap">
                            <button
                              onClick={() => startEdit(event)}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleTogglePublish(event)}
                              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                                event.status === 'published'
                                  ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                                  : 'bg-green-600 hover:bg-green-700 text-white'
                              }`}
                              disabled={event.status === 'archived'}
                            >
                              {event.status === 'published' ? 'Unpublish' : 'Publish'}
                            </button>
                            {event.status !== 'archived' && (
                              <button
                                onClick={() => handleArchive(event)}
                                className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm font-medium transition-colors"
                                title="Archive event (admin only)"
                              >
                                Archive
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(event)}
                              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-band-orange/10">
              {sortedEvents
                .filter(event => showArchived || event.status !== 'archived')
                .map(event => (
                  <div key={event.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-white font-semibold">{event.name}</h3>
                        <p className="text-white/70 text-sm">
                          {new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                      <EventStatusBadge status={event.status} />
                    </div>

                    <div className="text-sm">
                      <span className="text-white/50">Slug: </span>
                      <span className="text-band-orange font-mono">{event.slug}</span>
                    </div>

                    <div className="text-sm text-white/70">
                      {event.band_count || 0} band{event.band_count !== 1 ? 's' : ''}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        onClick={() => startEdit(event)}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleTogglePublish(event)}
                        className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                          event.status === 'published'
                            ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                            : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                        disabled={event.status === 'archived'}
                      >
                        {event.status === 'published' ? 'Unpublish' : 'Publish'}
                      </button>
                      {event.status !== 'archived' && (
                        <button
                          onClick={() => handleArchive(event)}
                          className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm font-medium transition-colors"
                        >
                          Archive
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(event)}
                        className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>

      {/* Metrics Dashboard Modal */}
      {showMetrics && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-band-purple rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">Metrics for &quot;{showMetrics.name}&quot;</h3>
                <button onClick={() => setShowMetrics(null)} className="text-gray-400 hover:text-white text-2xl">
                  ×
                </button>
              </div>
              <MetricsDashboard eventId={showMetrics.id} />
            </div>
          </div>
        </div>
      )}

      {/* Embed Code Generator Modal */}
      {showEmbedCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-band-purple rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">Embed Code for &quot;{showEmbedCode.name}&quot;</h3>
                <button onClick={() => setShowEmbedCode(null)} className="text-gray-400 hover:text-white text-2xl">
                  ×
                </button>
              </div>
              <EmbedCodeGenerator event={showEmbedCode} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
