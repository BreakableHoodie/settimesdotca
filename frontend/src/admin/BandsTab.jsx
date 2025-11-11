import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSwipeable } from 'react-swipeable'
import { bandsApi, venuesApi } from '../utils/adminApi'
import BulkActionBar from './BulkActionBar'
import BulkPreviewModal from './BulkPreviewModal'
import BandForm from './BandForm'
import HelpPanel from './components/HelpPanel'
import PerformerPicker from './components/PerformerPicker'
import {
  calculateEndTimeFromDuration,
  deriveDurationMinutes,
  detectConflicts,
  formatDurationLabel,
  formatTimeLabel,
  formatTimeRangeLabel,
  sortBandsByStart,
} from './utils/timeUtils'

/**
 * SwipeableBandCard - Mobile swipeable card component for band display
 */
function SwipeableBandCard({ band, swipedBandId, getVenueName, getDurationLabel, formatTimeRangeLabel, startEdit, handleDelete, setSwipedBandId }) {
  const handlers = useSwipeable({
    onSwipedLeft: () => setSwipedBandId(band.id),
    onSwipedRight: () => setSwipedBandId(null),
    trackMouse: true,
    delta: 50,
  })

  return (
    <div className="relative overflow-hidden">
      <div {...handlers} className={`transition-transform ${swipedBandId === band.id ? '-translate-x-20' : ''}`}>
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-white font-semibold">{band.name}</h3>
              {(band.origin || band.genre) && (
                <p className="text-white/60 text-xs">
                  {band.origin && <span>{band.origin}</span>}
                  {band.origin && band.genre && <span className="mx-1">•</span>}
                  {band.genre && <span>{band.genre}</span>}
                </p>
              )}
              <p className="text-white/70 text-sm">{getVenueName(band.venue_id)}</p>
            </div>
            <div className="text-right text-sm text-white/70">
              <div>{formatTimeRangeLabel(band.start_time, band.end_time)}</div>
              <div>{getDurationLabel(band)}</div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => startEdit(band)}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded text-base font-medium transition-colors min-h-[44px]"
            >
              Edit
            </button>
            <button
              onClick={() => handleDelete(band.id, band.name)}
              className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded text-base font-medium transition-colors min-h-[44px]"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
      
      {swipedBandId === band.id && (
        <button
          onClick={() => {
            handleDelete(band.id, band.name)
            setSwipedBandId(null)
          }}
          className="absolute right-0 top-0 bottom-0 w-20 bg-red-600 text-white flex items-center justify-center font-medium"
        >
          Delete
        </button>
      )}
    </div>
  )
}

/**
 * BandsTab - Manage performances for the selected event
 *
 * Features:
 * - Requires selected event from AdminPanel
 * - List performances sorted by start time with venue, time range
 * - Add performance form with name, venue dropdown, start/end time, optional URL
 * - Edit performance functionality
 * - Conflict detection for overlapping times at same venue
 * - Delete performance
 * - Mobile-responsive design
 */
