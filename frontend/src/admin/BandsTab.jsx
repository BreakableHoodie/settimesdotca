import { useState, useEffect, useCallback } from 'react'
import { bandsApi, venuesApi } from '../utils/adminApi'
import BulkActionBar from './BulkActionBar'
import BulkPreviewModal from './BulkPreviewModal'

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
export default function BandsTab({ selectedEventId, selectedEvent, events, showToast }) {
  const [bands, setBands] = useState([])
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    venue_id: '',
    start_time: '',
    end_time: '',
    url: ''
  })
  const [submitting, setSubmitting] = useState(false)

  // Bulk operation state
  const [selectedBands, setSelectedBands] = useState(new Set())
  const [bulkAction, setBulkAction] = useState(null)
  const [bulkParams, setBulkParams] = useState({})
  const [previewData, setPreviewData] = useState(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

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
        console.log('Loading bands for event:', selectedEventId, result.bands)
        setBands(result.bands || [])
      } else {
        // Load all bands (including orphaned ones) when no event selected
        const result = await bandsApi.getAll()
        console.log('Loading all bands:', result.bands)
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

  useEffect(() => {
    loadBands()
  }, [selectedEventId, loadBands])

  // Clear selections when event changes
  useEffect(() => {
    setSelectedBands(new Set())
    setBulkAction(null)
  }, [selectedEventId])

  const resetForm = () => {
    setFormData({
      name: '',
      event_id: '',
      venue_id: '',
      start_time: '',
      end_time: '',
      duration: '',
      url: ''
    })
    setShowAddForm(false)
    setEditingId(null)
  }

  // Calculate end time from start time + duration
  const calculateEndTime = (startTime, durationMinutes) => {
    if (!startTime || !durationMinutes) return ''
    const [hours, minutes] = startTime.split(':').map(Number)
    const totalMinutes = hours * 60 + minutes + parseInt(durationMinutes)
    const endHours = Math.floor(totalMinutes / 60) % 24
    const endMinutes = totalMinutes % 60
    return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`
  }

  // Calculate duration from start and end times
  const calculateDuration = (startTime, endTime) => {
    if (!startTime || !endTime) return ''
    const [startH, startM] = startTime.split(':').map(Number)
    const [endH, endM] = endTime.split(':').map(Number)
    let duration = (endH * 60 + endM) - (startH * 60 + startM)
    if (duration < 0) duration += 24 * 60 // Handle overnight
    return duration.toString()
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target

    if (name === 'start_time') {
      // If duration is set, recalculate end_time
      const newEndTime = formData.duration
        ? calculateEndTime(value, formData.duration)
        : formData.end_time
      setFormData(prev => ({ ...prev, start_time: value, end_time: newEndTime }))
    } else if (name === 'end_time') {
      // Recalculate duration when end_time changes
      const newDuration = formData.start_time
        ? calculateDuration(formData.start_time, value)
        : formData.duration
      setFormData(prev => ({ ...prev, end_time: value, duration: newDuration }))
    } else if (name === 'duration') {
      // Recalculate end_time when duration changes
      const newEndTime = formData.start_time
        ? calculateEndTime(formData.start_time, value)
        : formData.end_time
      setFormData(prev => ({ ...prev, duration: value, end_time: newEndTime }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      // Check for duplicate band name (check both loaded bands and make API call for comprehensive check)
      const existingBand = bands.find(band => 
        band.name.toLowerCase() === formData.name.toLowerCase()
      )
      
      if (existingBand) {
        showToast(`A band named "${formData.name}" already exists. Please choose a different name.`, 'error')
        setSubmitting(false)
        return
      }

      const result = await bandsApi.create({
        eventId: selectedEventId || (formData.event_id ? Number(formData.event_id) : null),
        venueId: formData.venue_id ? Number(formData.venue_id) : null,
        name: formData.name,
        startTime: formData.start_time,
        endTime: formData.end_time,
        url: formData.url
      })
      
      // If the API returns an error about duplicate names, show that error
      if (result.error && result.error.includes('Duplicate band name')) {
        showToast(result.message || `A band named "${formData.name}" already exists. Please choose a different name.`, 'error')
        setSubmitting(false)
        return
      }
      
      showToast(selectedEventId ? 'Band added successfully!' : 'Band added!', 'success')
      resetForm()
      loadBands()
    } catch (err) {
      // Check if the error is about duplicate names
      if (err.message && err.message.includes('Duplicate band name')) {
        showToast(`A band named "${formData.name}" already exists. Please choose a different name.`, 'error')
      } else {
        showToast('Failed to add band: ' + err.message, 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      // Check for duplicate band name (excluding the current band being edited)
      const existingBand = bands.find(band => 
        band.id !== editingId && 
        band.name.toLowerCase() === formData.name.toLowerCase()
      )
      
      if (existingBand) {
        showToast(`A band named "${formData.name}" already exists. Please choose a different name.`, 'error')
        setSubmitting(false)
        return
      }

      const result = await bandsApi.update(editingId, {
        venueId: formData.venue_id ? Number(formData.venue_id) : null,
        name: formData.name,
        startTime: formData.start_time,
        endTime: formData.end_time,
        url: formData.url
      })
      
      // If the API returns an error about duplicate names, show that error
      if (result.error && result.error.includes('Duplicate band name')) {
        showToast(result.message || `A band named "${formData.name}" already exists. Please choose a different name.`, 'error')
        setSubmitting(false)
        return
      }
      
      showToast('Band updated successfully!', 'success')
      resetForm()
      loadBands()
    } catch (err) {
      // Check if the error is about duplicate names
      if (err.message && err.message.includes('Duplicate band name')) {
        showToast(`A band named "${formData.name}" already exists. Please choose a different name.`, 'error')
      } else {
        showToast('Failed to update band: ' + err.message, 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (bandId, bandName) => {
    if (!window.confirm(`Are you sure you want to delete "${bandName}"?`)) {
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

  const startEdit = (band) => {
    setEditingId(band.id)
    const duration = calculateDuration(band.start_time, band.end_time)
    setFormData({
      name: band.name,
      venue_id: band.venue_id.toString(),
      start_time: band.start_time,
      end_time: band.end_time,
      duration: duration,
      url: band.url || ''
    })
    setShowAddForm(false)
  }

  // Bulk operation handlers
  const handleSelectBand = (bandId, checked) => {
    setSelectedBands((prev) => {
      const next = new Set(prev)
      checked ? next.add(bandId) : next.delete(bandId)
      return next
    })
  }

  const handleSelectAll = (checked) => {
    setSelectedBands(checked ? new Set(bands.map((b) => b.id)) : new Set())
  }

  const handleBulkActionSubmit = async () => {
    try {
      const response = await fetch("/api/admin/bands/bulk-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Password": localStorage.getItem("adminPassword"),
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
    } catch {
      showToast("Could not load preview. Check connection.", "error")
    }
  }

  const handleConfirmBulk = async (ignoreConflicts) => {
    setIsProcessing(true)
    try {
      const response = await fetch("/api/admin/bands/bulk", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Password": localStorage.getItem("adminPassword"),
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
        showToast(`Updated ${selectedBands.size} bands`, "success")
        setSelectedBands(new Set())
        setBulkAction(null)
        setShowPreviewModal(false)
        loadBands() // Refresh list
      } else {
        showToast(result.error || "Operation failed", "error")
      }
    } catch (error) {
      showToast(`Failed: ${error.message}`, "error")
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

  /**
   * Check for time conflicts at the same venue
   * Returns array of conflicting band names
   */
  const getConflicts = (band) => {
    // No conflicts if no venue assigned or missing time info
    if (!band.venue_id || !band.start_time || !band.end_time) return []

    const conflicts = []
    const bandStart = band.start_time
    const bandEnd = band.end_time

    bands.forEach(other => {
      // Skip self when editing or when displaying (same band)
      if (other.id === band.id) return
      // Skip different venues or bands without venues
      if (!other.venue_id || other.venue_id !== band.venue_id) return

      const otherStart = other.start_time
      const otherEnd = other.end_time

      // Check if times overlap
      const overlaps = (
        (bandStart >= otherStart && bandStart < otherEnd) ||
        (bandEnd > otherStart && bandEnd <= otherEnd) ||
        (bandStart <= otherStart && bandEnd >= otherEnd)
      )

      if (overlaps) {
        conflicts.push(other.name)
      }
    })

    return conflicts
  }

  // Format time for display (HH:MM to h:MM AM/PM)
  const formatTime = (time) => {
    if (!time) return ''
    const [hours, minutes] = time.split(':')
    const h = parseInt(hours)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${displayHour}:${minutes} ${ampm}`
  }

  // Get venue name by ID
  const getVenueName = (venueId) => {
    if (!venueId) return 'No venue assigned'
    const venue = venues.find(v => v.id === venueId)
    return venue ? venue.name : 'Unknown Venue'
  }

  // Sort bands by start time
  const sortedBands = [...bands].sort((a, b) => {
    if (a.start_time < b.start_time) return -1
    if (a.start_time > b.start_time) return 1
    return 0
  })

  if (!selectedEventId) {
    return (
      <div className='space-y-6'>
        {/* Header */}
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h2 className='text-2xl font-bold text-white'>Performances</h2>
            <p className='text-white/70 text-sm mt-1'>
              Managing performances (no event selected)
            </p>
          </div>
        </div>

        {/* Add Band Button */}
        {!showAddForm && !editingId && (
          <div className='flex justify-end'>
            <button
              onClick={() => setShowAddForm(true)}
              className='px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors'
            >
              + Add Performance
            </button>
          </div>
        )}

        {/* Show orphaned bands */}
        {bands.filter(band => !band.event_id).length > 0 ? (
          <>
            <div className='bg-blue-900/20 border border-blue-600 rounded p-4 mb-4'>
              <p className='text-blue-200 text-sm'>
                <strong>Available Bands:</strong> These bands are not assigned to any event. 
                Select an event above to assign them, or create a new event.
              </p>
            </div>
            
            {/* Desktop Table */}
            <div className='hidden md:block overflow-x-auto'>
              <table className='w-full'>
                <thead className='bg-band-purple/50'>
                  <tr>
                    <th className='px-4 py-3 text-left text-white font-semibold'>Band Name</th>
                    <th className='px-4 py-3 text-left text-white font-semibold'>Venue</th>
                    <th className='px-4 py-3 text-left text-white font-semibold'>Start Time</th>
                    <th className='px-4 py-3 text-left text-white font-semibold'>End Time</th>
                    <th className='px-4 py-3 text-left text-white font-semibold'>Duration</th>
                    <th className='px-4 py-3 text-right text-white font-semibold'>Actions</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-band-orange/10'>
                  {bands.filter(band => !band.event_id).map(band => (
                    <tr key={band.id} className='hover:bg-band-navy/30 transition-colors'>
                      <td className='px-4 py-3 text-white font-medium'>{band.name}</td>
                      <td className='px-4 py-3 text-white/70'>{getVenueName(band.venue_id)}</td>
                      <td className='px-4 py-3 text-white/70'>{formatTime(band.start_time)}</td>
                      <td className='px-4 py-3 text-white/70'>{formatTime(band.end_time)}</td>
                      <td className='px-4 py-3 text-white/70'>{band.duration} min</td>
                      <td className='px-4 py-3'>
                        <div className='flex justify-end gap-2'>
                          <button
                            onClick={() => startEdit(band)}
                            className='px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors'
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(band.id)}
                            className='px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors'
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
            <div className='md:hidden divide-y divide-band-orange/10'>
              {bands.filter(band => !band.event_id).map(band => (
                <div key={band.id} className='p-4 space-y-3'>
                  <div className='flex items-start justify-between'>
                    <div>
                      <h3 className='text-white font-semibold'>{band.name}</h3>
                      <p className='text-white/70 text-sm'>{getVenueName(band.venue_id)}</p>
                    </div>
                    <div className='text-right text-sm text-white/70'>
                      <div>{formatTime(band.start_time)} - {formatTime(band.end_time)}</div>
                      <div>{band.duration} min</div>
                    </div>
                  </div>

                  <div className='flex gap-2 pt-2'>
                    <button
                      onClick={() => startEdit(band)}
                      className='flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors'
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(band.id)}
                      className='flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors'
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
      <div className='text-center py-12'>
            <div className='text-white/50 text-lg'>No bands available</div>
            <p className='text-white/30 text-sm mt-2'>Add your first band to get started</p>
          </div>
        )}

        {/* Add/Edit Form */}
        {(showAddForm || editingId) && (
          <div className='bg-band-purple p-6 rounded-lg border border-band-orange/20'>
            <h3 className='text-lg font-bold text-band-orange mb-4'>
              {editingId ? 'Edit Performance' : 'Add Performance'}
            </h3>
            <p className='text-white/70 text-sm mb-4'>
              {selectedEventId 
                ? 'This band will be added to the selected event.'
                : 'This band will be available to assign to events later.'
              }
            </p>

            <form onSubmit={editingId ? handleUpdate : handleAdd}>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                <div className='sm:col-span-2'>
                  <label htmlFor="band-name" className='block text-white mb-2 text-sm'>Band Name *</label>
                  <input
                    type='text'
                    name='name'
                    value={formData.name}
                    onChange={handleInputChange}
                    className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                    required
                    placeholder='The Rockers'
                  />
                </div>

                <div className='sm:col-span-2'>
                  <label htmlFor="band-url" className='block text-white mb-2 text-sm'>Website/Social Media</label>
                  <input
                    type='url'
                    name='url'
                    value={formData.url}
                    onChange={handleInputChange}
                    className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                    placeholder='https://example.com'
                  />
                </div>

                {/* Event Assignment Section - Only show when no event selected */}
                {!selectedEventId && (
                  <>
                    <div className='sm:col-span-2'>
                      <label className='block text-white mb-2 text-sm font-semibold'>Assign to Event (Optional)</label>
                      <p className='text-white/70 text-xs mb-3'>
                        You can assign this band to an event now, or leave it unassigned and assign it later.
                      </p>
                    </div>

                    <div className='sm:col-span-2'>
                      <label htmlFor="band-event" className='block text-white mb-2 text-sm'>Event</label>
                      <select
                        id="band-event" name="event_id"
                        value={formData.event_id || ''}
                        onChange={handleInputChange}
                        className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                      >
                        <option value=''>No event assigned yet</option>
                        {events.map(event => (
                          <option key={event.id} value={event.id}>
                            {event.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className='sm:col-span-2'>
                      <label htmlFor="band-venue" className='block text-white mb-2 text-sm'>Venue</label>
                      <select
                        id="band-venue" name="venue_id"
                        value={formData.venue_id || ''}
                        onChange={handleInputChange}
                        className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                      >
                        <option value=''>No venue assigned yet</option>
                        {venues.map(venue => (
                          <option key={venue.id} value={venue.id}>
                            {venue.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Time fields - only show when event is selected */}
                    {formData.event_id && (
                      <>
                        <div>
                          <label htmlFor="band-start-time" className='block text-white mb-2 text-sm'>Start Time</label>
                          <input
                            type='time'
                            name='start_time'
                            value={formData.start_time}
                            onChange={handleInputChange}
                            className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                          />
                        </div>

                        <div>
                          <label htmlFor="band-end-time" className='block text-white mb-2 text-sm'>End Time</label>
                          <input
                            type='time'
                            name='end_time'
                            value={formData.end_time}
                            onChange={handleInputChange}
                            className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                          />
                        </div>

                        <div>
                          <label htmlFor="band-duration" className='block text-white mb-2 text-sm'>
                            Duration (minutes)
                            <span className='text-gray-400 text-xs ml-2'>or set end time above</span>
                          </label>
                          <input
                            type='number'
                            name='duration'
                            value={formData.duration}
                            onChange={handleInputChange}
                            className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                            placeholder='45'
                            min='1'
                          />
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* When event is selected, show venue and times normally */}
                {selectedEventId && (
                  <>
                    <div className='sm:col-span-2'>
                      <label htmlFor="band-venue" className='block text-white mb-2 text-sm'>
                        Venue
                        <span className='text-gray-400 text-xs ml-2'>(optional - assign later)</span>
                      </label>
                      <select
                        id="band-venue" name="venue_id"
                        value={formData.venue_id}
                        onChange={handleInputChange}
                        className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                      >
                        <option value=''>No venue assigned yet</option>
                        {venues.map(venue => (
                          <option key={venue.id} value={venue.id}>
                            {venue.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="band-start-time" className='block text-white mb-2 text-sm'>Start Time</label>
                      <input
                        type='time'
                        name='start_time'
                        value={formData.start_time}
                        onChange={handleInputChange}
                        className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                      />
                    </div>

                    <div>
                      <label htmlFor="band-end-time" className='block text-white mb-2 text-sm'>End Time</label>
                      <input
                        type='time'
                        name='end_time'
                        value={formData.end_time}
                        onChange={handleInputChange}
                        className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                      />
                    </div>

                    <div>
                      <label htmlFor="band-duration" className='block text-white mb-2 text-sm'>
                        Duration (minutes)
                        <span className='text-gray-400 text-xs ml-2'>or set end time above</span>
                      </label>
                      <input
                        type='number'
                        name='duration'
                        value={formData.duration}
                        onChange={handleInputChange}
                        className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                        placeholder='45'
                        min='1'
                      />
                    </div>
                  </>
                )}
              </div>

              <div className='flex gap-2 mt-6'>
                <button
                  type='submit'
                  disabled={submitting}
                  className='px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors disabled:opacity-50'
                >
                  {submitting ? 'Saving...' : (editingId ? 'Update Performance' : 'Add Performance')}
                </button>
                <button
                  type='button'
                  onClick={resetForm}
                  className='px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors'
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className='text-center py-12'>
        <div className='text-band-orange text-lg'>Loading bands...</div>
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <div>
          <h2 className='text-2xl font-bold text-white'>Bands</h2>
          {selectedEvent && (
            <p className='text-white/70 text-sm mt-1'>
              Managing performances for: <span className='text-band-orange'>{selectedEvent.name}</span>
            </p>
          )}
        </div>
        {!showAddForm && !editingId && (
          <button
            onClick={() => setShowAddForm(true)}
            className='px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors'
          >
            + Add Band
          </button>
        )}
      </div>

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
        <div className='bg-blue-900/30 border border-blue-600 rounded p-4'>
          <p className='text-blue-200 text-sm'>
            <strong>Tip:</strong> You can create bands without venues and assign them later.
            Switch to the Venues tab to create venues when ready.
          </p>
        </div>
      )}

      {/* Add/Edit Form */}
      {(showAddForm || editingId) && (
        <div className='bg-band-purple p-6 rounded-lg border border-band-orange/20'>
          <h3 className='text-lg font-bold text-band-orange mb-4'>
            {editingId ? 'Edit Band' : 'Add New Band'}
          </h3>

          <form onSubmit={editingId ? handleUpdate : handleAdd}>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4'>
              <div className='sm:col-span-2'>
                <label htmlFor="band-name" className='block text-white mb-2 text-sm'>Band Name *</label>
                <input
                  type='text'
                  name='name'
                  value={formData.name}
                  onChange={handleInputChange}
                  className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                  required
                  placeholder='The Rockers'
                />
              </div>

              <div className='sm:col-span-2'>
                <label htmlFor="band-venue" className='block text-white mb-2 text-sm'>
                  Venue
                  <span className='text-gray-400 text-xs ml-2'>(optional - assign later)</span>
                </label>
                <select
                  id="band-venue" name="venue_id"
                  value={formData.venue_id}
                  onChange={handleInputChange}
                  className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                >
                  <option value=''>No venue assigned yet</option>
                  {venues.map(venue => (
                    <option key={venue.id} value={venue.id}>
                      {venue.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="band-start-time" className='block text-white mb-2 text-sm'>Start Time *</label>
                <input
                  type='time'
                  name='start_time'
                  value={formData.start_time}
                  onChange={handleInputChange}
                  className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                  required
                />
              </div>

              <div>
                <label htmlFor="band-duration" className='block text-white mb-2 text-sm'>
                  Duration (minutes)
                  <span className='text-gray-400 text-xs ml-2'>or set end time below</span>
                </label>
                <input
                  type='number'
                  name='duration'
                  value={formData.duration}
                  onChange={handleInputChange}
                  className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                  placeholder='45'
                  min='1'
                />
              </div>

              <div>
                <label htmlFor="band-end-time" className='block text-white mb-2 text-sm'>
                  End Time *
                  <span className='text-gray-400 text-xs ml-2'>or set duration above</span>
                </label>
                <input
                  type='time'
                  name='end_time'
                  value={formData.end_time}
                  onChange={handleInputChange}
                  className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                  required
                />
              </div>

              <div className='sm:col-span-2'>
                <label htmlFor="band-url" className='block text-white mb-2 text-sm'>URL (optional)</label>
                <input
                  type='url'
                  name='url'
                  value={formData.url}
                  onChange={handleInputChange}
                  className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                  placeholder='https://example.com'
                />
              </div>
            </div>

            {/* Conflict Warning */}
            {formData.venue_id && formData.start_time && formData.end_time && (
              (() => {
                const conflicts = getConflicts({
                  id: editingId, // Pass the editing ID so it skips itself
                  venue_id: Number(formData.venue_id),
                  start_time: formData.start_time,
                  end_time: formData.end_time
                })
                return conflicts.length > 0 ? (
                  <div className='bg-red-900/30 border border-red-600 rounded p-3 mb-4'>
                    <p className='text-red-200 text-sm font-semibold mb-1'>
                      Time Conflict Detected!
                    </p>
                    <p className='text-red-200 text-sm'>
                      This time overlaps with: {conflicts.join(', ')}
                    </p>
                  </div>
                ) : null
              })()
            )}

            <div className='flex gap-2'>
              <button
                type='submit'
                disabled={submitting}
                className='px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600 disabled:opacity-50 transition-colors'
              >
                {submitting ? 'Saving...' : editingId ? 'Update Performance' : 'Add Performance'}
              </button>
              <button
                type='button'
                onClick={resetForm}
                className='px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors'
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bands List */}
      <div className='bg-band-purple rounded-lg border border-band-orange/20 overflow-hidden'>
        {sortedBands.length === 0 ? (
          <div className='p-8 text-center text-white/50'>
            No bands yet for this event. Add your first band to get started!
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className='hidden md:block overflow-x-auto'>
              <table className='w-full'>
                <thead className='bg-band-navy/50 border-b border-band-orange/20'>
                  <tr>
                    <th className='px-4 py-3 text-left w-12'>
                      <input
                        type="checkbox"
                        className="w-5 h-5 cursor-pointer"
                        checked={
                          selectedBands.size === bands.length && bands.length > 0
                        }
                        ref={(el) => {
                          if (el) {
                            el.indeterminate =
                              selectedBands.size > 0 &&
                              selectedBands.size < bands.length;
                          }
                        }}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </th>
                    <th className='px-4 py-3 text-left text-white font-semibold'>Band Name</th>
                    <th className='px-4 py-3 text-left text-white font-semibold'>Venue</th>
                    <th className='px-4 py-3 text-left text-white font-semibold'>Start Time</th>
                    <th className='px-4 py-3 text-left text-white font-semibold'>End Time</th>
                    <th className='px-4 py-3 text-left text-white font-semibold'>Duration</th>
                    <th className='px-4 py-3 text-right text-white font-semibold'>Actions</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-band-orange/10'>
                  {sortedBands.map(band => {
                    const conflicts = getConflicts(band)
                    const hasConflict = conflicts.length > 0

                    return (
                      <tr
                        key={band.id}
                        className={`hover:bg-band-navy/30 transition-colors ${
                          hasConflict ? 'bg-red-900/20' : ''
                        } ${
                          selectedBands.has(band.id)
                            ? "bg-blue-900/30"
                            : ""
                        }`}
                      >
                        <td className='px-4 py-3'>
                          <input
                            type="checkbox"
                            className="w-5 h-5 cursor-pointer"
                            checked={selectedBands.has(band.id)}
                            onChange={(e) =>
                              handleSelectBand(band.id, e.target.checked)
                            }
                          />
                        </td>
                        <td className='px-4 py-3'>
                          <div>
                            <div className='text-white font-medium'>{band.name}</div>
                            {band.url && (
                              <a
                                href={band.url}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='text-band-orange text-xs hover:underline'
                              >
                                View Link
                              </a>
                            )}
                          </div>
                        </td>
                        <td className='px-4 py-3 text-white/70'>
                          {getVenueName(band.venue_id)}
                        </td>
                        <td className='px-4 py-3 text-white/70'>
                          {formatTime(band.start_time)}
                        </td>
                        <td className='px-4 py-3 text-white/70'>
                          {formatTime(band.end_time)}
                        </td>
                        <td className='px-4 py-3'>
                          {hasConflict ? (
                            <span className='text-red-400 text-xs font-semibold'>
                              CONFLICT
                            </span>
                          ) : (
                            <span className='text-white/50 text-sm'>
                              {(() => {
                                const [sh, sm] = band.start_time.split(':').map(Number)
                                const [eh, em] = band.end_time.split(':').map(Number)
                                const mins = (eh * 60 + em) - (sh * 60 + sm)
                                return `${mins} min`
                              })()}
                            </span>
                          )}
                        </td>
                        <td className='px-4 py-3'>
                          <div className='flex justify-end gap-2'>
                            <button
                              onClick={() => startEdit(band)}
                              className='px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors'
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(band.id, band.name)}
                              className='px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors'
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className='md:hidden divide-y divide-band-orange/10'>
              {sortedBands.map(band => {
                const conflicts = getConflicts(band)
                const hasConflict = conflicts.length > 0

                return (
                  <div
                    key={band.id}
                    className={`p-4 space-y-3 ${hasConflict ? 'bg-red-900/20' : ''} ${
                      selectedBands.has(band.id) ? "ring-2 ring-blue-500" : ""
                    }`}
                  >
                    <div className='flex items-start gap-3'>
                      <input
                        type="checkbox"
                        className="w-6 h-6 mt-1 cursor-pointer"
                        checked={selectedBands.has(band.id)}
                        onChange={(e) => handleSelectBand(band.id, e.target.checked)}
                      />
                      <div className='flex-1'>
                    <div className='flex items-start justify-between'>
                      <div>
                        <h3 className='text-white font-semibold'>{band.name}</h3>
                        {band.url && (
                          <a
                            href={band.url}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-band-orange text-xs hover:underline'
                          >
                            View Link
                          </a>
                        )}
                      </div>
                      {hasConflict && (
                        <span className='text-red-400 text-xs font-semibold'>CONFLICT</span>
                      )}
                        </div>
                      </div>
                    </div>

                    <div className='text-sm space-y-1'>
                      <div>
                        <span className='text-white/50'>Venue: </span>
                        <span className='text-white'>{getVenueName(band.venue_id)}</span>
                      </div>
                      <div>
                        <span className='text-white/50'>Time: </span>
                        <span className='text-white'>
                          {formatTime(band.start_time)} - {formatTime(band.end_time)}
                        </span>
                      </div>
                    </div>

                    {hasConflict && (
                      <div className='text-xs text-red-400'>
                        Overlaps with: {conflicts.join(', ')}
                      </div>
                    )}

                    <div className='flex gap-2 pt-2'>
                      <button
                        onClick={() => startEdit(band)}
                        className='flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors'
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(band.id, band.name)}
                        className='flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors'
                      >
                        Delete
                      </button>
                    </div>
                  </div>
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
