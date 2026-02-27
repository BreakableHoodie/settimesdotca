import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { eventsApi, bandsApi } from '../utils/adminApi'
import { useEventContext } from '../contexts/EventContext'
import EventFormModal from './EventFormModal'
import EventStatusBadge from './components/EventStatusBadge'
import EmbedCodeGenerator from './EmbedCodeGenerator'
import MetricsDashboard from './MetricsDashboard'
import ArchivedEventBanner from './components/ArchivedEventBanner'
import HelpPanel from './components/HelpPanel'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy, faLink, faTicketSimple } from '@fortawesome/free-solid-svg-icons'
import { formatTimeRange } from '../utils/timeFormat'
import {
  getEventState,
  isEventArchived,
  confirmArchivedEventEdit,
  confirmArchivedEventDelete,
} from '../utils/eventLifecycle'

const MINUTES_IN_DAY = 24 * 60
const EARLY_MORNING_CUTOFF_HOUR = 6
const EVENING_START_HOUR = 18

const parseTimeToMinutes = time => {
  if (!time) return null
  const [hours, minutes] = time.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

const getSortableTimeMinutes = time => {
  const totalMinutes = parseTimeToMinutes(time)
  if (totalMinutes === null) return Number.POSITIVE_INFINITY
  const hours = Math.floor(totalMinutes / 60)
  return hours < EARLY_MORNING_CUTOFF_HOUR ? totalMinutes + MINUTES_IN_DAY : totalMinutes
}

const getDurationMinutes = (startTime, endTime) => {
  const startMinutes = parseTimeToMinutes(startTime)
  const endMinutes = parseTimeToMinutes(endTime)
  if (startMinutes === null || endMinutes === null) return 0
  if (endMinutes < startMinutes) {
    return MINUTES_IN_DAY - startMinutes + endMinutes
  }
  return endMinutes - startMinutes
}

const formatMinutes = totalMinutes => {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return '-'
  }
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${totalMinutes} min (${hours}h ${minutes}m)`
}

const calculateEventTotals = eventBands => {
  let hasEveningShows = false
  let hasEarlyMorningShows = false

  eventBands.forEach(band => {
    const startMinutes = parseTimeToMinutes(band.start_time)
    if (startMinutes === null) return
    const hour = Math.floor(startMinutes / 60)
    if (hour >= EVENING_START_HOUR) hasEveningShows = true
    if (hour < EARLY_MORNING_CUTOFF_HOUR) hasEarlyMorningShows = true
  })

  const isMidnightCrossing = hasEveningShows && hasEarlyMorningShows

  let earliestStart = null
  let latestEnd = null

  eventBands.forEach(band => {
    if (!band.start_time || !band.end_time) return

    const startMinutes = parseTimeToMinutes(band.start_time)
    const endMinutes = parseTimeToMinutes(band.end_time)
    if (startMinutes === null || endMinutes === null) return

    let adjustedStart = startMinutes
    let adjustedEnd = endMinutes

    if (isMidnightCrossing) {
      const startHour = Math.floor(startMinutes / 60)
      const endHour = Math.floor(endMinutes / 60)
      if (startHour < EARLY_MORNING_CUTOFF_HOUR) {
        adjustedStart += MINUTES_IN_DAY
      }
      if (endHour < EARLY_MORNING_CUTOFF_HOUR) {
        adjustedEnd += MINUTES_IN_DAY
      }
    } else if (endMinutes < startMinutes) {
      adjustedEnd += MINUTES_IN_DAY
    }

    if (earliestStart === null || adjustedStart < earliestStart) {
      earliestStart = adjustedStart
    }
    if (latestEnd === null || adjustedEnd > latestEnd) {
      latestEnd = adjustedEnd
    }
  })

  const eventSpan = earliestStart !== null && latestEnd !== null ? latestEnd - earliestStart : 0
  const eventTotal = eventBands.reduce((sum, band) => {
    return sum + getDurationMinutes(band.start_time, band.end_time)
  }, 0)

  return { eventSpan, eventTotal }
}

const buildScheduleSummary = eventBands => {
  if (!Array.isArray(eventBands) || eventBands.length === 0) {
    return null
  }

  const bandsByVenue = {}
  eventBands.forEach(band => {
    const venueKey = band.venue_name || 'Unassigned'
    if (!bandsByVenue[venueKey]) {
      bandsByVenue[venueKey] = []
    }
    bandsByVenue[venueKey].push(band)
  })

  const sortedVenues = Object.keys(bandsByVenue).sort()
  const venueTotals = {}
  const sortedBandsByVenue = {}
  const venueIdByName = {}

  sortedVenues.forEach(venueName => {
    const venueBands = bandsByVenue[venueName]
    const venueWithId = venueBands.find(band => band.venue_id)
    if (venueWithId?.venue_id) {
      venueIdByName[venueName] = venueWithId.venue_id
    }

    sortedBandsByVenue[venueName] = [...venueBands].sort(
      (a, b) => getSortableTimeMinutes(a.start_time) - getSortableTimeMinutes(b.start_time)
    )
    venueTotals[venueName] = venueBands.reduce((sum, band) => {
      return sum + getDurationMinutes(band.start_time, band.end_time)
    }, 0)
  })

  const { eventSpan, eventTotal } = calculateEventTotals(eventBands)

  return {
    bandsByVenue,
    sortedVenues,
    sortedBandsByVenue,
    venueTotals,
    venueIdByName,
    eventSpan,
    eventTotal,
  }
}

const formatEventDate = dateString =>
  new Date(`${dateString}T00:00:00`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

const areEventPropsEqual = (prevProps, nextProps) => {
  const prevEvent = prevProps.event
  const nextEvent = nextProps.event
  return (
    prevEvent.id === nextEvent.id &&
    prevEvent.name === nextEvent.name &&
    prevEvent.date === nextEvent.date &&
    prevEvent.slug === nextEvent.slug &&
    prevEvent.status === nextEvent.status &&
    prevEvent.band_count === nextEvent.band_count &&
    (prevEvent.ticket_url || prevEvent.ticket_link) === (nextEvent.ticket_url || nextEvent.ticket_link)
  )
}

const EventRow = memo(function EventRow({
  event,
  onFilter,
  onViewMetrics,
  onEdit,
  onTogglePublish,
  onArchive,
  onDelete,
  showToast,
  readOnly,
}) {
  const ticketLink = event.ticket_url || event.ticket_link

  return (
    <tr className="hover:bg-bg-navy/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onFilter?.(event.id)}
            className="text-white font-medium hover:text-accent-400 transition-colors text-left"
            title="Filter to this event"
          >
            {event.name}
          </button>
          <button
            onClick={() => onViewMetrics?.(event)}
            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium transition-colors"
            title="View event metrics"
          >
            Metrics
          </button>
        </div>
      </td>
      <td className="px-4 py-3 text-white/70">{formatEventDate(event.date)}</td>
      <td className="px-4 py-3 text-accent-400 font-mono text-sm">{event.slug}</td>
      <td className="px-4 py-3 text-center">
        <div className="inline-flex justify-center w-full">
          <EventStatusBadge status={event.status} />
        </div>
      </td>
      <td className="px-4 py-3 text-center text-white/70">{event.band_count || 0}</td>
      <td className="px-4 py-3 text-center">
        {ticketLink ? (
          <div className="flex justify-center gap-2">
            <button
              onClick={() => window.open(ticketLink, '_blank')}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition-colors"
              title="Visit ticket link"
            >
              <FontAwesomeIcon icon={faLink} className="mr-1" aria-hidden="true" />
              Visit
            </button>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(ticketLink)
                showToast('Ticket link copied!', 'success')
              }}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
              title="Copy ticket link"
            >
              <FontAwesomeIcon icon={faCopy} className="mr-1" aria-hidden="true" />
              Copy
            </button>
          </div>
        ) : (
          <span className="text-white/30 text-sm">-</span>
        )}
      </td>
      {!readOnly && (
        <td className="px-4 py-3">
          <div className="flex justify-end gap-2 flex-wrap">
            <button
              onClick={() => onEdit(event)}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => onTogglePublish(event)}
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
                onClick={() => onArchive(event)}
                className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm font-medium transition-colors"
                title="Archive event (admin only)"
              >
                Archive
              </button>
            )}
            <button
              onClick={() => onDelete(event)}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors"
            >
              Delete
            </button>
          </div>
        </td>
      )}
    </tr>
  )
}, areEventPropsEqual)

const EventCard = memo(function EventCard({
  event,
  onViewMetrics,
  onEdit,
  onTogglePublish,
  onArchive,
  onDelete,
  readOnly,
}) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-white font-semibold">{event.name}</h3>
          <p className="text-white/70 text-sm">{formatEventDate(event.date)}</p>
        </div>
        <EventStatusBadge status={event.status} />
      </div>

      <div className="text-sm">
        <span className="text-white/50">Slug: </span>
        <span className="text-accent-400 font-mono">{event.slug}</span>
      </div>

      <div className="text-sm text-white/70">
        Bands: <span className="text-white">{event.band_count || 0}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onViewMetrics?.(event)}
          className="px-4 py-2 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium transition-colors"
        >
          Metrics
        </button>
        {!readOnly && (
          <>
            <button
              onClick={() => onEdit(event)}
              className="px-4 py-2 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => onTogglePublish(event)}
              className={`px-4 py-2 min-h-[44px] rounded text-sm font-medium transition-colors ${
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
                onClick={() => onArchive(event)}
                className="px-4 py-2 min-h-[44px] bg-gray-600 hover:bg-gray-700 text-white rounded text-sm font-medium transition-colors"
              >
                Archive
              </button>
            )}
            <button
              onClick={() => onDelete(event)}
              className="px-4 py-2 min-h-[44px] bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors"
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  )
}, areEventPropsEqual)

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
  readOnly = false,
}) {
  const { refreshEvents } = useEventContext()
  const [showModal, setShowModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState(null)
  // duplication flow simplified: startDuplicate will perform duplication directly
  const [showEmbedCode, setShowEmbedCode] = useState(null)
  const [showMetrics, setShowMetrics] = useState(null)
  const [showArchived, setShowArchived] = useState(false)
  // loading state is not currently used in this component; remove to satisfy ESLint
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [eventVenues, setEventVenues] = useState([])
  const [eventBands, setEventBands] = useState([])
  const [showHelp, setShowHelp] = useState(false)
  const scheduleSummary = useMemo(() => buildScheduleSummary(eventBands), [eventBands])

  const handleFilterVenue = useCallback(venueId => {
    if (!venueId) return
    window.location.href = '#venues'
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('filterVenue', { detail: { venueId } }))
    }, 100)
  }, [])

  const handleFilterBand = useCallback(bandName => {
    if (!bandName) return
    window.location.href = '#bands'
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('filterBand', { detail: { bandName } }))
    }, 100)
  }, [])

  // Load venues and bands when event is selected
  useEffect(() => {
    if (selectedEventId) {
      const loadEventData = async () => {
        try {
          const bandsData = await bandsApi.getAll()
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

  const filteredEvents = events.filter(event => {
    if (!showArchived && statusFilter !== 'archived' && event.status === 'archived') {
      return false
    }

    if (statusFilter !== 'all' && event.status !== statusFilter) {
      return false
    }

    if (!searchTerm.trim()) {
      return true
    }

    const query = searchTerm.trim().toLowerCase()
    return event.name?.toLowerCase().includes(query) || event.slug?.toLowerCase().includes(query)
  })

  const sortedEvents = [...filteredEvents].sort((a, b) => {
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
    } else if (sortConfig.key === 'ticket_url') {
      aVal = a.ticket_url || a.ticket_link || ''
      bVal = b.ticket_url || b.ticket_link || ''
    }

    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  const handleEventSaved = _savedEvent => {
    showToast(editingEvent ? 'Event updated successfully!' : 'Event created successfully!', 'success')
    refreshEvents()
    onEventsChange()
    setEditingEvent(null)
    setShowModal(false)
  }

  const getPublicEventUrl = event => {
    if (!event?.slug) return ''
    return `${window.location.origin}/event/${event.slug}`
  }

  const handleCopyPublicUrl = async event => {
    const url = getPublicEventUrl(event)
    if (!url) return
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        showToast('Public URL copied to clipboard.', 'success')
        return
      }
      throw new Error('Clipboard API unavailable')
    } catch (_error) {
      const fallback = document.createElement('textarea')
      fallback.value = url
      fallback.setAttribute('readonly', '')
      fallback.style.position = 'absolute'
      fallback.style.left = '-9999px'
      document.body.appendChild(fallback)
      fallback.select()
      document.execCommand('copy')
      document.body.removeChild(fallback)
      showToast('Public URL copied to clipboard.', 'success')
    }
  }

  const startEdit = event => {
    if (readOnly) {
      showToast('Read-only access: editing is disabled for your role.', 'error')
      return
    }
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

  // Duplicate flow handled via startDuplicate and eventsApi directly when invoked from UI controls.

  const handleTogglePublish = async event => {
    if (readOnly) {
      showToast('Read-only access: publishing is disabled for your role.', 'error')
      return
    }
    const publish = event.status !== 'published'
    const action = publish ? 'publish' : 'unpublish'

    if (!window.confirm(`Are you sure you want to ${action} this event?`)) {
      return
    }

    try {
      await eventsApi.setPublishState(event.id, publish)

      showToast(`Event ${action}ed successfully!`, 'success')
      refreshEvents()
      onEventsChange()
    } catch (err) {
      showToast(`Failed to ${action} event: ` + err.message, 'error')
    }
  }

  const handleArchive = async event => {
    if (readOnly) {
      showToast('Read-only access: archiving is disabled for your role.', 'error')
      return
    }
    if (!window.confirm(`Archive "${event.name}"? It will be hidden from the default view and unpublished.`)) {
      return
    }

    try {
      await eventsApi.archive(event.id)

      showToast('Event archived successfully!', 'success')
      refreshEvents()
      onEventsChange()
    } catch (err) {
      showToast('Failed to archive event: ' + err.message, 'error')
    }
  }

  const handleDelete = async event => {
    if (readOnly) {
      showToast('Read-only access: deleting is disabled for your role.', 'error')
      return
    }
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
          ? `Are you sure you want to delete "${eventName}"? This will permanently delete ${bandCount} scheduled performance record(s) for this event. This action cannot be undone.`
          : `Are you sure you want to delete "${eventName}"? This action cannot be undone.`

      if (!window.confirm(confirmMessage)) {
        return
      }
    }

    try {
      const result = await eventsApi.delete(eventId, { confirmCascade: bandCount > 0 })
      showToast(result.message || `Event "${eventName}" deleted successfully!`, 'success')
      onEventsChange()
    } catch (err) {
      showToast('Failed to delete event: ' + err.message, 'error')
    }
  }

  const startDuplicate = async event => {
    try {
      await eventsApi.duplicate(event.id, {
        name: event.name + ' (Copy)',
        date: event.date,
        slug: event.slug + '-copy',
      })
      showToast('Event duplicated successfully!', 'success')
      refreshEvents()
      onEventsChange()
    } catch (err) {
      showToast('Failed to duplicate event: ' + err.message, 'error')
    }
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
        <div className="bg-bg-purple rounded-lg border border-accent-500/20 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-accent-400 mb-2">{selectedEvent.name}</h2>
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
                  <span className="font-mono text-accent-400">{selectedEvent.slug}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Public URL:</span>
                  {selectedEvent.status === 'published' ? (
                    <>
                      <a
                        href={getPublicEventUrl(selectedEvent)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent-400 underline break-all"
                      >
                        {getPublicEventUrl(selectedEvent)}
                      </a>
                      <button
                        type="button"
                        onClick={() => handleCopyPublicUrl(selectedEvent)}
                        className="px-2 py-1 text-xs bg-bg-navy/50 text-white rounded hover:bg-bg-navy/70"
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => window.open(getPublicEventUrl(selectedEvent), '_blank')}
                        className="px-2 py-1 text-xs bg-bg-navy/50 text-white rounded hover:bg-bg-navy/70"
                      >
                        Open
                      </button>
                    </>
                  ) : (
                    <span className="text-white/50 text-sm">Publish to enable public link.</span>
                  )}
                </div>
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
              {!readOnly && (
                <button
                  onClick={() => startEdit(selectedEvent)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors min-h-[44px]"
                >
                  Edit
                </button>
              )}
              {selectedEvent.ticket_link && (
                <button
                  onClick={() => window.open(selectedEvent.ticket_link, '_blank')}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition-colors min-h-[44px]"
                >
                  <FontAwesomeIcon icon={faTicketSimple} className="mr-2" aria-hidden="true" />
                  Tickets
                </button>
              )}
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 mb-6">
            <div className="bg-bg-navy/50 rounded-lg p-4">
              <div className="text-3xl font-bold text-accent-400 mb-1">{selectedEvent.band_count || 0}</div>
              <div className="text-white/70 text-sm">Performers</div>
            </div>
            <div className="bg-bg-navy/50 rounded-lg p-4">
              <div className="text-3xl font-bold text-accent-400 mb-1">{eventVenues.length}</div>
              <div className="text-white/70 text-sm">Venues</div>
            </div>
            <div className="bg-bg-navy/50 rounded-lg p-4">
              <div className="text-3xl font-bold text-accent-400 mb-1 capitalize">
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
                    className="inline-block bg-accent-500/20 hover:bg-accent-500/30 text-accent-400 px-3 py-1.5 rounded text-sm transition-colors cursor-pointer"
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
          {scheduleSummary && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-white mb-3">Schedule by Venue</h3>
              <div className="space-y-4">
                {scheduleSummary.sortedVenues.map(venueName => {
                  const venueBands = scheduleSummary.sortedBandsByVenue[venueName] || []
                  const venueTotal = scheduleSummary.venueTotals[venueName] || 0
                  const venueId = scheduleSummary.venueIdByName[venueName]

                  return (
                    <div key={venueName} className="bg-bg-navy/30 rounded-lg border border-accent-500/10">
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-base font-semibold text-accent-400 border-b border-accent-500/20 cursor-pointer hover:bg-bg-navy/20 transition-colors text-left"
                        onClick={() => handleFilterVenue(venueId)}
                        title="View venue profile"
                      >
                        {venueName}
                      </button>
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-bg-navy/20">
                            <tr>
                              <th className="px-4 py-2 text-left text-white/70 text-xs font-semibold">Time</th>
                              <th className="px-4 py-2 text-left text-white/70 text-xs font-semibold">Performer</th>
                              <th className="px-4 py-2 text-left text-white/70 text-xs font-semibold">Duration</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-accent-500/10">
                            {venueBands.map(band => {
                              const duration = getDurationMinutes(band.start_time, band.end_time)

                              return (
                                <tr key={band.id} className="hover:bg-bg-navy/20 transition-colors">
                                  <td className="px-4 py-2 text-white/90 font-mono text-sm">
                                    {formatTimeRange(band.start_time, band.end_time, { fallback: '-' })}
                                  </td>
                                  <td className="px-4 py-2">
                                    <button
                                      onClick={() => handleFilterBand(band.name)}
                                      className="text-white hover:text-accent-400 transition-colors cursor-pointer"
                                      title="View performer profile"
                                    >
                                      {band.name}
                                    </button>
                                  </td>
                                  <td className="px-4 py-2 text-white/70 text-sm">
                                    {duration > 0 ? `${duration} min` : '-'}
                                  </td>
                                </tr>
                              )
                            })}
                            <tr className="bg-accent-500/20 border-t-2 border-accent-500">
                              <td className="px-4 py-2 text-accent-400 font-semibold" colSpan="2">
                                {venueName} Total
                              </td>
                              <td className="px-4 py-2 text-accent-400 font-semibold">{formatMinutes(venueTotal)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div className="md:hidden divide-y divide-accent-500/10">
                        {venueBands.map(band => {
                          const duration = getDurationMinutes(band.start_time, band.end_time)
                          return (
                            <div key={band.id} className="px-4 py-3 space-y-1">
                              <div className="text-white/90 font-mono text-sm">
                                {formatTimeRange(band.start_time, band.end_time, { fallback: '-' })}
                              </div>
                              <button
                                onClick={() => handleFilterBand(band.name)}
                                className="text-white hover:text-accent-400 transition-colors text-left"
                                title="View performer profile"
                              >
                                {band.name}
                              </button>
                              <div className="text-white/70 text-sm">
                                Duration: {duration > 0 ? `${duration} min` : '-'}
                              </div>
                            </div>
                          )
                        })}
                        <div className="px-4 py-3 bg-accent-500/20 border-t border-accent-500/40">
                          <div className="flex items-center justify-between text-accent-400 font-semibold">
                            <span>{venueName} Total</span>
                            <span>{formatMinutes(venueTotal)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}

                <div className="mt-4 bg-accent-500/20 rounded-lg p-4 border-2 border-accent-500">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="text-accent-400 font-semibold text-lg">Total Scheduled Time</span>
                      <span className="text-accent-400 font-bold text-lg">
                        {formatMinutes(scheduleSummary.eventTotal)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm text-white/70">
                      <span>Event Span (first to last set)</span>
                      <span className="text-white/80">{formatMinutes(scheduleSummary.eventSpan)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modals */}
        {!readOnly && (
          <EventFormModal
            isOpen={showModal}
            onClose={() => {
              setShowModal(false)
              setEditingEvent(null)
            }}
            event={editingEvent}
            onSave={handleEventSaved}
          />
        )}
        {/* Metrics Dashboard Modal */}
        {showMetrics && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-bg-purple rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
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
            <div className="bg-bg-purple rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
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

  // Otherwise show full events list
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Events</h2>
          <p className="text-sm text-white/70 mt-1">Create, edit, and publish event schedules.</p>
        </div>
        <div className="flex flex-col items-start sm:flex-row sm:items-center gap-3">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search name or slug"
            className="min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-white/10 focus:border-accent-500 focus:outline-none w-56"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-white/10 focus:border-accent-500 focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="px-4 py-2 text-accent-400 underline text-sm hover:text-accent-300 transition-colors min-h-[44px]"
            aria-label="Toggle help"
          >
            {showHelp ? 'Hide Help' : 'Show Help'}
          </button>
          <label className="flex items-center gap-3 text-white cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
              className="h-5 w-5 rounded border-gray-600 text-accent-500 focus:ring-accent-500"
            />
            <span>Show Archived</span>
          </label>
          {!readOnly && (
            <button
              onClick={() => {
                setEditingEvent(null)
                setShowModal(true)
              }}
              className="px-4 py-2 bg-accent-500 text-white rounded hover:bg-accent-600 transition-colors min-h-[44px]"
            >
              + Create New Event
            </button>
          )}
        </div>
      </div>

      {/* Help Panel */}
      {showHelp && <HelpPanel topic="events" isOpen={showHelp} onClose={() => setShowHelp(false)} />}

      {/* Event Form Modal */}
      {!readOnly && (
        <EventFormModal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false)
            setEditingEvent(null)
          }}
          event={editingEvent}
          onSave={handleEventSaved}
        />
      )}

      {/* Events List */}
      <div className="bg-bg-purple rounded-lg border border-accent-500/20 overflow-hidden">
        {filteredEvents.length === 0 ? (
          <div className="p-8 text-center text-white/50">
            {events.length === 0
              ? 'No events yet. Create your first event to get started!'
              : 'No events match your filters.'}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-bg-navy/50 border-b border-accent-500/20">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-accent-500/10"
                      onClick={() => handleSort('name')}
                    >
                      Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-accent-500/10"
                      onClick={() => handleSort('date')}
                    >
                      Date {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-accent-500/10"
                      onClick={() => handleSort('slug')}
                    >
                      Slug {sortConfig.key === 'slug' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-4 py-3 text-center text-white font-semibold cursor-pointer hover:bg-accent-500/10"
                      onClick={() => handleSort('status')}
                    >
                      Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-4 py-3 text-center text-white font-semibold cursor-pointer hover:bg-accent-500/10"
                      onClick={() => handleSort('band_count')}
                    >
                      Bands {sortConfig.key === 'band_count' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-4 py-3 text-center text-white font-semibold cursor-pointer hover:bg-accent-500/10"
                      onClick={() => handleSort('ticket_url')}
                    >
                      Tickets {sortConfig.key === 'ticket_url' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    {!readOnly && <th className="px-4 py-3 text-right text-white font-semibold">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-accent-500/10">
                  {sortedEvents.map(event => (
                    <EventRow
                      key={event.id}
                      event={event}
                      onFilter={onEventFilterChange}
                      onViewMetrics={setShowMetrics}
                      onEdit={startEdit}
                      onTogglePublish={handleTogglePublish}
                      onArchive={handleArchive}
                      onDelete={handleDelete}
                      showToast={showToast}
                      readOnly={readOnly}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-accent-500/10">
              {sortedEvents.map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  onViewMetrics={setShowMetrics}
                  onEdit={startEdit}
                  onTogglePublish={handleTogglePublish}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  readOnly={readOnly}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Metrics Dashboard Modal */}
      {showMetrics && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-bg-purple rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
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
          <div className="bg-bg-purple rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
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