export default function BandsTab({ selectedEventId, selectedEvent, events, showToast, onEventFilterChange }) {
  const [bands, setBands] = useState([])
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [formData, setFormData] = useState(() => ({
    name: '',
    event_id: selectedEventId ? selectedEventId.toString() : '',
    venue_id: '',
    start_time: '',
    end_time: '',
    duration: '',
    url: '',
    description: '',
    photo_url: '',
    genre: '',
    origin: '',
  }))
  const [submitting, setSubmitting] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  // Ref for scrolling to edit form
  const editFormRef = useRef(null)

  // Bulk operation state
  const [selectedBands, setSelectedBands] = useState(new Set())
  const [bulkAction, setBulkAction] = useState(null)
  const [bulkParams, setBulkParams] = useState({})
  const [previewData, setPreviewData] = useState(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Swipe gesture state for mobile
  const [swipedBandId, setSwipedBandId] = useState(null)

  const loadVenues = useCallback(async () => {
    try {
      const result = await venuesApi.getAll()
      setVenues(result.venues || [])
    } catch (err) {
      showToast('Failed to load venues: ' + err.message, 'error')
    }
  }, [showToast])

  const loadBands = useCallback(async () => {
    try {
      setLoading(true)
      if (selectedEventId) {
        // Load bands for specific event
        const result = await bandsApi.getByEvent(selectedEventId)
        setBands(result.bands || [])
      } else {
        // Load all bands (including orphaned ones) when no event selected
        const result = await bandsApi.getAll()
        setBands(result.bands || [])
      }
    } catch (err) {
      console.error('Error loading bands:', err)
      showToast('Failed to load bands: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [selectedEventId, showToast])

  useEffect(() => {
    loadVenues()
    loadBands() // Load bands on component mount
  }, [loadVenues, loadBands])

  // Clear selections when event changes
  useEffect(() => {
    setSelectedBands(new Set())
    setBulkAction(null)
  }, [selectedEventId])

  // Scroll to edit form when editing starts
  useEffect(() => {
    if (editingId && editFormRef.current) {
      // Delay to ensure the edit form has rendered
      setTimeout(() => {
        editFormRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }, 100)
    }
  }, [editingId])

  const resetForm = () => {
    setFormData({
      name: '',
      event_id: selectedEventId ? selectedEventId.toString() : '',
      venue_id: '',
      start_time: '',
      end_time: '',
      duration: '',
      url: '',
      description: '',
      photo_url: '',
      genre: '',
      origin: '',
    })
    setShowAddForm(false)
    setEditingId(null)
  }

  useEffect(() => {
    if (!editingId) {
      setFormData(prev => ({
        ...prev,
        event_id: selectedEventId ? selectedEventId.toString() : '',
        ...(selectedEventId ? {} : { start_time: '', end_time: '', duration: '' }),
      }))
    }
  }, [selectedEventId, editingId])

  const handleSort = key => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const handleInputChange = e => {
    const { name, value } = e.target

    if (name === 'start_time') {
      // If duration is set, recalculate end_time
      const newEndTime = formData.duration
        ? calculateEndTimeFromDuration(value, formData.duration)
        : formData.end_time
      setFormData(prev => ({ ...prev, start_time: value, end_time: newEndTime }))
    } else if (name === 'end_time') {
      // Recalculate duration when end_time changes
      const durationMinutes = deriveDurationMinutes(formData.start_time, value)
      setFormData(prev => ({
        ...prev,
        end_time: value,
        duration: durationMinutes != null ? String(durationMinutes) : prev.duration,
      }))
    } else if (name === 'duration') {
      // Recalculate end_time when duration changes
      const newEndTime = formData.start_time
        ? calculateEndTimeFromDuration(formData.start_time, value)
        : formData.end_time
      setFormData(prev => ({ ...prev, duration: value, end_time: newEndTime }))
    } else if (name === 'event_id') {
      setFormData(prev => ({
        ...prev,
        event_id: value,
        ...(value
          ? {}
          : {
              venue_id: '',
              start_time: '',
              end_time: '',
              duration: '',
            }),
      }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleAdd = async e => {
    e.preventDefault()
    setSubmitting(true)

    // Validation
    if (!formData.name || formData.name.trim() === '') {
      showToast('Band name is required', 'error')
      setSubmitting(false)
      return
    }

    try {
      // Check for duplicate band name (check both loaded bands and make API call for comprehensive check)
      const existingBand = bands.find(band => band.name.toLowerCase() === formData.name.toLowerCase())

      if (existingBand) {
        showToast(`A band named &quot;${formData.name}&quot; already exists. Please choose a different name.`, 'error')
        setSubmitting(false)
        return
      }

      const eventId = formData.event_id ? Number(formData.event_id) : null

      const result = await bandsApi.create({
        eventId,
        venueId: formData.venue_id ? Number(formData.venue_id) : null,
        name: formData.name,
        startTime: formData.start_time || null,
        endTime: formData.end_time || null,
        url: formData.url,
        description: formData.description,
        photo_url: formData.photo_url,
        genre: formData.genre,
        origin: formData.origin,
      })

      // If the API returns an error about duplicate names, show that error
      if (result.error && result.error.includes('Duplicate band name')) {
        showToast(
          result.message || `A band named &quot;${formData.name}&quot; already exists. Please choose a different name.`,
          'error'
        )
        setSubmitting(false)
        return
      }

      showToast(eventId ? 'Band added successfully!' : 'Band saved without an event.', 'success')
      resetForm()
      loadBands()
    } catch (err) {
      // Check if the error is about duplicate names
      if (err.message && err.message.includes('Duplicate band name')) {
        showToast(`A band named &quot;${formData.name}&quot; already exists. Please choose a different name.`, 'error')
      } else {
        showToast('Failed to add band: ' + err.message, 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async e => {
    e.preventDefault()
    setSubmitting(true)

    // Validation
    if (!formData.name || formData.name.trim() === '') {
      showToast('Band name is required', 'error')
      setSubmitting(false)
      return
    }

    try {
      // Check for duplicate band name (excluding the current band being edited)
      const existingBand = bands.find(
        band => band.id !== editingId && band.name.toLowerCase() === formData.name.toLowerCase()
      )

      if (existingBand) {
        showToast(`A band named &quot;${formData.name}&quot; already exists. Please choose a different name.`, 'error')
        setSubmitting(false)
        return
      }

      const eventId = formData.event_id ? Number(formData.event_id) : null

      const result = await bandsApi.update(editingId, {
        eventId,
        venueId: formData.venue_id ? Number(formData.venue_id) : null,
        name: formData.name,
        startTime: formData.start_time || null,
        endTime: formData.end_time || null,
        url: formData.url,
        description: formData.description,
        photo_url: formData.photo_url,
        genre: formData.genre,
        origin: formData.origin,
      })

      // If the API returns an error about duplicate names, show that error
      if (result.error && result.error.includes('Duplicate band name')) {
        showToast(
          result.message || `A band named &quot;${formData.name}&quot; already exists. Please choose a different name.`,
          'error'
        )
        setSubmitting(false)
        return
      }

      showToast('Band updated successfully!', 'success')
      resetForm()
      loadBands()
    } catch (err) {
      // Check if the error is about duplicate names
      if (err.message && err.message.includes('Duplicate band name')) {
        showToast(`A band named &quot;${formData.name}&quot; already exists. Please choose a different name.`, 'error')
      } else {
        showToast('Failed to update band: ' + err.message, 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (bandId, bandName) => {
    if (!window.confirm(`Are you sure you want to delete &quot;${bandName}&quot;?`)) {
      return
    }

    try {
      await bandsApi.delete(bandId)
      showToast('Band deleted successfully!', 'success')
      loadBands()
    } catch (err) {
      showToast('Failed to delete band: ' + err.message, 'error')
    }
  }

  const startEdit = band => {
    setEditingId(band.id)
    const durationMinutes = deriveDurationMinutes(band.start_time, band.end_time)
    setFormData({
      name: band.name,
      event_id: band.event_id != null ? band.event_id.toString() : '',
      venue_id: band.venue_id != null ? band.venue_id.toString() : '',
      start_time: band.start_time || '',
      end_time: band.end_time || '',
      duration: durationMinutes != null ? String(durationMinutes) : '',
      url: band.url || '',
      description: band.description || '',
      photo_url: band.photo_url || '',
      genre: band.genre || '',
      origin: band.origin || '',
    })
    setShowAddForm(false)
  }

  // Bulk operation handlers
  const handleSelectBand = (bandId, checked) => {
    setSelectedBands(prev => {
      const next = new Set(prev)
      checked ? next.add(bandId) : next.delete(bandId)
      return next
    })
  }

  const handleSelectAll = checked => {
    setSelectedBands(checked ? new Set(bands.map(b => b.id)) : new Set())
  }

  const handleBulkActionSubmit = async () => {
    try {
      const response = await fetch('/api/admin/bands/bulk-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': localStorage.getItem('adminPassword'),
        },
        body: JSON.stringify({
          band_ids: Array.from(selectedBands),
          action: bulkAction,
          ...bulkParams,
        }),
      })

      const preview = await response.json()
      setPreviewData(preview)
      setShowPreviewModal(true)
    } catch (error) {
      console.error('Failed to load bulk action preview:', error)
      showToast('Could not load preview. Check connection.', 'error')
    }
  }

  const handleConfirmBulk = async ignoreConflicts => {
    setIsProcessing(true)
    try {
      const response = await fetch('/api/admin/bands/bulk', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': localStorage.getItem('adminPassword'),
        },
        body: JSON.stringify({
          band_ids: Array.from(selectedBands),
          action: bulkAction,
          ignore_conflicts: ignoreConflicts,
          ...bulkParams,
        }),
      })

      const result = await response.json()

      if (result.success) {
        showToast(`Updated ${selectedBands.size} bands`, 'success')
        setSelectedBands(new Set())
        setBulkAction(null)
        setShowPreviewModal(false)
        loadBands() // Refresh list
      } else {
        showToast(result.error || 'Operation failed', 'error')
      }
    } catch (error) {
      showToast(`Failed: ${error.message}`, 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCancelBulk = () => {
    setSelectedBands(new Set())
    setBulkAction(null)
    setBulkParams({})
    setPreviewData(null)
  }

  const getConflicts = useCallback(band => detectConflicts(band, bands), [bands])

  // Get venue name by ID
  const getVenueName = venueId => {
    if (!venueId) return 'No venue assigned'
    const venue = venues.find(v => String(v.id) === String(venueId))
    return venue ? venue.name : 'Unknown Venue'
  }

  const getDurationLabel = band => {
    if (band?.duration != null && band.duration !== '') {
      return `${band.duration} min`
    }
    return formatDurationLabel(band?.start_time, band?.end_time)
  }

  // Sort bands by configured key or default to start time
  // Works in both event-specific context AND global "all bands" context
  const sortedBands = useMemo(() => {
    if (sortConfig.key) {
      // Security: Validate sort key against allowed values
      const ALLOWED_SORT_KEYS = ['name', 'origin', 'genre', 'venue_id', 'start_time', 'end_time']
      if (!ALLOWED_SORT_KEYS.includes(sortConfig.key)) {
        console.error('Invalid sort key:', sortConfig.key)
        return sortBandsByStart(bands)
      }

      // User-initiated sort with performance optimization
      const collator = new Intl.Collator('en', { sensitivity: 'base' })

      return [...bands].sort((a, b) => {
        let aVal = a[sortConfig.key]
        let bVal = b[sortConfig.key]

        if (sortConfig.key === 'name' || sortConfig.key === 'origin' || sortConfig.key === 'genre') {
          aVal = (aVal || '').toLowerCase()
          bVal = (bVal || '').toLowerCase()
          const result = collator.compare(aVal, bVal)
          return sortConfig.direction === 'asc' ? result : -result
        } else if (sortConfig.key === 'start_time' || sortConfig.key === 'end_time') {
          // Convert HH:MM to minutes for comparison
          const toMinutes = time => {
            if (!time) return 0
            const [hours, minutes] = time.split(':').map(Number)
            return hours * 60 + minutes
          }
          aVal = toMinutes(aVal)
          bVal = toMinutes(bVal)
        } else if (sortConfig.key === 'venue_id') {
          aVal = getVenueName(aVal).toLowerCase()
          bVal = getVenueName(bVal).toLowerCase()
          const result = collator.compare(aVal, bVal)
          return sortConfig.direction === 'asc' ? result : -result
        }

        // Numeric/time comparison
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }
    // Default: sort by start time
    return sortBandsByStart(bands)
  }, [bands, sortConfig.key, sortConfig.direction, getVenueName])

  const formConflicts = useMemo(() => {
    if (!formData.event_id || !formData.venue_id || !formData.start_time || !formData.end_time) {
      return []
    }

    return detectConflicts(
      {
        id: editingId,
        event_id: Number(formData.event_id),
        venue_id: Number(formData.venue_id),
        start_time: formData.start_time,
        end_time: formData.end_time,
      },
      bands
    )
  }, [bands, editingId, formData.end_time, formData.event_id, formData.start_time, formData.venue_id])

  // Sort icon component
  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return <span className="text-white/30 ml-1">⇅</span>
    }
    return (
      <span className="text-band-orange ml-1">
        {sortConfig.direction === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

  if (!selectedEventId) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Performers</h2>
            <p className="text-white/70 text-sm mt-1">Managing performances (no event selected)</p>
          </div>
        </div>

        {/* Add Band Button */}
        {!showAddForm && !editingId && (
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddForm(true)}
              className="px-6 py-3 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors min-h-[48px] font-medium flex items-center"
            >
              + Add Performer
            </button>
          </div>
        )}

        {/* Show Info for Global View */}
        {bands.length > 0 && (
          <div className="bg-blue-900/20 border border-blue-600 rounded p-4 mb-4">
            <p className="text-blue-200 text-sm">
              <strong>Global View:</strong> Showing all bands across all events. Filter by event above to narrow down.
            </p>
          </div>
        )}

        {/* Desktop Table - Global View (Simple Index) */}
        {bands.length > 0 && !selectedEventId && (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-band-purple/50">
                <tr>
                  <th
                    className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-band-orange/10"
                    onClick={() => handleSort('name')}
                  >
                    Band Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-band-orange/10"
                    onClick={() => handleSort('origin')}
                  >
                    Origin {sortConfig.key === 'origin' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-band-orange/10"
                    onClick={() => handleSort('genre')}
                  >
                    Genre {sortConfig.key === 'genre' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-band-orange/10"
                    onClick={() => handleSort('events_count')}
                  >
                    Events {sortConfig.key === 'events_count' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-band-orange/10"
                    onClick={() => handleSort('last_played')}
                  >
                    Last Played {sortConfig.key === 'last_played' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-white font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-band-orange/10">
                {/* Group bands by name and collect their events */}
                {Array.from(new Set(bands.map(b => b.name)))
                  .map(bandName => {
                    const bandOccurrences = bands.filter(b => b.name === bandName)
                    const uniqueEvents = Array.from(new Set(bandOccurrences.map(b => b.event_name).filter(Boolean)))
                    const lastPlayedDate = bandOccurrences
                      .map(b => b.event_date)
                      .filter(Boolean)
                      .sort()
                      .pop() // Get most recent date
                    
                    // Prepare data for sorting
                    const lastPlayed = lastPlayedDate || ''
                    const eventsCount = uniqueEvents.length
                    
                    return { bandName, uniqueEvents, lastPlayed, eventsCount, bandOccurrences: bandOccurrences[0] }
                  })
                  .sort((a, b) => {
                    if (!sortConfig.key) return 0
                    let aVal, bVal

                    if (sortConfig.key === 'name') {
                      aVal = a.bandName.toLowerCase()
                      bVal = b.bandName.toLowerCase()
                    } else if (sortConfig.key === 'origin') {
                      aVal = (a.bandOccurrences.origin || '').toLowerCase()
                      bVal = (b.bandOccurrences.origin || '').toLowerCase()
                    } else if (sortConfig.key === 'genre') {
                      aVal = (a.bandOccurrences.genre || '').toLowerCase()
                      bVal = (b.bandOccurrences.genre || '').toLowerCase()
                    } else if (sortConfig.key === 'last_played') {
                      aVal = a.lastPlayed || '9999-99-99' // Put no date last
                      bVal = b.lastPlayed || '9999-99-99'
                    } else if (sortConfig.key === 'events_count') {
                      aVal = a.uniqueEvents.length
                      bVal = b.uniqueEvents.length
                    } else {
                      return 0
                    }

                    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
                    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
                    return 0
                  })
                  .map(({ bandName, uniqueEvents, lastPlayed, bandOccurrences }) => {
                    const isEditing = editingId === bandOccurrences.id
                    return (
                      <React.Fragment key={bandName}>
                        <tr className="hover:bg-band-navy/30 transition-colors">
                          <td className="px-4 py-3 text-white font-medium">{bandName}</td>
                          <td className="px-4 py-3 text-white/70">{bandOccurrences.origin || '-'}</td>
                          <td className="px-4 py-3 text-white/70">{bandOccurrences.genre || '-'}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {uniqueEvents.length > 0 ? (
                                uniqueEvents.map(eventName => {
                                  const event = events.find(e => e.name === eventName)
                                  return (
                                    <button
                                      key={eventName}
                                      type="button"
                                      onClick={() => event && onEventFilterChange?.(event.id)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault()
                                          event && onEventFilterChange?.(event.id)
                                        }
                                      }}
                                      className={`inline-block px-2 py-1 rounded text-xs whitespace-nowrap cursor-pointer transition-colors ${
                                        event
                                          ? 'bg-band-orange/20 text-band-orange hover:bg-band-orange/30'
                                          : 'bg-band-orange/20 text-band-orange'
                                      }`}
                                      title={event ? `Filter to ${eventName}` : eventName}
                                    >
                                      {eventName}
                                    </button>
                                  )
                                })
                              ) : (
                                <span className="inline-block bg-yellow-600/20 text-yellow-400 px-2 py-1 rounded text-xs">
                                  No events
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-white/70">
                            {lastPlayed ? new Date(lastPlayed).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            }) : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => window.open(`/band/${bandOccurrences.id}`, '_blank')}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-colors min-h-[44px]"
                                title="View public profile"
                              >
                                📄 View
                              </button>
                              <button
                                onClick={() => startEdit(bandOccurrences)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors min-h-[44px]"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(bandOccurrences.id, bandName)}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors min-h-[44px]"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Inline Edit Form for Global View */}
                        {isEditing && (
                          <tr>
                            <td colSpan="6" className="p-0">
                              <div ref={editFormRef} className="bg-band-navy/50 p-6 border-t border-b border-band-orange/20">
                                <h3 className="text-lg font-bold text-band-orange mb-4">Edit Band</h3>
                                <BandForm
                                  events={events}
                                  venues={venues}
                                  formData={formData}
                                  submitting={submitting}
                                  mode="edit"
                                  globalView={!selectedEventId}
                                  onChange={handleInputChange}
                                  onSubmit={handleUpdate}
                                  onCancel={resetForm}
                                  conflicts={formConflicts}
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}

        {/* Desktop Table - Event View (Full Details) */}
        {bands.length > 0 && selectedEventId && (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-band-purple/50">
                <tr>
                  <th
                    className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-band-orange/10"
                    onClick={() => handleSort('name')}
                  >
                    Band Name {sortConfig.key === 'name' && selectedEventId && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-band-orange/10"
                    onClick={() => handleSort('origin')}
                  >
                    Origin {sortConfig.key === 'origin' && selectedEventId && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-band-orange/10"
                    onClick={() => handleSort('genre')}
                  >
                    Genre {sortConfig.key === 'genre' && selectedEventId && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-band-orange/10"
                    onClick={() => handleSort('venue_id')}
                  >
                    Venue {sortConfig.key === 'venue_id' && selectedEventId && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-band-orange/10"
                    onClick={() => handleSort('start_time')}
                  >
                    Start Time {sortConfig.key === 'start_time' && selectedEventId && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:bg-band-orange/10"
                    onClick={() => handleSort('end_time')}
                  >
                    End Time {sortConfig.key === 'end_time' && selectedEventId && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-left text-white font-semibold">Duration</th>
                  <th className="px-4 py-3 text-right text-white font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-band-orange/10">
                {sortedBands.map(band => (
                  <tr key={band.id} className="hover:bg-band-navy/30 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{band.name}</td>
                    <td className="px-4 py-3 text-white/70">{band.origin || '-'}</td>
                    <td className="px-4 py-3 text-white/70">{band.genre || '-'}</td>
                    <td className="px-4 py-3 text-white/70">{getVenueName(band.venue_id)}</td>
                    <td className="px-4 py-3 text-white/70">{formatTimeLabel(band.start_time)}</td>
                    <td className="px-4 py-3 text-white/70">{formatTimeLabel(band.end_time)}</td>
                    <td className="px-4 py-3 text-white/70">{getDurationLabel(band)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => startEdit(band)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors min-h-[44px]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(band.id, band.name)}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors min-h-[44px]"
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
        )}

        {/* Mobile Cards - Global View */}
        {bands.length > 0 && !selectedEventId && (
          <div className="md:hidden divide-y divide-band-orange/10">
            {Array.from(new Set(bands.map(b => b.name))).map(bandName => {
              const bandOccurrences = bands.filter(b => b.name === bandName)
              const uniqueEvents = Array.from(new Set(bandOccurrences.map(b => b.event_name).filter(Boolean)))
              const isEditing = editingId === bandOccurrences[0].id

              return (
                <React.Fragment key={bandName}>
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="text-white font-semibold mb-2">{bandName}</h3>
                      {(bandOccurrences[0].origin || bandOccurrences[0].genre) && (
                        <p className="text-white/60 text-xs mb-2">
                          {bandOccurrences[0].origin && <span>{bandOccurrences[0].origin}</span>}
                          {bandOccurrences[0].origin && bandOccurrences[0].genre && <span className="mx-1">•</span>}
                          {bandOccurrences[0].genre && <span>{bandOccurrences[0].genre}</span>}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {uniqueEvents.length > 0 ? (
                          uniqueEvents.map(eventName => (
                            <span
                              key={eventName}
                              className="inline-block bg-band-orange/20 text-band-orange px-2 py-1 rounded text-xs"
                            >
                              {eventName}
                            </span>
                          ))
                        ) : (
                          <span className="inline-block bg-yellow-600/20 text-yellow-400 px-2 py-1 rounded text-xs">
                            No events
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => startEdit(bandOccurrences[0])}
                        className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded text-base font-medium transition-colors min-h-[44px]"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(bandOccurrences[0].id, bandName)}
                        className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded text-base font-medium transition-colors min-h-[44px]"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Inline Edit Form for Mobile Global View */}
                  {isEditing && (
                    <div ref={editFormRef} className="bg-band-navy/50 p-4 border-t border-b border-band-orange/20">
                      <h3 className="text-lg font-bold text-band-orange mb-4">Edit Band</h3>
                      <BandForm
                        events={events}
                        venues={venues}
                        formData={formData}
                        submitting={submitting}
                        mode="edit"
                        globalView={!selectedEventId}
                        onChange={handleInputChange}
                        onSubmit={handleUpdate}
                        onCancel={resetForm}
                        conflicts={formConflicts}
                      />
                    </div>
                  )}
                </React.Fragment>
              )
            })}
          </div>
        )}

            {/* Mobile Cards - Event View */}
        {bands.length > 0 && selectedEventId && (
          <div className="md:hidden divide-y divide-band-orange/10">
            {sortedBands.map(band => (
              <SwipeableBandCard
                key={band.id}
                band={band}
                swipedBandId={swipedBandId}
                getVenueName={getVenueName}
                getDurationLabel={getDurationLabel}
                formatTimeRangeLabel={formatTimeRangeLabel}
                startEdit={startEdit}
                handleDelete={handleDelete}
                setSwipedBandId={setSwipedBandId}
              />
            ))}
          </div>
        )}

        {/* No Bands Message */}
        {bands.length === 0 && (
          <div className="text-center py-12">
            <div className="text-white/50 text-lg">No bands available</div>
            <p className="text-white/30 text-sm mt-2">Add your first band to get started</p>
          </div>
        )}

        {/* Add/Edit Form */}
        {(showAddForm || editingId) && (
          <div className="bg-band-purple p-6 rounded-lg border border-band-orange/20">
          <h3 className="text-lg font-bold text-band-orange mb-4">
            {editingId ? 'Edit Band' : 'Add Band'}
          </h3>
          <p className="text-white/70 text-sm mb-4">
            {selectedEventId
              ? 'This band will be added to the selected event.'
              : 'This band will be available to assign to events later.'}
          </p>

            <BandForm
              events={events}
              venues={venues}
              formData={formData}
              submitting={submitting}
              mode={editingId ? 'edit' : 'create'}
              showEventIntro
              globalView={!selectedEventId}
              onChange={handleInputChange}
              onSubmit={editingId ? handleUpdate : handleAdd}
              onCancel={resetForm}
              conflicts={formConflicts}
            />
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-band-orange text-lg">Loading bands...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">Bands</h2>
              {selectedEvent && (
                <p className="text-white/70 text-sm mt-1">
                  Managing performances for: <span className="text-band-orange">{selectedEvent.name}</span>
                </p>
              )}
            </div>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="px-4 py-2 text-band-orange underline text-sm hover:text-orange-500 transition-colors min-h-[44px]"
              aria-label="Toggle help"
            >
              {showHelp ? 'Hide Help' : 'Show Help'}
            </button>
          </div>
        </div>
        {!showAddForm && !editingId && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-6 py-3 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors min-h-[48px] font-medium flex items-center"
          >
            + Add Band
          </button>
        )}
      </div>

      {/* Help Panel */}
      {showHelp && <HelpPanel topic="bands" isOpen={showHelp} onClose={() => setShowHelp(false)} />}

      {/* Performer Picker - Shows when event is selected */}
      {selectedEventId && venues.length > 0 && (
        <PerformerPicker
          eventId={selectedEventId}
          eventVenues={venues}
          onPerformanceAdded={performance => {
            showToast(`Performance added: ${performance.name || 'New performance'}`, 'success')
            loadBands()
          }}
        />
      )}

      {/* Bulk action bar */}
      {selectedBands.size > 0 && (
        <BulkActionBar
          count={selectedBands.size}
          action={bulkAction}
          params={bulkParams}
          venues={venues}
          onActionChange={setBulkAction}
          onParamsChange={setBulkParams}
          onSubmit={handleBulkActionSubmit}
          onCancel={handleCancelBulk}
        />
      )}

      {/* Venue Info */}
      {venues.length === 0 && (
        <div className="bg-blue-900/30 border border-blue-600 rounded p-4">
          <p className="text-blue-200 text-sm">
            <strong>Tip:</strong> You can create bands without venues and assign them later. Switch to the Venues tab to
            create venues when ready.
          </p>
        </div>
      )}

      {/* Add Form (New bands only, shown at top) */}
      {showAddForm && !editingId && (
        <div className="bg-band-purple p-6 rounded-lg border border-band-orange/20">
          <h3 className="text-lg font-bold text-band-orange mb-4">Add New Band</h3>

          <BandForm
            events={events}
            venues={venues}
            formData={formData}
            submitting={submitting}
            mode="create"
            globalView={!selectedEventId}
            onChange={handleInputChange}
            onSubmit={handleAdd}
            onCancel={resetForm}
            conflicts={formConflicts}
          />
        </div>
      )}

      {/* Bands List */}
      <div className="bg-band-purple rounded-lg border border-band-orange/20 overflow-hidden">
        {!loading && sortedBands.length === 0 ? (
          <div className="p-8 text-center text-white/50">
            {selectedEventId 
              ? 'No bands yet for this event. Add your first band to get started!' 
              : 'No bands available'}
          </div>
        ) : loading ? (
          <div className="p-8 text-center text-white/50">
            <div className="text-band-orange text-lg">Loading bands...</div>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-band-navy/50 border-b border-band-orange/20">
                  <tr>
                    <th className="px-4 py-3 text-left w-12">
                      <input
                        type="checkbox"
                        className="w-5 h-5 cursor-pointer"
                        checked={selectedBands.size === bands.length && bands.length > 0}
                        ref={el => {
                          if (el) {
                            el.indeterminate = selectedBands.size > 0 && selectedBands.size < bands.length
                          }
                        }}
                        onChange={e => handleSelectAll(e.target.checked)}
                      />
                    </th>
                    <th
                      className="px-4 py-3 min-h-[48px] text-left text-white font-semibold cursor-pointer hover:text-band-orange transition-colors"
                      onClick={() => handleSort('name')}
                      tabIndex={0}
                      aria-sort={sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      aria-label={`Sort by band name${sortConfig.key === 'name' ? ` ${sortConfig.direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                      onKeyPress={(e) => e.key === 'Enter' && handleSort('name')}
                    >
                      Band Name <SortIcon columnKey="name" />
                    </th>
                    <th
                      className="px-4 py-3 min-h-[48px] text-left text-white font-semibold cursor-pointer hover:text-band-orange transition-colors"
                      onClick={() => handleSort('origin')}
                      tabIndex={0}
                      aria-sort={sortConfig.key === 'origin' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      aria-label={`Sort by origin${sortConfig.key === 'origin' ? ` ${sortConfig.direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                      onKeyPress={(e) => e.key === 'Enter' && handleSort('origin')}
                    >
                      Origin <SortIcon columnKey="origin" />
                    </th>
                    <th
                      className="px-4 py-3 min-h-[48px] text-left text-white font-semibold cursor-pointer hover:text-band-orange transition-colors"
                      onClick={() => handleSort('genre')}
                      tabIndex={0}
                      aria-sort={sortConfig.key === 'genre' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      aria-label={`Sort by genre${sortConfig.key === 'genre' ? ` ${sortConfig.direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                      onKeyPress={(e) => e.key === 'Enter' && handleSort('genre')}
                    >
                      Genre <SortIcon columnKey="genre" />
                    </th>
                    <th
                      className="px-4 py-3 min-h-[48px] text-left text-white font-semibold cursor-pointer hover:text-band-orange transition-colors"
                      onClick={() => handleSort('venue_id')}
                      tabIndex={0}
                      aria-sort={sortConfig.key === 'venue_id' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      aria-label={`Sort by venue${sortConfig.key === 'venue_id' ? ` ${sortConfig.direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                      onKeyPress={(e) => e.key === 'Enter' && handleSort('venue_id')}
                    >
                      Venue <SortIcon columnKey="venue_id" />
                    </th>
                    <th
                      className="px-4 py-3 min-h-[48px] text-left text-white font-semibold cursor-pointer hover:text-band-orange transition-colors"
                      onClick={() => handleSort('start_time')}
                      tabIndex={0}
                      aria-sort={sortConfig.key === 'start_time' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      aria-label={`Sort by start time${sortConfig.key === 'start_time' ? ` ${sortConfig.direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                      onKeyPress={(e) => e.key === 'Enter' && handleSort('start_time')}
                    >
                      Start Time <SortIcon columnKey="start_time" />
                    </th>
                    <th
                      className="px-4 py-3 min-h-[48px] text-left text-white font-semibold cursor-pointer hover:text-band-orange transition-colors"
                      onClick={() => handleSort('end_time')}
                      tabIndex={0}
                      aria-sort={sortConfig.key === 'end_time' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      aria-label={`Sort by end time${sortConfig.key === 'end_time' ? ` ${sortConfig.direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                      onKeyPress={(e) => e.key === 'Enter' && handleSort('end_time')}
                    >
                      End Time <SortIcon columnKey="end_time" />
                    </th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Duration</th>
                    <th className="px-4 py-3 text-right text-white font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-band-orange/10">
                  {sortedBands.map(band => {
                    const conflicts = getConflicts(band)
                    const hasConflict = conflicts.length > 0
                    const isEditing = editingId === band.id

                    return (
                      <React.Fragment key={band.id}>
                        <tr
                          className={`hover:bg-band-navy/30 transition-colors ${hasConflict ? 'bg-red-900/20' : ''} ${
                            selectedBands.has(band.id) ? 'bg-blue-900/30' : ''
                          } ${isEditing ? 'opacity-50' : ''}`}
                        >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            className="w-5 h-5 cursor-pointer"
                            checked={selectedBands.has(band.id)}
                            onChange={e => handleSelectBand(band.id, e.target.checked)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <div className="text-white font-medium">{band.name}</div>
                            {band.url && (
                              <a
                                href={band.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-band-orange text-xs hover:underline"
                              >
                                View Link
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white/70">{band.origin || '-'}</td>
                        <td className="px-4 py-3 text-white/70">{band.genre || '-'}</td>
                        <td className="px-4 py-3 text-white/70">{getVenueName(band.venue_id)}</td>
                        <td className="px-4 py-3 text-white/70">{formatTimeLabel(band.start_time)}</td>
                        <td className="px-4 py-3 text-white/70">{formatTimeLabel(band.end_time)}</td>
                        <td className="px-4 py-3">
                          {hasConflict ? (
                            <span className="text-red-400 text-xs font-semibold">CONFLICT</span>
                          ) : (
                            <span className="text-white/50 text-sm">{getDurationLabel(band)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => startEdit(band)}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors min-h-[44px]"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(band.id, band.name)}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors min-h-[44px]"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Inline Edit Form */}
                      {isEditing && (
                        <tr>
                          <td colSpan="9" className="p-0">
                            <div ref={editFormRef} className="bg-band-navy/50 p-6 border-t border-b border-band-orange/20">
                              <h3 className="text-lg font-bold text-band-orange mb-4">Edit Band</h3>
                              <BandForm
                                events={events}
                                venues={venues}
                                formData={formData}
                                submitting={submitting}
                                mode="edit"
                                globalView={!selectedEventId}
                                onChange={handleInputChange}
                                onSubmit={handleUpdate}
                                onCancel={resetForm}
                                conflicts={formConflicts}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-band-orange/10">
              {sortedBands.map(band => {
                const conflicts = getConflicts(band)
                const hasConflict = conflicts.length > 0
                const isEditing = editingId === band.id

                return (
                  <React.Fragment key={band.id}>
                  <div
                    className={`p-4 space-y-3 ${hasConflict ? 'bg-red-900/20' : ''} ${
                      selectedBands.has(band.id) ? 'ring-2 ring-blue-500' : ''
                    } ${isEditing ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="w-6 h-6 mt-1 cursor-pointer"
                        checked={selectedBands.has(band.id)}
                        onChange={e => handleSelectBand(band.id, e.target.checked)}
                      />
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-white font-semibold">{band.name}</h3>
                            {band.url && (
                              <a
                                href={band.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-band-orange text-xs hover:underline"
                              >
                                View Link
                              </a>
                            )}
                          </div>
                          {hasConflict && <span className="text-red-400 text-xs font-semibold">CONFLICT</span>}
                        </div>
                      </div>
                    </div>

                    <div className="text-sm space-y-1">
                      {band.origin && (
                        <div>
                          <span className="text-white/50">Origin: </span>
                          <span className="text-white">{band.origin}</span>
                        </div>
                      )}
                      {band.genre && (
                        <div>
                          <span className="text-white/50">Genre: </span>
                          <span className="text-white">{band.genre}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-white/50">Venue: </span>
                        <span className="text-white">{getVenueName(band.venue_id)}</span>
                      </div>
                      <div>
                        <span className="text-white/50">Time: </span>
                        <span className="text-white">{formatTimeRangeLabel(band.start_time, band.end_time)}</span>
                      </div>
                    </div>

                    {hasConflict && <div className="text-xs text-red-400">Overlaps with: {conflicts.join(', ')}</div>}

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => startEdit(band)}
                        className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded text-base font-medium transition-colors min-h-[44px]"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(band.id, band.name)}
                        className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded text-base font-medium transition-colors min-h-[44px]"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Inline Edit Form for Mobile */}
                  {isEditing && (
                    <div ref={editFormRef} className="bg-band-navy/50 p-4 border-t border-b border-band-orange/20">
                      <h3 className="text-lg font-bold text-band-orange mb-4">Edit Band</h3>
                      <BandForm
                        events={events}
                        venues={venues}
                        formData={formData}
                        submitting={submitting}
                        mode="edit"
                        globalView={!selectedEventId}
                        onChange={handleInputChange}
                        onSubmit={handleUpdate}
                        onCancel={resetForm}
                        conflicts={formConflicts}
                      />
                    </div>
                  )}
                  </React.Fragment>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Preview modal */}
      {showPreviewModal && (
        <BulkPreviewModal
          previewData={previewData}
          isProcessing={isProcessing}
          onConfirm={handleConfirmBulk}
          onCancel={() => setShowPreviewModal(false)}
        />
      )}
    </div>
  )
}
