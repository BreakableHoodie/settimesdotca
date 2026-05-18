import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { bandsApi, venuesApi } from '../utils/adminApi'
import BandForm from './BandForm'
import BulkActionBar from './BulkActionBar'
import BulkPreviewModal from './BulkPreviewModal'
import ArtistPicker from './components/ArtistPicker'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { DEFAULT_GENRES, getNormalizedGenreSuggestions } from '../utils/genres'
import { parseOrigin } from '../utils/parseOrigin'
import {
  adjustForMidnight,
  calculateEndTimeFromDuration,
  calculateStartTimeFromDuration,
  deriveDurationMinutes,
  detectConflicts,
  formatDurationLabel,
  formatTimeRangeLabel,
  parseTimeToMinutes,
  sortBandsByStart,
} from './utils/timeUtils'
import { buildPickerFormData, buildEmptyPickerFormData } from './utils/pickerFormData'

function SortIcon({ col, sortConfig }) {
  return (
    <span className="ml-1 inline-block w-4">
      {sortConfig.key === col ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
    </span>
  )
}

/**
 * LineupTab - Manage Event Schedule
 * Replaces the event-mode of BandsTab.
 */
export default function LineupTab({ selectedEventId, selectedEvent, events, showToast, readOnly = false }) {
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
    youtube: '',
    spotify: '',
    apple_music: '',
    linktree: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState(null)
  const [serverConflicts, setServerConflicts] = useState({ overlaps: [], conflicts: [] })

  // Selected IDs for bulk delete within event
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkAction, setBulkAction] = useState(null)
  const [bulkParams, setBulkParams] = useState({})
  const [bulkPreviewData, setBulkPreviewData] = useState(null)
  const [bulkPreviewLoading, setBulkPreviewLoading] = useState(false)
  const [bulkApplying, setBulkApplying] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState({ open: false, message: '', onConfirm: () => {} })

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
        const parsed = parseOrigin(band.origin)
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
        const parsed = parseOrigin(band.origin)
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
    setBulkPreviewData(null)
  }, [selectedEventId])

  const handleInputChange = e => {
    const { name, value } = e.target
    const parseDuration = input => {
      const parsed = Number(input)
      if (!Number.isFinite(parsed) || parsed <= 0) return null
      return Math.round(parsed)
    }

    setFormData(prev => {
      if (serverConflicts.overlaps.length || serverConflicts.conflicts.length) {
        setServerConflicts({ overlaps: [], conflicts: [] })
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

  // Bulk add multiple artists from roster to this event's lineup
  const handleBulkSelect = async (selectedArtists, venueId, startTime, endTime) => {
    if ((startTime || endTime) && !venueId) {
      showToast('Please assign a venue before setting a time.', 'error')
      return
    }
    const profileIds = selectedArtists.map(a => a.band_profile_id || a.id)
    try {
      const res = await bandsApi.bulkAddToLineup(profileIds, selectedEventId, venueId, startTime, endTime)
      const addedCount = res.added?.length || 0
      const skippedCount = res.skipped?.length || 0
      let msg = `Added ${addedCount} act${addedCount !== 1 ? 's' : ''} to lineup`
      if (skippedCount > 0) msg += ` (${skippedCount} already in lineup, skipped)`
      showToast(msg, addedCount > 0 ? 'success' : 'error')
      setViewMode('list')
      loadData()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  // Picker selection handler
  const handlePickerSelect = (artist, newName) => {
    setServerConflicts({ overlaps: [], conflicts: [] })
    if (artist) {
      // Selected existing artist from roster
      setSelectedProfile(artist)
      // Pre-fill form with existing profile data (scheduling fields always start blank)
      setFormData(buildPickerFormData(artist, selectedEventId))
    } else {
      // Create new (scheduling fields always start blank)
      setSelectedProfile(null)
      setFormData(buildEmptyPickerFormData(newName, selectedEventId))
    }
    setViewMode('form')
  }

  const handleSubmit = async e => {
    e.preventDefault()
    // Require a venue when scheduling a time
    if ((formData.start_time || formData.end_time) && !formData.venue_id) {
      showToast('Please assign a venue before setting a time. Use the Venue field above.', 'error')
      return
    }
    setSubmitting(true)
    try {
      const socialLinks = {
        website: formData.website || '',
        instagram: formData.instagram || '',
        bandcamp: formData.bandcamp || '',
        facebook: formData.facebook || '',
        youtube: formData.youtube || '',
        spotify: formData.spotify || '',
        apple_music: formData.apple_music || '',
        linktree: formData.linktree || '',
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
        const serverOverlaps = err.details.conflicts.filter(c => c.type === 'overlap').map(c => c.name)
        const serverExact = err.details.conflicts.filter(c => c.type === 'conflict').map(c => c.name)
        setServerConflicts({ overlaps: serverOverlaps, conflicts: serverExact })
        const allNames = err.details.conflicts
          .map(c => {
            const range = c.startTime && c.endTime ? `${c.startTime}-${c.endTime}` : ''
            const label = c.type === 'conflict' ? 'exact conflict' : 'overlap'
            return range ? `${c.name} (${label}: ${range})` : c.name
          })
          .join(', ')
        showToast(`Scheduling issue: ${allNames}`, 'error')
      } else {
        showToast(err.message, 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = (id, name) => {
    setConfirmDialog({
      open: true,
      message: `Remove "${name}" from this event?`,
      onConfirm: async () => {
        try {
          await bandsApi.delete(id)
          showToast('Performance removed', 'success')
          loadData()
        } catch (err) {
          showToast(err.message, 'error')
        }
      },
    })
  }

  const toggleAnnounced = async (performanceId, currentValue) => {
    setTogglingId(performanceId)
    try {
      await bandsApi.patch(performanceId, { is_announced: currentValue !== 1 })
      await loadData()
    } catch (err) {
      showToast(err.message || 'Failed to update announced status', 'error')
    } finally {
      setTogglingId(null)
    }
  }

  const startEdit = band => {
    if (!allBands.length && !rosterLoading) loadRoster()
    setServerConflicts({ overlaps: [], conflicts: [] })
    setEditingId(band.id)
    setSelectedProfile(null) // Editing existing performance implies we have the data
    const durationMinutes = deriveDurationMinutes(band.start_time, band.end_time)
    let socialLinks = {}
    try {
      socialLinks = JSON.parse(band.social_links || '{}')
    } catch {
      /* Invalid JSON, use empty object */
    }

    const parsedOrigin = parseOrigin(band.origin)

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
      youtube: socialLinks.youtube || '',
      spotify: socialLinks.spotify || '',
      apple_music: socialLinks.apple_music || '',
      linktree: socialLinks.linktree || '',
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

      const aMin = parseTimeToMinutes(a.start_time)
      const bMin = parseTimeToMinutes(b.start_time)
      if (aMin == null && bMin == null) return 0
      if (aMin == null) return 1
      if (bMin == null) return -1
      const aAdj = adjustForMidnight(aMin)
      const bAdj = adjustForMidnight(bMin)
      return (aAdj - bAdj) * direction
    })
  }, [filteredBands, sortConfig, getVenueName])

  const handleSort = key => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  // Pre-compute conflict results for all bands once, keyed by band id.
  // Avoids O(n²) detectConflicts calls inside the render loop.
  const conflictsByBandId = useMemo(() => {
    const map = new Map()
    for (const band of bands) map.set(band.id, detectConflicts(band, bands))
    return map
  }, [bands])

  const formConflicts = useMemo(() => {
    if (!formData.venue_id || !formData.start_time || !formData.end_time) return { overlaps: [], conflicts: [] }
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
  }, [bands, editingId, formData.event_id, formData.venue_id, formData.start_time, formData.end_time])

  const combinedConflicts = useMemo(
    () => ({
      overlaps: [...new Set([...formConflicts.overlaps, ...serverConflicts.overlaps])],
      conflicts: [...new Set([...formConflicts.conflicts, ...serverConflicts.conflicts])],
    }),
    [formConflicts, serverConflicts]
  )

  // Select logic
  const handleSelect = (id, checked) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      checked ? next.add(id) : next.delete(id)
      return next
    })
  }
  const handleSelectAll = checked => setSelectedIds(checked ? new Set(filteredBands.map(b => b.id)) : new Set())

  const clearBulkState = () => {
    setSelectedIds(new Set())
    setBulkAction(null)
    setBulkParams({})
    setBulkPreviewData(null)
  }

  const handleBulkSubmit = async () => {
    if (bulkAction === 'delete') {
      setConfirmDialog({
        open: true,
        message: `Delete ${selectedIds.size} performance${selectedIds.size !== 1 ? 's' : ''}?`,
        onConfirm: async () => {
          try {
            const res = await bandsApi.bulkDelete(Array.from(selectedIds))
            if (res.success) {
              showToast('Deleted', 'success')
              clearBulkState()
              loadData()
            } else {
              showToast(res.error, 'error')
            }
          } catch (e) {
            showToast(e.message, 'error')
          }
        },
      })
    } else if (bulkAction === 'move_venue' || bulkAction === 'change_time') {
      setBulkPreviewLoading(true)
      try {
        const res = await bandsApi.bulkPreview(Array.from(selectedIds), bulkAction, bulkParams)
        setBulkPreviewData(res)
      } catch (e) {
        showToast(e.message || 'Failed to load preview', 'error')
      } finally {
        setBulkPreviewLoading(false)
      }
    }
  }

  const handleBulkConfirm = async ignoreConflicts => {
    setBulkApplying(true)
    try {
      await bandsApi.bulkUpdate(Array.from(selectedIds), bulkAction, bulkParams, ignoreConflicts)
      showToast(`Updated ${selectedIds.size} performance${selectedIds.size !== 1 ? 's' : ''}`, 'success')
      clearBulkState()
      loadData()
    } catch (e) {
      showToast(e.message || 'Failed to apply changes', 'error')
    } finally {
      setBulkApplying(false)
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
            className="px-6 py-3 bg-accent-500 text-white rounded hover:bg-accent-600 transition-colors font-medium min-h-[44px]"
          >
            + Add to Lineup
          </button>
        )}
      </div>

      {viewMode === 'picker' && !readOnly && (
        <ArtistPicker
          artists={allBands}
          onSelect={handlePickerSelect}
          onBulkSelect={handleBulkSelect}
          onCancel={() => setViewMode('list')}
          loading={rosterLoading}
          venues={venues}
        />
      )}

      {viewMode === 'form' && !readOnly && (
        <div className="bg-bg-purple p-6 rounded-lg border border-accent-500/20">
          <h3 className="text-lg font-bold text-accent-400 mb-4">
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
              onActionChange={action => {
                setBulkAction(action)
                setBulkParams({})
              }}
              onParamsChange={p => setBulkParams(prev => ({ ...prev, ...p }))}
              onSubmit={handleBulkSubmit}
              onCancelAction={() => {
                setBulkAction(null)
                setBulkParams({})
              }}
              onCancelAll={clearBulkState}
              isGlobalView={false}
              isLoading={bulkPreviewLoading}
            />
          )}
          {bulkPreviewData && (
            <BulkPreviewModal
              previewData={bulkPreviewData}
              isProcessing={bulkApplying}
              onConfirm={handleBulkConfirm}
              onCancel={() => setBulkPreviewData(null)}
            />
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Filter performers"
              className="min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-white/10 focus:border-accent-500 focus:outline-hidden w-56"
            />
            <select
              value={venueFilter}
              onChange={e => setVenueFilter(e.target.value)}
              className="min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-white/10 focus:border-accent-500 focus:outline-hidden"
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
          <div className="bg-bg-purple rounded-lg border border-accent-500/20 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-accent-400">Loading lineup...</div>
            ) : filteredBands.length === 0 ? (
              <div className="p-8 text-center text-white/50">
                {bands.length === 0 ? 'No performances scheduled yet.' : 'No performances match your filters.'}
              </div>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-bg-navy/50 border-b border-accent-500/20">
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
                          className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-accent-400"
                          onClick={() => handleSort('name')}
                          aria-sort={
                            sortConfig.key === 'name'
                              ? sortConfig.direction === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          Performer <SortIcon col="name" sortConfig={sortConfig} />
                        </th>
                        <th
                          className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-accent-400"
                          onClick={() => handleSort('venue')}
                          aria-sort={
                            sortConfig.key === 'venue'
                              ? sortConfig.direction === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          Venue <SortIcon col="venue" sortConfig={sortConfig} />
                        </th>
                        <th
                          className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-accent-400"
                          onClick={() => handleSort('start_time')}
                          aria-sort={
                            sortConfig.key === 'start_time'
                              ? sortConfig.direction === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          Time <SortIcon col="start_time" sortConfig={sortConfig} />
                        </th>
                        <th
                          className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-accent-400"
                          onClick={() => handleSort('duration')}
                          aria-sort={
                            sortConfig.key === 'duration'
                              ? sortConfig.direction === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          Duration <SortIcon col="duration" sortConfig={sortConfig} />
                        </th>
                        {!readOnly && <th className="px-4 py-3 text-right text-white font-semibold">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-accent-500/10">
                      {sortedBands.map(band => {
                        const { overlaps, conflicts: exactConflicts } = conflictsByBandId.get(band.id) ?? {
                          overlaps: [],
                          conflicts: [],
                        }
                        const rowHighlight = exactConflicts.length
                          ? 'bg-red-900/20'
                          : overlaps.length
                            ? 'bg-yellow-900/10'
                            : ''
                        return (
                          <tr
                            key={band.id}
                            className={`hover:bg-bg-navy/30 transition-colors ${rowHighlight} ${selectedIds.has(band.id) ? 'bg-blue-900/30' : ''} ${selectedEvent?.reveal_mode === 1 && !band.is_announced ? 'opacity-50' : ''}`}
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
                              {exactConflicts.length ? (
                                <span className="text-red-400 font-bold">CONFLICT</span>
                              ) : overlaps.length ? (
                                <span className="text-yellow-400 font-bold">OVERLAP</span>
                              ) : (
                                formatDurationLabel(band.start_time, band.end_time)
                              )}
                            </td>
                            {!readOnly && (
                              <td className="px-4 py-3 flex justify-end gap-2">
                                {selectedEvent?.reveal_mode === 1 && (
                                  <button
                                    onClick={() => toggleAnnounced(band.id, band.is_announced)}
                                    disabled={togglingId === band.id}
                                    title={
                                      band.is_announced ? 'Announced — click to hide' : 'Hidden — click to announce'
                                    }
                                    className={`p-1.5 rounded transition-colors ${
                                      band.is_announced
                                        ? 'text-green-400 hover:text-green-300'
                                        : 'text-white/30 hover:text-white/60'
                                    } ${togglingId === band.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    aria-label={band.is_announced ? `Unannounce ${band.name}` : `Announce ${band.name}`}
                                  >
                                    {band.is_announced ? <Eye size={14} /> : <EyeOff size={14} />}
                                  </button>
                                )}
                                <button
                                  onClick={() => startEdit(band)}
                                  className="px-4 py-2 min-h-[44px] bg-amber-600 hover:bg-amber-700 text-white rounded text-sm"
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
                <div className="md:hidden divide-y divide-accent-500/10">
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
                    const { overlaps, conflicts: exactConflicts } = conflictsByBandId.get(band.id) ?? {
                      overlaps: [],
                      conflicts: [],
                    }
                    const cardHighlight = exactConflicts.length
                      ? 'bg-red-900/20'
                      : overlaps.length
                        ? 'bg-yellow-900/10'
                        : ''
                    return (
                      <div
                        key={band.id}
                        className={`px-4 py-3 space-y-2 ${cardHighlight} ${selectedIds.has(band.id) ? 'bg-blue-900/30' : ''} ${selectedEvent?.reveal_mode === 1 && !band.is_announced ? 'opacity-50' : ''}`}
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
                          {exactConflicts.length ? (
                            <span className="text-xs font-bold text-red-400">CONFLICT</span>
                          ) : overlaps.length ? (
                            <span className="text-xs font-bold text-yellow-400">OVERLAP</span>
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
                            {selectedEvent?.reveal_mode === 1 && (
                              <button
                                onClick={() => toggleAnnounced(band.id, band.is_announced)}
                                disabled={togglingId === band.id}
                                title={band.is_announced ? 'Announced — click to hide' : 'Hidden — click to announce'}
                                className={`p-1.5 rounded transition-colors ${
                                  band.is_announced
                                    ? 'text-green-400 hover:text-green-300'
                                    : 'text-white/30 hover:text-white/60'
                                } ${togglingId === band.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                aria-label={band.is_announced ? `Unannounce ${band.name}` : `Announce ${band.name}`}
                              >
                                {band.is_announced ? <Eye size={14} /> : <EyeOff size={14} />}
                              </button>
                            )}
                            <button
                              onClick={() => startEdit(band)}
                              className="px-4 py-2 min-h-[44px] bg-amber-600 hover:bg-amber-700 text-white rounded text-sm"
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
      <ConfirmDialog
        isOpen={confirmDialog.open}
        message={confirmDialog.message}
        onConfirm={async () => {
          setConfirmDialog(d => ({ ...d, open: false }))
          await confirmDialog.onConfirm()
        }}
        onCancel={() => setConfirmDialog(d => ({ ...d, open: false }))}
        variant="danger"
      />
    </div>
  )
}
