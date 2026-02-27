import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { bandsApi } from '../utils/adminApi'
import BandForm from './BandForm'
import { DEFAULT_GENRES, getNormalizedGenreSuggestions } from '../utils/genres'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGlobe } from '@fortawesome/free-solid-svg-icons'
import { faInstagram, faFacebook, faBandcamp } from '@fortawesome/free-brands-svg-icons'

/**
 * RosterTab - Manage Global Artist Roster (Band Profiles)
 *
 * Features:
 * - List all unique bands (profiles)
 * - Create/Edit/Delete band profiles
 * - No scheduling data (Time/Venue) here
 */
export default function RosterTab({ showToast, readOnly = false }) {
  const [bands, setBands] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' })
  const [searchTerm, setSearchTerm] = useState('')

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

  // Load all bands
  const loadBands = useCallback(async () => {
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
  }, [showToast])

  useEffect(() => {
    loadBands()
  }, [loadBands])

  // Sorting
  const formatOrigin = band => {
    if (!band) return ''
    return [band.origin_city, band.origin_region].filter(Boolean).join(', ') || band.origin || ''
  }

  const splitOrigin = origin => {
    if (!origin) return { city: '', region: '' }
    const [city, region] = origin.split(',').map(part => part.trim())
    return { city: city || '', region: region || '' }
  }

  const filteredBands = useMemo(() => {
    if (!searchTerm.trim()) return bands
    const query = searchTerm.trim().toLowerCase()
    return bands.filter(band => {
      const originText = formatOrigin(band)
      return (
        band.name?.toLowerCase().includes(query) ||
        originText.toLowerCase().includes(query) ||
        band.genre?.toLowerCase().includes(query) ||
        band.contact_email?.toLowerCase().includes(query)
      )
    })
  }, [bands, searchTerm])

  const sortedBands = useMemo(() => {
    if (!sortConfig.key) return filteredBands

    return [...filteredBands].sort((a, b) => {
      if (sortConfig.key === 'is_active') {
        const aVal = a.is_active === 0 || a.is_active === false ? 0 : 1
        const bVal = b.is_active === 0 || b.is_active === false ? 0 : 1
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
      }
      if (sortConfig.key === 'origin') {
        const aVal = formatOrigin(a).toLowerCase()
        const bVal = formatOrigin(b).toLowerCase()
        return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      const aVal = (a[sortConfig.key] || '').toLowerCase()
      const bVal = (b[sortConfig.key] || '').toLowerCase()

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredBands, sortConfig])

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
      const originDisplay = [formData.origin_city, formData.origin_region].filter(Boolean).join(', ') || ''

      // Create Profile Only (no event_id, no venue_id)
      await bandsApi.create({
        name: formData.name,
        description: formData.description,
        photo_url: formData.photo_url,
        genre: formData.genre,
        origin: originDisplay,
        origin_city: formData.origin_city,
        origin_region: formData.origin_region,
        contact_email: formData.contact_email,
        is_active: Number(formData.is_active) === 1,
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
      const originDisplay = [formData.origin_city, formData.origin_region].filter(Boolean).join(', ') || ''

      await bandsApi.update(editingId, {
        name: formData.name,
        description: formData.description,
        photo_url: formData.photo_url,
        genre: formData.genre,
        origin: originDisplay,
        origin_city: formData.origin_city,
        origin_region: formData.origin_region,
        contact_email: formData.contact_email,
        is_active: Number(formData.is_active) === 1,
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
    } catch (_e) {
      /* ignore */
    }
    const parsedOrigin = splitOrigin(band.origin)

    setFormData({
      id: band.id,
      name: band.name,
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
      origin_city: '',
      origin_region: '',
      contact_email: '',
      is_active: 1,
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
    if (name === 'is_active') {
      setFormData(prev => ({ ...prev, [name]: Number(value) }))
      return
    }
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const originCitySuggestions = useMemo(() => {
    const values = new Set()
    bands.forEach(band => {
      if (band.origin_city) values.add(band.origin_city)
      if (!band.origin_city && band.origin) {
        const parsed = splitOrigin(band.origin)
        if (parsed.city) values.add(parsed.city)
      }
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [bands])

  const originRegionSuggestions = useMemo(() => {
    const values = new Set()
    bands.forEach(band => {
      if (band.origin_region) values.add(band.origin_region)
      if (!band.origin_region && band.origin) {
        const parsed = splitOrigin(band.origin)
        if (parsed.region) values.add(parsed.region)
      }
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [bands])

  const genreSuggestions = useMemo(() => {
    const values = []
    bands.forEach(band => {
      if (!band.genre) return
      band.genre
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean)
        .forEach(entry => values.push(entry))
    })
    return getNormalizedGenreSuggestions(values, DEFAULT_GENRES)
  }, [bands])

  // Selection Logic
  const handleSelect = (id, checked) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      checked ? next.add(id) : next.delete(id)
      return next
    })
  }

  const handleSelectAll = checked => {
    setSelectedIds(checked ? new Set(filteredBands.map(b => b.id)) : new Set())
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

  // Parse social links and render icons
  const parseSocialLinks = band => {
    let links = {}
    try {
      links = typeof band.social_links === 'string' ? JSON.parse(band.social_links) : band.social_links || {}
    } catch (_e) {
      /* ignore */
    }
    return links
  }

  const SocialLinksIcons = ({ band }) => {
    const links = parseSocialLinks(band)
    const hasAnyLink = links.website || links.instagram || links.bandcamp || links.facebook

    if (!hasAnyLink) return <span className="text-white/30">-</span>

    return (
      <div className="flex gap-2">
        {links.website && (
          <a
            href={links.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/70 hover:text-accent-400 transition-colors"
            title="Website"
          >
            <FontAwesomeIcon icon={faGlobe} />
          </a>
        )}
        {links.instagram && (
          <a
            href={
              links.instagram.startsWith('http')
                ? links.instagram
                : `https://instagram.com/${links.instagram.replace('@', '')}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/70 hover:text-pink-400 transition-colors"
            title="Instagram"
          >
            <FontAwesomeIcon icon={faInstagram} />
          </a>
        )}
        {links.bandcamp && (
          <a
            href={links.bandcamp}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/70 hover:text-teal-400 transition-colors"
            title="Bandcamp"
          >
            <FontAwesomeIcon icon={faBandcamp} />
          </a>
        )}
        {links.facebook && (
          <a
            href={links.facebook}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/70 hover:text-blue-400 transition-colors"
            title="Facebook"
          >
            <FontAwesomeIcon icon={faFacebook} />
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Global Artist Roster</h2>
          <p className="text-sm text-white/70 mt-1">Master database of all artists and performers.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search name, origin, genre"
            className="min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-white/10 focus:border-accent-500 focus:outline-none w-64"
          />
          {!showAddForm && !editingId && !readOnly && (
            <button
              onClick={() => setShowAddForm(true)}
              className="px-6 py-3 min-h-[44px] bg-accent-500 text-white rounded hover:bg-accent-600 transition-colors font-medium"
            >
              + New Artist
            </button>
          )}
        </div>
      </div>

      {/* Bulk Actions */}
      {!readOnly && selectedIds.size > 0 && (
        <div className="bg-bg-navy/80 p-4 rounded border border-accent-500/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sticky top-20 z-10 backdrop-blur-md">
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
      {(showAddForm || editingId) && !readOnly && (
        <div ref={editFormRef} className="bg-bg-purple p-6 rounded-lg border border-accent-500/20">
          <h3 className="text-lg font-bold text-accent-400 mb-4">{editingId ? 'Edit Artist' : 'New Artist'}</h3>
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
            originCitySuggestions={originCitySuggestions}
            originRegionSuggestions={originRegionSuggestions}
            genreSuggestions={genreSuggestions}
          />
        </div>
      )}

      {/* Table */}
      <div className="bg-bg-purple rounded-lg border border-accent-500/20 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-accent-400">Loading roster...</div>
        ) : filteredBands.length === 0 ? (
          <div className="p-8 text-center text-white/50">
            {bands.length === 0 ? 'Roster is empty.' : 'No artists match your filters.'}
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-bg-navy/50 border-b border-accent-500/20">
                  <tr>
                    {!readOnly && (
                      <th className="px-4 py-3 w-12 text-center align-middle">
                        <input
                          type="checkbox"
                          className="cursor-pointer h-5 w-5 align-middle"
                          onChange={e => handleSelectAll(e.target.checked)}
                          checked={selectedIds.size === filteredBands.length && filteredBands.length > 0}
                        />
                      </th>
                    )}
                    <th
                      onClick={() => handleSort('name')}
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-accent-400"
                    >
                      Name <SortIcon col="name" />
                    </th>
                    <th
                      onClick={() => handleSort('origin')}
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-accent-400"
                    >
                      Origin <SortIcon col="origin" />
                    </th>
                    <th
                      onClick={() => handleSort('genre')}
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-accent-400"
                    >
                      Genre <SortIcon col="genre" />
                    </th>
                    <th
                      onClick={() => handleSort('is_active')}
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-accent-400"
                    >
                      Status <SortIcon col="is_active" />
                    </th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Links</th>
                    <th
                      onClick={() => handleSort('contact_email')}
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-accent-400"
                    >
                      Contact <SortIcon col="contact_email" />
                    </th>
                    {!readOnly && <th className="px-4 py-3 text-right text-white font-semibold">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-accent-500/10">
                  {sortedBands.map(band => (
                    <tr
                      key={band.id}
                      className={`hover:bg-bg-navy/30 transition-colors ${selectedIds.has(band.id) ? 'bg-blue-900/30' : ''}`}
                    >
                      {!readOnly && (
                        <td className="px-4 py-3 text-center align-middle">
                          <input
                            type="checkbox"
                            className="cursor-pointer h-5 w-5 align-middle"
                            checked={selectedIds.has(band.id)}
                            onChange={e => handleSelect(band.id, e.target.checked)}
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 text-white font-medium">
                        <a
                          href={`/band/${band.band_profile_id || band.id?.toString().replace('profile_', '')}`}
                          className="text-accent-400 hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {band.name}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-white/70">{formatOrigin(band) || '-'}</td>
                      <td className="px-4 py-3 text-white/70">{band.genre || '-'}</td>
                      <td className="px-4 py-3 text-white/70">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                            band.is_active === 0 || band.is_active === false
                              ? 'bg-gray-700 text-white/80'
                              : 'bg-emerald-600/20 text-emerald-200'
                          }`}
                        >
                          {band.is_active === 0 || band.is_active === false ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <SocialLinksIcons band={band} />
                      </td>
                      <td className="px-4 py-3 text-white/70">{band.contact_email || '-'}</td>
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
                  ))}
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
                  <span className="text-xs text-text-tertiary">{filteredBands.length} artists</span>
                </div>
              )}
              {sortedBands.map(band => (
                <div
                  key={band.id}
                  className={`px-4 py-3 space-y-2 ${selectedIds.has(band.id) ? 'bg-blue-900/30' : ''}`}
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
                      <a
                        href={`/band/${band.band_profile_id || band.id?.toString().replace('profile_', '')}`}
                        className="font-medium text-accent-400 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {band.name}
                      </a>
                    </label>
                  </div>
                  <div className="text-sm text-text-secondary space-y-1">
                    <div>Origin: {formatOrigin(band) || '-'}</div>
                    <div>Genre: {band.genre || '-'}</div>
                    <div>Status: {band.is_active === 0 || band.is_active === false ? 'Inactive' : 'Active'}</div>
                    <div className="flex items-center gap-2">
                      <span>Links:</span>
                      <SocialLinksIcons band={band} />
                    </div>
                    <div>Contact: {band.contact_email || '-'}</div>
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
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
