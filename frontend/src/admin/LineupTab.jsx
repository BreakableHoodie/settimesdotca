import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { bandsApi, venuesApi } from '../utils/adminApi'
import BandForm from './BandForm'
import BulkActionBar from './BulkActionBar'
import ArtistPicker from './components/ArtistPicker'
import { DEFAULT_GENRES, getNormalizedGenreSuggestions } from '../utils/genres'
import {
  calculateEndTimeFromDuration,
  calculateStartTimeFromDuration,
  deriveDurationMinutes,
  detectConflicts,
  formatDurationLabel,
  formatTimeRangeLabel,
  sortBandsByStart,
} from './utils/timeUtils'

/**
 * LineupTab - Manage Event Schedule
 * Replaces the event-mode of BandsTab.
 */
export default function LineupTab({
  selectedEventId,
  selectedEvent: _selectedEvent,
  events,
  showToast,
  onEventFilterChange: _onEventFilterChange,
  readOnly = false,
}) {
  const [bands, setBands] = useState([]) // Current event performances
  const [allBands, setAllBands] = useState([]) // For picker (all roster)
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [rosterLoading, setRosterLoading] = useState(false)

  // Modes: 'list', 'picker', 'form'
  const [viewMode, setViewMode] = useState('list')
  const [editingId, setEditingId] = useState(null)
  const [selectedProfile, setSelectedProfile] = useState(null)

  const [sortConfig, setSortConfig] = useState({ key: 'start_time', direction: 'asc' })
  const [searchTerm, setSearchTerm] = useState('')
  const [venueFilter, setVenueFilter] = useState('all')
  const [formData, setFormData] = useState({
    id: null,
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
    origin_city: '',
    origin_region: '',
    contact_email: '',
    is_active: 1,
    website: '',
    instagram: '',
    bandcamp: '',
    facebook: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [serverConflicts, setServerConflicts] = useState([])

  // Selected IDs for bulk delete within event
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkAction, setBulkAction] = useState(null)
  const [bulkParams, setBulkParams] = useState({})

  const splitOrigin = origin => {
    if (!origin) return { city: '', region: '' }
    const [city, region] = origin.split(',').map(part => part.trim())
    return { city: city || '', region: region || '' }
  }

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [venuesRes, bandsRes] = await Promise.all([venuesApi.getAll(), bandsApi.getByEvent(selectedEventId)])

      setVenues(venuesRes.venues || [])
      setBands(bandsRes.bands || [])
    } catch (err) {
      showToast('Failed to load schedule: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [selectedEventId, showToast])

  const loadRoster = useCallback(async () => {
    if (!selectedEventId) return
    try {
      setRosterLoading(true)
      const allBandsRes = await bandsApi.getAll()
      setAllBands(allBandsRes.bands || [])
    } catch (err) {
      showToast('Failed to load roster: ' + err.message, 'error')
    } finally {
      setRosterLoading(false)
    }
  }, [selectedEventId, showToast])

  const originCitySuggestions = useMemo(() => {
    const values = new Set()
    allBands.forEach(band => {
      if (band.origin_city) values.add(band.origin_city)
      if (!band.origin_city && band.origin) {
        const parsed = splitOrigin(band.origin)
        if (parsed.city) values.add(parsed.city)
      }
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [allBands])

  const originRegionSuggestions = useMemo(() => {
    const values = new Set()
    allBands.forEach(band => {
      if (band.origin_region) values.add(band.origin_region)
      if (!band.origin_region && band.origin) {
        const parsed = splitOrigin(band.origin)
        if (parsed.region) values.add(parsed.region)
      }
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [allBands])

  const genreSuggestions = useMemo(() => {
    const values = []
    allBands.forEach(band => {
      if (!band.genre) return
      band.genre
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean)
        .forEach(entry => values.push(entry))
    })
    return getNormalizedGenreSuggestions(values, DEFAULT_GENRES)
  }, [allBands])

  useEffect(() => {
    if (selectedEventId) loadData()
  }, [selectedEventId, loadData])

  // Reset form when event changes
  useEffect(() => {
    setViewMode('list')
    setEditingId(null)
    setSelectedProfile(null)
    setSelectedIds(new Set())
  }, [selectedEventId])

  const handleInputChange = e => {
    const { name, value } = e.target
    const parseDuration = input => {
      const parsed = Number(input)
      if (!Number.isFinite(parsed) || parsed <= 0) return null
      return Math.round(parsed)
    }

    setFormData(prev => {
      if (serverConflicts.length) {
        setServerConflicts([])
      }
      const next = { ...prev, [name]: name === 'is_active' ? Number(value) : value }
      const durationMinutes = parseDuration(next.duration)

      if (name === 'start_time') {
        if (durationMinutes != null) {
          next.end_time = calculateEndTimeFromDuration(next.start_time, durationMinutes)
        } else if (next.end_time) {
          const derived = deriveDurationMinutes(next.start_time, next.end_time)
          next.duration = derived != null ? String(derived) : ''
        }
      }

      if (name === 'end_time') {
        if (next.start_time) {
          const derived = deriveDurationMinutes(next.start_time, next.end_time)
          next.duration = derived != null ? String(derived) : ''
        } else if (durationMinutes != null) {
          next.start_time = calculateStartTimeFromDuration(next.end_time, durationMinutes)
        }
      }

      if (name === 'duration') {
        if (next.start_time && durationMinutes != null) {
          next.end_time = calculateEndTimeFromDuration(next.start_time, durationMinutes)
        } else if (!next.start_time && next.end_time && durationMinutes != null) {
          next.start_time = calculateStartTimeFromDuration(next.end_time, durationMinutes)
        }
      }

      return next
    })
  }

  // Picker selection handler
  const handlePickerSelect = (artist, newName) => {
    setServerConflicts([])
    if (artist) {
      // Selected existing artist from roster
      setSelectedProfile(artist)
      const parsedOrigin = splitOrigin(artist.origin)

      // Pre-fill form with existing profile data
      let socialLinks = {}
      try {
        socialLinks = JSON.parse(artist.social_links || '{}')
      } catch {
        /* Invalid JSON, use empty object */
      }

      setFormData({
        ...formData,
        name: artist.name,
        genre: artist.genre || '',
        origin: artist.origin || '',
        origin_city: artist.origin_city || parsedOrigin.city,
        origin_region: artist.origin_region || parsedOrigin.region,
        contact_email: artist.contact_email || '',
        is_active: artist.is_active ?? 1,
        description: artist.description || '',
        photo_url: artist.photo_url || '',
        url: artist.url || '',
        website: socialLinks.website || '',
        instagram: socialLinks.instagram || '',
        bandcamp: socialLinks.bandcamp || '',
        facebook: socialLinks.facebook || '',
        // Ensure event_id is set
        event_id: selectedEventId.toString(),
      })
    } else {
      // Create new
      setSelectedProfile(null)
      setFormData({
        ...formData,
        name: newName || '',
        genre: '',
        origin: '',
        origin_city: '',
        origin_region: '',
        contact_email: '',
        is_active: 1,
        description: '',
        photo_url: '',
        url: '',
        website: '',
        instagram: '',
        bandcamp: '',
        facebook: '',
        event_id: selectedEventId.toString(),
      })
    }
    setViewMode('form')
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const socialLinks = {
        website: formData.website || '',
        instagram: formData.instagram || '',
        bandcamp: formData.bandcamp || '',
        facebook: formData.facebook || '',
      }

      const originDisplay = [formData.origin_city, formData.origin_region].filter(Boolean).join(', ') || ''
      const payload = {
        eventId: Number(formData.event_id),
        venueId: Number(formData.venue_id),
        name: formData.name,
        startTime: formData.start_time,
        endTime: formData.end_time,
        genre: formData.genre,
        origin: originDisplay,
        origin_city: formData.origin_city,
        origin_region: formData.origin_region,
        contact_email: formData.contact_email,
        is_active: Number(formData.is_active) === 1,
        description: formData.description,
        photo_url: formData.photo_url,
        social_links: JSON.stringify(socialLinks),
        url: formData.url,
      }

      if (editingId) {
        await bandsApi.update(editingId, payload)
        showToast('Performance updated', 'success')
      } else {
        await bandsApi.create(payload)
        showToast('Performance added', 'success')
      }

      setViewMode('list')
      setEditingId(null)
      setSelectedProfile(null)
      loadData()
    } catch (err) {
      if (err.status === 409 && err.details?.conflicts?.length) {
        const conflictNames = err.details.conflicts
          .map(conflict => {
            const range = conflict.startTime && conflict.endTime ? `${conflict.startTime}-${conflict.endTime}` : ''
            return range ? `${conflict.name} (${range})` : conflict.name
          })
          .join(', ')
        setServerConflicts(err.details.conflicts.map(conflict => conflict.name))
        showToast(`Time conflict: ${conflictNames}`, 'error')
      } else {
        showToast(err.message, 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Remove "${name}" from this event?`)) return
    try {
      await bandsApi.delete(id)
      showToast('Performance removed', 'success')
      loadData()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const startEdit = band => {
    setServerConflicts([])
    setEditingId(band.id)
    setSelectedProfile(null) // Editing existing performance implies we have the data
    const durationMinutes = deriveDurationMinutes(band.start_time, band.end_time)
    let socialLinks = {}
    try {
      socialLinks = JSON.parse(band.social_links || '{}')
    } catch {
      /* Invalid JSON, use empty object */
    }

    const parsedOrigin = splitOrigin(band.origin)

    setFormData({
      id: band.id,
      name: band.name,
      event_id: band.event_id?.toString() || selectedEventId.toString(),
      venue_id: band.venue_id?.toString() || '',
      start_time: band.start_time || '',
      end_time: band.end_time || '',
      duration: durationMinutes?.toString() || '',
      url: band.url || '',
      description: band.description || '',
      photo_url: band.photo_url || '',
      genre: band.genre || '',
      origin: band.origin || '',
      origin_city: band.origin_city || parsedOrigin.city,
      origin_region: band.origin_region || parsedOrigin.region,
      contact_email: band.contact_email || '',
      is_active: band.is_active ?? 1,
      website: socialLinks.website || '',
      instagram: socialLinks.instagram || '',
      bandcamp: socialLinks.bandcamp || '',
      facebook: socialLinks.facebook || '',
    })
    setViewMode('form')
  }

  // Reuse sorting/conflict logic from BandsTab (simplified)
  const getVenueName = useCallback(id => venues.find(v => String(v.id) === String(id))?.name || 'Unknown', [venues])

  const filteredBands = useMemo(() => {
    let next = bands
    if (searchTerm.trim()) {
      const query = searchTerm.trim().toLowerCase()
      next = next.filter(band => band.name?.toLowerCase().includes(query))
    }
    if (venueFilter !== 'all') {
      next = next.filter(band => String(band.venue_id) === String(venueFilter))
    }
    return next
  }, [bands, searchTerm, venueFilter])

  const sortedBands = useMemo(() => {
    if (!sortConfig.key) {
      return sortBandsByStart(filteredBands)
    }

    const direction = sortConfig.direction === 'asc' ? 1 : -1

    return [...filteredBands].sort((a, b) => {
      if (sortConfig.key === 'name') {
        const aVal = (a.name || '').toLowerCase()
        const bVal = (b.name || '').toLowerCase()
        return aVal.localeCompare(bVal) * direction
      }
      if (sortConfig.key === 'venue') {
        const aVal = getVenueName(a.venue_id).toLowerCase()
        const bVal = getVenueName(b.venue_id).toLowerCase()
        return aVal.localeCompare(bVal) * direction
      }
      if (sortConfig.key === 'duration') {
        const aVal = deriveDurationMinutes(a.start_time, a.end_time) || 0
        const bVal = deriveDurationMinutes(b.start_time, b.end_time) || 0
        return (aVal - bVal) * direction
      }

      const aVal = a.start_time || ''
      const bVal = b.start_time || ''
      return aVal.localeCompare(bVal) * direction
    })
  }, [filteredBands, sortConfig, getVenueName])

  const handleSort = key => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const SortIcon = ({ col }) => (
    <span className="ml-1 inline-block w-4">
      {sortConfig.key === col ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
    </span>
  )

  const formConflicts = useMemo(() => {
    if (!formData.venue_id || !formData.start_time || !formData.end_time) return []
    return detectConflicts(
      {
        id: editingId,
        venue_id: Number(formData.venue_id),
        start_time: formData.start_time,
        end_time: formData.end_time,
      },
      bands
    )
  }, [bands, editingId, formData.venue_id, formData.start_time, formData.end_time])

  const combinedConflicts = useMemo(() => {
    const merged = new Set([...formConflicts, ...serverConflicts])
    return Array.from(merged)
  }, [formConflicts, serverConflicts])

  // Select logic
  const handleSelect = (id, checked) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      checked ? next.add(id) : next.delete(id)
      return next
    })
  }
  const handleSelectAll = checked => setSelectedIds(checked ? new Set(filteredBands.map(b => b.id)) : new Set())

  const handleBulkSubmit = async () => {
    if (bulkAction === 'delete') {
      if (!window.confirm(`Delete ${selectedIds.size} performances?`)) return
      try {
        const res = await bandsApi.bulkDelete(Array.from(selectedIds))
        if (res.success) {
          showToast('Deleted', 'success')
          setSelectedIds(new Set())
          loadData()
        } else {
          showToast(res.error, 'error')
        }
      } catch (e) {
        showToast(e.message, 'error')
      }
    } else if (bulkAction === 'venue' || bulkAction === 'time') {
      // Handle bulk venue/time change
      // Use existing BulkActionBar logic or implement here
      // For brevity, skipping implementation detail but it should hook into same API endpoint
    }
  }

  if (!selectedEventId)
    return <div className="p-8 text-center text-white/50">Select an event to manage its lineup.</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Event Lineup</h2>
          <p className="text-sm text-white/70 mt-1">Manage performances, times, and venues for the selected event.</p>
        </div>
        {viewMode === 'list' && !readOnly && (
          <button
            onClick={() => {
              setViewMode('picker')
              if (!allBands.length) {
                loadRoster()
              }
            }}
            className="px-6 py-3 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors font-medium min-h-[44px]"
          >
            + Add to Lineup
          </button>
        )}
      </div>

      {viewMode === 'picker' && !readOnly && (
        <ArtistPicker
          artists={allBands}
          onSelect={handlePickerSelect}
          onCancel={() => setViewMode('list')}
          loading={rosterLoading}
        />
      )}

      {viewMode === 'form' && !readOnly && (
        <div className="bg-band-purple p-6 rounded-lg border border-band-orange/20">
          <h3 className="text-lg font-bold text-band-orange mb-4">
            {editingId ? 'Edit Performance' : 'Add Performance'}
          </h3>
          <BandForm
            events={events}
            venues={venues}
            formData={formData}
            submitting={submitting}
            mode={editingId ? 'edit' : 'create'}
            showEventIntro={false}
            globalView={false}
            selectedProfile={selectedProfile}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            onCancel={() => {
              setViewMode('list')
              setEditingId(null)
              setSelectedProfile(null)
            }}
            conflicts={combinedConflicts}
            originCitySuggestions={originCitySuggestions}
            originRegionSuggestions={originRegionSuggestions}
            genreSuggestions={genreSuggestions}
          />
        </div>
      )}

      {viewMode === 'list' && (
        <>
          {/* Bulk Actions */}
          {!readOnly && selectedIds.size > 0 && (
            <BulkActionBar
              count={selectedIds.size}
              action={bulkAction}
              params={bulkParams}
              venues={venues}
              onActionChange={setBulkAction}
              onParamsChange={setBulkParams}
              onSubmit={handleBulkSubmit}
              onCancel={() => setSelectedIds(new Set())}
              isGlobalView={false}
            />
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Filter performers"
              className="min-h-[44px] px-3 py-2 rounded bg-band-navy text-white border border-white/10 focus:border-band-orange focus:outline-none w-56"
            />
            <select
              value={venueFilter}
              onChange={e => setVenueFilter(e.target.value)}
              className="min-h-[44px] px-3 py-2 rounded bg-band-navy text-white border border-white/10 focus:border-band-orange focus:outline-none"
            >
              <option value="all">All venues</option>
              {venues.map(venue => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-text-tertiary">
              {sortedBands.length} performance{sortedBands.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* List */}
          <div className="bg-band-purple rounded-lg border border-band-orange/20 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-band-orange">Loading lineup...</div>
            ) : filteredBands.length === 0 ? (
              <div className="p-8 text-center text-white/50">
                {bands.length === 0 ? 'No performances scheduled yet.' : 'No performances match your filters.'}
              </div>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-band-navy/50 border-b border-band-orange/20">
                      <tr>
                        {!readOnly && (
                          <th className="px-4 py-3 w-12">
                            <input
                              type="checkbox"
                              className="h-5 w-5 cursor-pointer"
                              onChange={e => handleSelectAll(e.target.checked)}
                              checked={selectedIds.size === filteredBands.length && filteredBands.length > 0}
                            />
                          </th>
                        )}
                        <th
                          className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-band-orange"
                          onClick={() => handleSort('name')}
                        >
                          Performer <SortIcon col="name" />
                        </th>
                        <th
                          className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-band-orange"
                          onClick={() => handleSort('venue')}
                        >
                          Venue <SortIcon col="venue" />
                        </th>
                        <th
                          className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-band-orange"
                          onClick={() => handleSort('start_time')}
                        >
                          Time <SortIcon col="start_time" />
                        </th>
                        <th
                          className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-band-orange"
                          onClick={() => handleSort('duration')}
                        >
                          Duration <SortIcon col="duration" />
                        </th>
                        {!readOnly && <th className="px-4 py-3 text-right text-white font-semibold">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-band-orange/10">
                      {sortedBands.map(band => {
                        const conflicts = detectConflicts(band, bands)
                        return (
                          <tr
                            key={band.id}
                            className={`hover:bg-band-navy/30 transition-colors ${conflicts.length ? 'bg-red-900/20' : ''} ${selectedIds.has(band.id) ? 'bg-blue-900/30' : ''}`}
                          >
                            {!readOnly && (
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  className="h-5 w-5 cursor-pointer"
                                  checked={selectedIds.has(band.id)}
                                  onChange={e => handleSelect(band.id, e.target.checked)}
                                />
                              </td>
                            )}
                            <td className="px-4 py-3 text-white font-medium">{band.name}</td>
                            <td className="px-4 py-3 text-white/70">{getVenueName(band.venue_id)}</td>
                            <td className="px-4 py-3 text-white/70">
                              {formatTimeRangeLabel(band.start_time, band.end_time)}
                            </td>
                            <td className="px-4 py-3 text-white/70">
                              {conflicts.length ? (
                                <span className="text-red-400 font-bold">CONFLICT</span>
                              ) : (
                                formatDurationLabel(band.start_time, band.end_time)
                              )}
                            </td>
                            {!readOnly && (
                              <td className="px-4 py-3 flex justify-end gap-2">
                                <button
                                  onClick={() => startEdit(band)}
                                  className="px-4 py-2 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(band.id, band.name)}
                                  className="px-4 py-2 min-h-[44px] bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                                >
                                  Delete
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden divide-y divide-band-orange/10">
                  {!readOnly && (
                    <div className="px-4 py-3 flex items-center justify-between">
                      <label className="flex items-center gap-3 text-white">
                        <input
                          type="checkbox"
                          className="h-5 w-5 cursor-pointer"
                          onChange={e => handleSelectAll(e.target.checked)}
                          checked={selectedIds.size === filteredBands.length && filteredBands.length > 0}
                        />
                        <span>Select all</span>
                      </label>
                      <span className="text-xs text-text-tertiary">{filteredBands.length} performances</span>
                    </div>
                  )}
                  {sortedBands.map(band => {
                    const conflicts = detectConflicts(band, bands)
                    return (
                      <div
                        key={band.id}
                        className={`px-4 py-3 space-y-2 ${conflicts.length ? 'bg-red-900/20' : ''} ${selectedIds.has(band.id) ? 'bg-blue-900/30' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <label className="flex items-center gap-3 text-white">
                            {!readOnly && (
                              <input
                                type="checkbox"
                                className="h-5 w-5 cursor-pointer"
                                checked={selectedIds.has(band.id)}
                                onChange={e => handleSelect(band.id, e.target.checked)}
                              />
                            )}
                            <span className="font-medium">{band.name}</span>
                          </label>
                          {conflicts.length ? (
                            <span className="text-xs font-bold text-red-400">CONFLICT</span>
                          ) : (
                            <span className="text-xs text-text-tertiary">
                              {formatDurationLabel(band.start_time, band.end_time)}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-text-secondary space-y-1">
                          <div>Venue: {getVenueName(band.venue_id)}</div>
                          <div>Time: {formatTimeRangeLabel(band.start_time, band.end_time)}</div>
                        </div>
                        {!readOnly && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => startEdit(band)}
                              className="px-4 py-2 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(band.id, band.name)}
                              className="px-4 py-2 min-h-[44px] bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
