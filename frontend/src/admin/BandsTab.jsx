import { useState, useEffect, useCallback, useMemo } from 'react'
import { bandsApi, venuesApi } from '../utils/adminApi'
import BulkActionBar from './BulkActionBar'
import BulkPreviewModal from './BulkPreviewModal'
import BandForm from './BandForm'
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
  const [formData, setFormData] = useState(() => ({
    name: '',
    event_id: selectedEventId ? selectedEventId.toString() : '',
    venue_id: '',
    start_time: '',
    end_time: '',
    duration: '',
    url: '',
  }))
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

  const resetForm = () => {
    setFormData({
      name: '',
      event_id: selectedEventId ? selectedEventId.toString() : '',
      venue_id: '',
      start_time: '',
      end_time: '',
      duration: '',
      url: '',
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
    } catch {
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

  // Sort bands by start time
  const sortedBands = useMemo(() => sortBandsByStart(bands), [bands])

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

  if (!selectedEventId) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Performances</h2>
            <p className="text-white/70 text-sm mt-1">Managing performances (no event selected)</p>
          </div>
        </div>

        {/* Add Band Button */}
        {!showAddForm && !editingId && (
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors"
            >
              + Add Performance
            </button>
          </div>
        )}

        {/* Show orphaned bands */}
        {bands.filter(band => !band.event_id).length > 0 ? (
          <>
            <div className="bg-blue-900/20 border border-blue-600 rounded p-4 mb-4">
              <p className="text-blue-200 text-sm">
                <strong>Available Bands:</strong> These bands are not assigned to any event. Select an event above to
                assign them, or create a new event.
              </p>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-band-purple/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-white font-semibold">Band Name</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Venue</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Start Time</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">End Time</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Duration</th>
                    <th className="px-4 py-3 text-right text-white font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-band-orange/10">
                  {bands
                    .filter(band => !band.event_id)
                    .map(band => (
                      <tr key={band.id} className="hover:bg-band-navy/30 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{band.name}</td>
                        <td className="px-4 py-3 text-white/70">{getVenueName(band.venue_id)}</td>
                        <td className="px-4 py-3 text-white/70">{formatTimeLabel(band.start_time)}</td>
                        <td className="px-4 py-3 text-white/70">{formatTimeLabel(band.end_time)}</td>
                        <td className="px-4 py-3 text-white/70">{getDurationLabel(band)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => startEdit(band)}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(band.id, band.name)}
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
              {bands
                .filter(band => !band.event_id)
                .map(band => (
                  <div key={band.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-white font-semibold">{band.name}</h3>
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
                        className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(band.id, band.name)}
                        className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </>
        ) : (
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
        <div>
          <h2 className="text-2xl font-bold text-white">Bands</h2>
          {selectedEvent && (
            <p className="text-white/70 text-sm mt-1">
              Managing performances for: <span className="text-band-orange">{selectedEvent.name}</span>
            </p>
          )}
        </div>
        {!showAddForm && !editingId && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors"
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
        <div className="bg-blue-900/30 border border-blue-600 rounded p-4">
          <p className="text-blue-200 text-sm">
            <strong>Tip:</strong> You can create bands without venues and assign them later. Switch to the Venues tab to
            create venues when ready.
          </p>
        </div>
      )}

      {/* Add/Edit Form */}
      {(showAddForm || editingId) && (
        <div className="bg-band-purple p-6 rounded-lg border border-band-orange/20">
          <h3 className="text-lg font-bold text-band-orange mb-4">{editingId ? 'Edit Band' : 'Add New Band'}</h3>

          <BandForm
            events={events}
            venues={venues}
            formData={formData}
            submitting={submitting}
            mode={editingId ? 'edit' : 'create'}
            onChange={handleInputChange}
            onSubmit={editingId ? handleUpdate : handleAdd}
            onCancel={resetForm}
            conflicts={formConflicts}
          />
        </div>
      )}

      {/* Bands List */}
      <div className="bg-band-purple rounded-lg border border-band-orange/20 overflow-hidden">
        {sortedBands.length === 0 ? (
          <div className="p-8 text-center text-white/50">
            No bands yet for this event. Add your first band to get started!
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
                    <th className="px-4 py-3 text-left text-white font-semibold">Band Name</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Venue</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Start Time</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">End Time</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Duration</th>
                    <th className="px-4 py-3 text-right text-white font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-band-orange/10">
                  {sortedBands.map(band => {
                    const conflicts = getConflicts(band)
                    const hasConflict = conflicts.length > 0

                    return (
                      <tr
                        key={band.id}
                        className={`hover:bg-band-navy/30 transition-colors ${hasConflict ? 'bg-red-900/20' : ''} ${
                          selectedBands.has(band.id) ? 'bg-blue-900/30' : ''
                        }`}
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
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(band.id, band.name)}
                              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors"
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
            <div className="md:hidden divide-y divide-band-orange/10">
              {sortedBands.map(band => {
                const conflicts = getConflicts(band)
                const hasConflict = conflicts.length > 0

                return (
                  <div
                    key={band.id}
                    className={`p-4 space-y-3 ${hasConflict ? 'bg-red-900/20' : ''} ${
                      selectedBands.has(band.id) ? 'ring-2 ring-blue-500' : ''
                    }`}
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
                        className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(band.id, band.name)}
                        className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors"
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
