import { useState, useEffect, useCallback } from 'react'
import { bandsApi, venuesApi } from '../utils/adminApi'

/**
 * BandsTab - Manage bands for the selected event
 *
 * Features:
 * - Requires selected event from AdminPanel
 * - List bands sorted by start time with venue, time range
 * - Add band form with name, venue dropdown, start/end time, optional URL
 * - Edit band functionality
 * - Conflict detection for overlapping times at same venue
 * - Delete band
 * - Mobile-responsive design
 */
export default function BandsTab({ selectedEventId, selectedEvent, showToast }) {
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
      const result = await bandsApi.getByEvent(selectedEventId)
      setBands(result.bands || [])
    } catch (err) {
      showToast('Failed to load bands: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [selectedEventId, showToast])

  useEffect(() => {
    loadVenues()
  }, [loadVenues])

  useEffect(() => {
    if (selectedEventId) {
      loadBands()
    }
  }, [selectedEventId, loadBands])

  const resetForm = () => {
    setFormData({
      name: '',
      venue_id: '',
      start_time: '',
      end_time: '',
      url: ''
    })
    setShowAddForm(false)
    setEditingId(null)
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      await bandsApi.create({
        ...formData,
        event_id: selectedEventId,
        venue_id: Number(formData.venue_id)
      })
      showToast('Band added successfully!', 'success')
      resetForm()
      loadBands()
    } catch (err) {
      showToast('Failed to add band: ' + err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      await bandsApi.update(editingId, {
        ...formData,
        venue_id: Number(formData.venue_id)
      })
      showToast('Band updated successfully!', 'success')
      resetForm()
      loadBands()
    } catch (err) {
      showToast('Failed to update band: ' + err.message, 'error')
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
    setFormData({
      name: band.name,
      venue_id: band.venue_id.toString(),
      start_time: band.start_time,
      end_time: band.end_time,
      url: band.url || ''
    })
    setShowAddForm(false)
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  /**
   * Check for time conflicts at the same venue
   * Returns array of conflicting band names
   */
  const getConflicts = (band) => {
    if (!band.venue_id || !band.start_time || !band.end_time) return []

    const conflicts = []
    const bandStart = band.start_time
    const bandEnd = band.end_time

    bands.forEach(other => {
      // Skip self when editing
      if (editingId && other.id === editingId) return
      // Skip different venues
      if (other.venue_id !== band.venue_id) return

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
      <div className='text-center py-12'>
        <div className='text-white/50 text-lg'>Please select an event to manage bands</div>
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
              Managing bands for: <span className='text-band-orange'>{selectedEvent.name}</span>
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

      {/* Venue Warning */}
      {venues.length === 0 && (
        <div className='bg-yellow-900/30 border border-yellow-600 rounded p-4'>
          <p className='text-yellow-200 text-sm'>
            <strong>Note:</strong> You need to add venues first before adding bands.
            Switch to the Venues tab to create venues.
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
                <label htmlFor="band-venue" className='block text-white mb-2 text-sm'>Venue *</label>
                <select
                  id="band-venue" name="venue_id"
                  value={formData.venue_id}
                  onChange={handleInputChange}
                  className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                  required
                >
                  <option value=''>Select a venue...</option>
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
                <label htmlFor="band-end-time" className='block text-white mb-2 text-sm'>End Time *</label>
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
                {submitting ? 'Saving...' : editingId ? 'Update Band' : 'Add Band'}
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
                        }`}
                      >
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
                    className={`p-4 space-y-3 ${hasConflict ? 'bg-red-900/20' : ''}`}
                  >
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
    </div>
  )
}
