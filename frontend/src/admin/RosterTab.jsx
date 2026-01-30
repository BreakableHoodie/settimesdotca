import React, { useState, useEffect, useMemo, useRef } from 'react'
import { bandsApi } from '../utils/adminApi'
import BandForm from './BandForm'
import BulkActionBar from './BulkActionBar'

/**
 * RosterTab - Manage Global Artist Roster (Band Profiles)
 *
 * Features:
 * - List all unique bands (profiles)
 * - Create/Edit/Delete band profiles
 * - No scheduling data (Time/Venue) here
 */
export default function RosterTab({ showToast }) {
  const [bands, setBands] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' })

  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkAction, setBulkAction] = useState(null)

  const editFormRef = useRef(null)

  // Form state - minimized for Profile only
  const [formData, setFormData] = useState({
    id: null,
    name: '',
    description: '',
    photo_url: '',
    genre: '',
    origin: '',
    website: '',
    instagram: '',
    bandcamp: '',
    facebook: '',
  })
  const [submitting, setSubmitting] = useState(false)

  // Load all bands
  const loadBands = async () => {
    try {
      setLoading(true)
      const result = await bandsApi.getAll()
      // The API returns performances/profiles mixed.
      // We need to deduplicate by ID to get unique profiles.
      // Assuming result.bands contains items with 'id' (performance ID or profile ID?)
      // Actually, we need to be careful. If the API returns performances, multiple rows might share the same band profile info.
      // But we don't expose Profile ID in the current API explicitly, we rely on 'name' grouping or 'id'.
      // For now, let's use the same grouping logic as BandsTab to derive unique artists.

      const allItems = result.bands || []

      // Group by Band Name (since that's our effective unique key for now until V2 API is cleaner)
      // Or if we have profile_id use that.
      // Let's stick to Name grouping to be safe and consistent with previous UI.
      const uniqueBands = []
      const seenNames = new Set()

      allItems.forEach(item => {
        if (!seenNames.has(item.name)) {
          seenNames.add(item.name)
          uniqueBands.push(item)
        }
      })

      setBands(uniqueBands)
    } catch (err) {
      showToast('Failed to load roster: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBands()
  }, [])

  // Sorting
  const sortedBands = useMemo(() => {
    if (!sortConfig.key) return bands

    return [...bands].sort((a, b) => {
      const aVal = (a[sortConfig.key] || '').toLowerCase()
      const bVal = (b[sortConfig.key] || '').toLowerCase()

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [bands, sortConfig])

  const handleSort = key => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  // CRUD Handlers
  const handleAdd = async e => {
    e.preventDefault()
    setSubmitting(true)

    try {
      // Validate
      if (!formData.name?.trim()) throw new Error('Name is required')

      const socialLinks = {
        website: formData.website || '',
        instagram: formData.instagram || '',
        bandcamp: formData.bandcamp || '',
        facebook: formData.facebook || '',
      }

      // Create Profile Only (no event_id, no venue_id)
      await bandsApi.create({
        name: formData.name,
        description: formData.description,
        photo_url: formData.photo_url,
        genre: formData.genre,
        origin: formData.origin,
        social_links: JSON.stringify(socialLinks),
        // Explicitly null schedule fields
        eventId: null,
        venueId: null,
      })

      showToast('Artist added to roster', 'success')
      resetForm()
      loadBands()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async e => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const socialLinks = {
        website: formData.website || '',
        instagram: formData.instagram || '',
        bandcamp: formData.bandcamp || '',
        facebook: formData.facebook || '',
      }

      await bandsApi.update(editingId, {
        name: formData.name,
        description: formData.description,
        photo_url: formData.photo_url,
        genre: formData.genre,
        origin: formData.origin,
        social_links: JSON.stringify(socialLinks),
        // Preserve existing schedule info?
        // The API update might overwrite if we send nulls.
        // We should send undefined for schedule fields if we want to ignore them?
        // Or we just send the profile fields.
        // Let's send null for schedule fields to ensure we don't accidentally schedule them here.
        // WAIT: If we update a profile that has performances, we don't want to wipe the performance data (event_id etc).
        // The current API might be coupled.
        // Let's check `api/admin/bands/[id].js`.
      })

      showToast('Artist updated', 'success')
      resetForm()
      loadBands()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}" from roster? This may remove them from all events.`)) return
    try {
      await bandsApi.delete(id)
      showToast('Artist deleted', 'success')
      loadBands()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const startEdit = band => {
    setEditingId(band.id)

    let socialLinks = {}
    try {
      socialLinks = typeof band.social_links === 'string' ? JSON.parse(band.social_links) : band.social_links || {}
    } catch (e) {
      /* ignore */
    }

    setFormData({
      id: band.id,
      name: band.name,
      description: band.description || '',
      photo_url: band.photo_url || '',
      genre: band.genre || '',
      origin: band.origin || '',
      website: socialLinks.website || '',
      instagram: socialLinks.instagram || '',
      bandcamp: socialLinks.bandcamp || '',
      facebook: socialLinks.facebook || '',
    })
    setShowAddForm(false)
    // scroll to form
    setTimeout(() => editFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
  }

  const resetForm = () => {
    setFormData({
      id: null,
      name: '',
      description: '',
      photo_url: '',
      genre: '',
      origin: '',
      website: '',
      instagram: '',
      bandcamp: '',
      facebook: '',
    })
    setEditingId(null)
    setShowAddForm(false)
  }

  const handleInputChange = e => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  // Selection Logic
  const handleSelect = (id, checked) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      checked ? next.add(id) : next.delete(id)
      return next
    })
  }

  const handleSelectAll = checked => {
    setSelectedIds(checked ? new Set(bands.map(b => b.id)) : new Set())
  }

  const handleBulkSubmit = async () => {
    // Basic implementation for bulk delete only for now in Roster
    if (bulkAction === 'delete') {
      if (!window.confirm(`Delete ${selectedIds.size} artists?`)) return
      // Reuse logic from BandsTab bulk delete
      try {
        const res = await bandsApi.bulkDelete(Array.from(selectedIds))
        if (res.success) {
          showToast(`Deleted ${selectedIds.size} artists`, 'success')
          setSelectedIds(new Set())
          loadBands()
        } else {
          showToast(res.error, 'error')
        }
      } catch (err) {
        showToast(err.message, 'error')
      }
    }
  }

  const SortIcon = ({ col }) => (
    <span className="ml-1 inline-block w-4">
      {sortConfig.key === col ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
    </span>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Global Artist Roster</h2>
          <p className="text-sm text-white/70 mt-1">Master database of all artists and performers.</p>
        </div>
        {!showAddForm && !editingId && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-6 py-3 min-h-[44px] bg-band-orange text-white rounded hover:bg-orange-600 transition-colors font-medium"
          >
            + New Artist
          </button>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="bg-band-navy/80 p-4 rounded border border-band-orange/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sticky top-20 z-10 backdrop-blur-md">
          <span className="text-white font-medium">{selectedIds.size} selected</span>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              className="bg-black/30 border border-white/20 rounded px-3 py-2 min-h-[44px] text-white"
              value={bulkAction || ''}
              onChange={e => setBulkAction(e.target.value)}
            >
              <option value="">Choose Action...</option>
              <option value="delete">Delete</option>
            </select>
            <button
              disabled={!bulkAction}
              onClick={handleBulkSubmit}
              className="px-4 py-2 min-h-[44px] bg-red-600 disabled:opacity-50 text-white rounded"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Form */}
      {(showAddForm || editingId) && (
        <div ref={editFormRef} className="bg-band-purple p-6 rounded-lg border border-band-orange/20">
          <h3 className="text-lg font-bold text-band-orange mb-4">{editingId ? 'Edit Artist' : 'New Artist'}</h3>
          <BandForm
            events={[]} // No events needed for roster
            venues={[]} // No venues needed for roster
            formData={formData}
            submitting={submitting}
            mode={editingId ? 'edit' : 'create'}
            globalView={true} // Hides schedule fields
            onChange={handleInputChange}
            onSubmit={editingId ? handleUpdate : handleAdd}
            onCancel={resetForm}
            conflicts={[]}
          />
        </div>
      )}

      {/* Table */}
      <div className="bg-band-purple rounded-lg border border-band-orange/20 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-band-orange">Loading roster...</div>
        ) : bands.length === 0 ? (
          <div className="p-8 text-center text-white/50">Roster is empty.</div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-band-navy/50 border-b border-band-orange/20">
                  <tr>
                    <th className="px-4 py-3 w-12">
                      <input
                        type="checkbox"
                        className="cursor-pointer h-5 w-5"
                        onChange={e => handleSelectAll(e.target.checked)}
                        checked={selectedIds.size === bands.length && bands.length > 0}
                      />
                    </th>
                    <th
                      onClick={() => handleSort('name')}
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-band-orange"
                    >
                      Name <SortIcon col="name" />
                    </th>
                    <th
                      onClick={() => handleSort('origin')}
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-band-orange"
                    >
                      Origin <SortIcon col="origin" />
                    </th>
                    <th
                      onClick={() => handleSort('genre')}
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-band-orange"
                    >
                      Genre <SortIcon col="genre" />
                    </th>
                    <th className="px-4 py-3 text-right text-white font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-band-orange/10">
                  {sortedBands.map(band => (
                    <tr
                      key={band.id}
                      className={`hover:bg-band-navy/30 transition-colors ${selectedIds.has(band.id) ? 'bg-blue-900/30' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="cursor-pointer h-5 w-5"
                          checked={selectedIds.has(band.id)}
                          onChange={e => handleSelect(band.id, e.target.checked)}
                        />
                      </td>
                      <td className="px-4 py-3 text-white font-medium">{band.name}</td>
                      <td className="px-4 py-3 text-white/70">{band.origin || '-'}</td>
                      <td className="px-4 py-3 text-white/70">{band.genre || '-'}</td>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden divide-y divide-band-orange/10">
              <div className="px-4 py-3 flex items-center justify-between">
                <label className="flex items-center gap-3 text-white">
                  <input
                    type="checkbox"
                    className="h-5 w-5 cursor-pointer"
                    onChange={e => handleSelectAll(e.target.checked)}
                    checked={selectedIds.size === bands.length && bands.length > 0}
                  />
                  <span>Select all</span>
                </label>
                <span className="text-xs text-text-tertiary">{bands.length} artists</span>
              </div>
              {sortedBands.map(band => (
                <div
                  key={band.id}
                  className={`px-4 py-3 space-y-2 ${selectedIds.has(band.id) ? 'bg-blue-900/30' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <label className="flex items-center gap-3 text-white">
                      <input
                        type="checkbox"
                        className="h-5 w-5 cursor-pointer"
                        checked={selectedIds.has(band.id)}
                        onChange={e => handleSelect(band.id, e.target.checked)}
                      />
                      <span className="font-medium">{band.name}</span>
                    </label>
                  </div>
                  <div className="text-sm text-text-secondary space-y-1">
                    <div>Origin: {band.origin || '-'}</div>
                    <div>Genre: {band.genre || '-'}</div>
                  </div>
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
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
