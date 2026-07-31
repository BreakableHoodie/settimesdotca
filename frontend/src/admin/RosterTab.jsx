import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { bandsApi } from '../utils/adminApi'
import BandForm from './BandForm'
import { DEFAULT_GENRES, getNormalizedGenreSuggestions } from '../utils/genres'
import { parseOrigin } from '../utils/parseOrigin'
import { sortableName } from '../utils/sortableName'
import SocialLinksIcons from './components/SocialLinksIcons'
import FilterFunnel from './components/FilterFunnel'
import ColumnFilter from './components/ColumnFilter'
import LinksColumnFilter from './components/LinksColumnFilter'
import MobileFilterSheet from './components/MobileFilterSheet'
import { EMPTY_GAP_FILTER, LINK_FIELDS, countLinks, formatOrigin } from './utils/bandFields'
import {
  FILTERABLE_COLUMNS,
  isColumnFiltered,
  isInactive,
  linkCountsFor,
  matchesColumnFilters,
  valueCountsFor,
  activeFilterCount,
  columnByKey,
} from './utils/rosterColumns'

const MAX_CHIP_VALUES = 2

function summarizeValues(values) {
  if (values.length <= MAX_CHIP_VALUES) return values.join(', ')
  return `${values.slice(0, MAX_CHIP_VALUES).join(', ')} +${values.length - MAX_CHIP_VALUES}`
}

// Links is the one column whose filter value isn't a flat `values` array (see
// EMPTY_GAP_FILTER's `{ mode, keys, noLinks }` shape) so its chip text is
// built separately: "Missing"/"Has" once, then the selected platform labels
// (falling back to the raw key if a field somehow isn't in LINK_FIELDS),
// with "No links at all" appended as its own item when that preset is set.
function summarizeColumnFilter(column, filter) {
  if (column.key === 'link_count') {
    const { mode = 'missing', keys, noLinks = false } = filter || {}
    const keyList = Array.isArray(keys) ? keys : []
    const modeLabel = mode === 'missing' ? 'Missing' : 'Has'
    const keyLabels = keyList.map(key => LINK_FIELDS.find(field => field.key === key)?.label ?? key)
    const parts = keyLabels.length > 0 ? [`${modeLabel} ${summarizeValues(keyLabels)}`] : []
    if (noLinks) parts.push('No links at all')
    return parts.join(', ') || modeLabel
  }
  const values = Array.isArray(filter?.values) ? filter.values : []
  return summarizeValues(values)
}

function SortIcon({ col, sortConfig }) {
  return (
    <span className="ml-1 inline-block w-4">
      {sortConfig.key === col ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
    </span>
  )
}

// `<th>` is not natively interactive -- a keyboard user cannot activate an
// onClick attached directly to it. Every sortable header instead puts the
// handler on a real <button> inside the <th>, and the <th> carries aria-sort
// reflecting the current state so assistive tech announces which column (and
// direction) the table is sorted by.
function ariaSortFor(sortConfig, key) {
  if (sortConfig.key !== key) return 'none'
  return sortConfig.direction === 'asc' ? 'ascending' : 'descending'
}

// Same pill styling as the existing Status column below — reused here so an
// inactive profile is visible right next to its name too, not just in a
// column that can scroll out of view.
function InactiveBadge() {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-gray-700 text-white/80">
      Inactive
    </span>
  )
}

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
  // Excel-style per-column filters, keyed by FILTERABLE_COLUMNS `key`. A
  // column with no entry (or an empty `values` array) is unfiltered — this
  // defaults to `{}` so no column is filtered and, per #619, a retired
  // profile is never hidden by default.
  const [columnFilters, setColumnFilters] = useState({})
  // Which single column's filter dropdown is open, or null. Only one panel
  // is ever mounted at a time -- ColumnFilter/LinksColumnFilter register their
  // outside-mousedown/Escape listeners unconditionally on mount with no
  // internal `open` gate, so they must only be mounted while actually open.
  const [openFilterKey, setOpenFilterKey] = useState(null)
  const [mobileFilterSheetOpen, setMobileFilterSheetOpen] = useState(false)

  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkAction, setBulkAction] = useState(null)

  const editFormRef = useRef(null)

  // One ref per filterable column, shared between that column's FilterFunnel
  // trigger and the panel it opens -- the panel uses it to treat a mousedown
  // on the trigger as "inside" (no close-then-reopen flicker) and to return
  // focus there on Escape.
  const nameFilterRef = useRef(null)
  const originFilterRef = useRef(null)
  const genreFilterRef = useRef(null)
  const statusFilterRef = useRef(null)
  const linksFilterRef = useRef(null)
  const contactFilterRef = useRef(null)
  const followersFilterRef = useRef(null)

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
    youtube: '',
    spotify: '',
    apple_music: '',
    linktree: '',
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
  // Split in two on purpose. Every column-filter dropdown's counts are
  // computed from `searchFiltered` (search box only) excluding just that
  // column's own filter -- see valueCountsFor/linkCountsFor in
  // rosterColumns.js -- otherwise checking a value would collapse every
  // other count to reflect that selection and the dropdown would stop being
  // a useful picker the moment you used it.
  const searchFiltered = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return bands
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

  const filteredBands = useMemo(
    () => searchFiltered.filter(band => matchesColumnFilters(band, columnFilters)),
    [searchFiltered, columnFilters]
  )

  const sortedBands = useMemo(() => {
    if (!sortConfig.key) return filteredBands

    return [...filteredBands].sort((a, b) => {
      if (sortConfig.key === 'is_active') {
        const aVal = isInactive(a) ? 0 : 1
        const bVal = isInactive(b) ? 0 : 1
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
      }
      if (sortConfig.key === 'origin') {
        const aVal = formatOrigin(a).toLowerCase()
        const bVal = formatOrigin(b).toLowerCase()
        return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      if (sortConfig.key === 'follower_count') {
        const aVal = a.follower_count ?? 0
        const bVal = b.follower_count ?? 0
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
      }
      if (sortConfig.key === 'link_count') {
        const aVal = countLinks(a)
        const bVal = countLinks(b)
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
      }
      if (sortConfig.key === 'name') {
        // Article-stripped alphabetization (#587) — "The Anti-Queens" sorts under A.
        const aVal = sortableName(a.name)
        const bVal = sortableName(b.name)
        return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      const aVal = (a[sortConfig.key] || '').toLowerCase()
      const bVal = (b[sortConfig.key] || '').toLowerCase()

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredBands, sortConfig])

  // Compute effective selection: intersection of selectedIds and visible band ids.
  // This scopes bulk actions to only visible rows when filters hide some selected items.
  // Do NOT prune selectedIds when filters change — that would destroy the user's selection
  // the moment they type in the search box. Instead, derive the effective set here.
  const effectiveSelectedIds = useMemo(() => {
    if (selectedIds.size === 0) return new Set()
    const visibleIds = new Set(filteredBands.map(b => b.id))
    return new Set(Array.from(selectedIds).filter(id => visibleIds.has(id)))
  }, [selectedIds, filteredBands])

  const hiddenSelectedCount = selectedIds.size - effectiveSelectedIds.size

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
        youtube: formData.youtube || '',
        spotify: formData.spotify || '',
        apple_music: formData.apple_music || '',
        linktree: formData.linktree || '',
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
        youtube: formData.youtube || '',
        spotify: formData.spotify || '',
        apple_music: formData.apple_music || '',
        linktree: formData.linktree || '',
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
    const parsedOrigin = parseOrigin(band.origin)

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
      youtube: socialLinks.youtube || '',
      spotify: socialLinks.spotify || '',
      apple_music: socialLinks.apple_music || '',
      linktree: socialLinks.linktree || '',
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
      youtube: '',
      spotify: '',
      apple_music: '',
      linktree: '',
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
        const parsed = parseOrigin(band.origin)
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
        const parsed = parseOrigin(band.origin)
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
    const visibleIds = new Set(filteredBands.map(b => b.id))
    setSelectedIds(prev =>
      checked ? new Set([...prev, ...visibleIds]) : new Set([...prev].filter(id => !visibleIds.has(id)))
    )
  }

  const handleBulkSubmit = async () => {
    // Basic implementation for bulk delete only for now in Roster
    if (bulkAction === 'delete') {
      if (!window.confirm(`Delete ${effectiveSelectedIds.size} artists?`)) return
      // Reuse logic from BandsTab bulk delete
      try {
        const res = await bandsApi.bulkDelete(Array.from(effectiveSelectedIds))
        if (res.success) {
          showToast(`Deleted ${effectiveSelectedIds.size} artists`, 'success')
          setSelectedIds(prev => new Set([...prev].filter(id => !effectiveSelectedIds.has(id))))
          loadBands()
        } else {
          showToast(res.error, 'error')
        }
      } catch (err) {
        showToast(err.message, 'error')
      }
    }
  }

  const updateColumnFilter = (key, value) => setColumnFilters(prev => ({ ...prev, [key]: value }))

  const clearColumnFilter = key =>
    setColumnFilters(prev => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })

  const toggleFilterPanel = key => setOpenFilterKey(prev => (prev === key ? null : key))

  // Renders the ColumnFilter/LinksColumnFilter panel for `key`, or nothing --
  // this is the conditional MOUNT that keeps the panels' unconditional
  // mousedown/keydown listeners from staying registered forever. Only ever
  // one of these returns non-null at a time, since they all key off the
  // single `openFilterKey` state.
  const renderColumnFilterPanel = (key, triggerRef) => {
    if (openFilterKey !== key) return null
    const panelId = `roster-filter-panel-${key}`
    const shared = { onClose: () => setOpenFilterKey(null), triggerRef, panelId }
    return (
      <div className="absolute right-0 z-30 mt-2">
        {key === 'link_count' ? (
          <LinksColumnFilter
            value={columnFilters.link_count ?? EMPTY_GAP_FILTER}
            counts={linkCountsFor(searchFiltered, columnFilters)}
            onChange={value => updateColumnFilter('link_count', value)}
            onClear={() => clearColumnFilter('link_count')}
            {...shared}
          />
        ) : (
          <ColumnFilter
            column={columnByKey(key)}
            counts={valueCountsFor(key, searchFiltered, columnFilters)}
            value={columnFilters[key]?.values}
            onChange={values => updateColumnFilter(key, { values })}
            onClear={() => clearColumnFilter(key)}
            {...shared}
          />
        )}
      </div>
    )
  }

  const columnChips = FILTERABLE_COLUMNS.filter(column => isColumnFiltered(columnFilters, column.key)).map(column => ({
    key: column.key,
    label: `${column.label}: ${summarizeColumnFilter(column, columnFilters[column.key])}`,
    remove: () => clearColumnFilter(column.key),
  }))

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
            className="min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-white/10 focus:border-accent-500 focus:outline-hidden w-64"
          />
          {!showAddForm && !editingId && !readOnly && (
            <button
              onClick={() => setShowAddForm(true)}
              className="px-6 py-3 min-h-[44px] bg-accent-500 text-bg-navy rounded hover:bg-accent-600 transition-colors font-medium"
            >
              + New Artist
            </button>
          )}
        </div>
      </div>

      {columnChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {columnChips.map(chip => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.remove}
              className="inline-flex items-center gap-2 rounded-full bg-accent-500/15 px-3 py-1 text-sm text-accent-300 hover:bg-accent-500/25"
              aria-label={`Remove filter: ${chip.label}`}
            >
              <span>{chip.label}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
          <span className="text-sm text-white/50">
            {filteredBands.length} {filteredBands.length === 1 ? 'artist' : 'artists'}
          </span>
        </div>
      )}

      {/* Bulk Actions */}
      {!readOnly && effectiveSelectedIds.size > 0 && (
        <div className="bg-bg-navy/80 p-4 rounded border border-accent-500/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sticky top-20 z-10 backdrop-blur-md">
          <span className="text-white font-medium">
            {effectiveSelectedIds.size} selected
            {hiddenSelectedCount > 0 && (
              <span className="ml-2 text-white/60">· {hiddenSelectedCount} hidden by filters</span>
            )}
          </span>
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
            conflicts={{ overlaps: [], conflicts: [] }}
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
                          checked={effectiveSelectedIds.size === filteredBands.length && filteredBands.length > 0}
                        />
                      </th>
                    )}
                    <th
                      aria-sort={ariaSortFor(sortConfig, 'name')}
                      className="relative px-4 py-3 text-left text-white font-semibold"
                    >
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSort('name')}
                          className="cursor-pointer hover:text-accent-400"
                        >
                          Name <SortIcon col="name" sortConfig={sortConfig} />
                        </button>
                        <FilterFunnel
                          label="Name"
                          active={isColumnFiltered(columnFilters, 'name')}
                          open={openFilterKey === 'name'}
                          panelId="roster-filter-panel-name"
                          triggerRef={nameFilterRef}
                          onClick={() => toggleFilterPanel('name')}
                        />
                      </div>
                      {renderColumnFilterPanel('name', nameFilterRef)}
                    </th>
                    <th
                      aria-sort={ariaSortFor(sortConfig, 'origin')}
                      className="relative px-4 py-3 text-left text-white font-semibold"
                    >
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSort('origin')}
                          className="cursor-pointer hover:text-accent-400"
                        >
                          Origin <SortIcon col="origin" sortConfig={sortConfig} />
                        </button>
                        <FilterFunnel
                          label="Origin"
                          active={isColumnFiltered(columnFilters, 'origin')}
                          open={openFilterKey === 'origin'}
                          panelId="roster-filter-panel-origin"
                          triggerRef={originFilterRef}
                          onClick={() => toggleFilterPanel('origin')}
                        />
                      </div>
                      {renderColumnFilterPanel('origin', originFilterRef)}
                    </th>
                    <th
                      aria-sort={ariaSortFor(sortConfig, 'genre')}
                      className="relative px-4 py-3 text-left text-white font-semibold"
                    >
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSort('genre')}
                          className="cursor-pointer hover:text-accent-400"
                        >
                          Genre <SortIcon col="genre" sortConfig={sortConfig} />
                        </button>
                        <FilterFunnel
                          label="Genre"
                          active={isColumnFiltered(columnFilters, 'genre')}
                          open={openFilterKey === 'genre'}
                          panelId="roster-filter-panel-genre"
                          triggerRef={genreFilterRef}
                          onClick={() => toggleFilterPanel('genre')}
                        />
                      </div>
                      {renderColumnFilterPanel('genre', genreFilterRef)}
                    </th>
                    <th
                      aria-sort={ariaSortFor(sortConfig, 'is_active')}
                      className="relative px-4 py-3 text-left text-white font-semibold"
                    >
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSort('is_active')}
                          className="cursor-pointer hover:text-accent-400"
                        >
                          Status <SortIcon col="is_active" sortConfig={sortConfig} />
                        </button>
                        <FilterFunnel
                          label="Status"
                          active={isColumnFiltered(columnFilters, 'is_active')}
                          open={openFilterKey === 'is_active'}
                          panelId="roster-filter-panel-is_active"
                          triggerRef={statusFilterRef}
                          onClick={() => toggleFilterPanel('is_active')}
                        />
                      </div>
                      {renderColumnFilterPanel('is_active', statusFilterRef)}
                    </th>
                    <th
                      aria-sort={ariaSortFor(sortConfig, 'link_count')}
                      className="relative px-4 py-3 text-left text-white font-semibold"
                    >
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSort('link_count')}
                          className="cursor-pointer hover:text-accent-400"
                        >
                          Links <SortIcon col="link_count" sortConfig={sortConfig} />
                        </button>
                        <FilterFunnel
                          label="Links"
                          active={isColumnFiltered(columnFilters, 'link_count')}
                          open={openFilterKey === 'link_count'}
                          panelId="roster-filter-panel-link_count"
                          triggerRef={linksFilterRef}
                          onClick={() => toggleFilterPanel('link_count')}
                        />
                      </div>
                      {renderColumnFilterPanel('link_count', linksFilterRef)}
                    </th>
                    <th
                      aria-sort={ariaSortFor(sortConfig, 'contact_email')}
                      className="relative px-4 py-3 text-left text-white font-semibold"
                    >
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSort('contact_email')}
                          className="cursor-pointer hover:text-accent-400"
                        >
                          Contact <SortIcon col="contact_email" sortConfig={sortConfig} />
                        </button>
                        <FilterFunnel
                          label="Contact"
                          active={isColumnFiltered(columnFilters, 'contact_email')}
                          open={openFilterKey === 'contact_email'}
                          panelId="roster-filter-panel-contact_email"
                          triggerRef={contactFilterRef}
                          onClick={() => toggleFilterPanel('contact_email')}
                        />
                      </div>
                      {renderColumnFilterPanel('contact_email', contactFilterRef)}
                    </th>
                    <th
                      aria-sort={ariaSortFor(sortConfig, 'follower_count')}
                      className="relative px-4 py-3 text-right text-white font-semibold"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleSort('follower_count')}
                          className="cursor-pointer hover:text-accent-400"
                        >
                          Followers <SortIcon col="follower_count" sortConfig={sortConfig} />
                        </button>
                        <FilterFunnel
                          label="Followers"
                          active={isColumnFiltered(columnFilters, 'follower_count')}
                          open={openFilterKey === 'follower_count'}
                          panelId="roster-filter-panel-follower_count"
                          triggerRef={followersFilterRef}
                          onClick={() => toggleFilterPanel('follower_count')}
                        />
                      </div>
                      {renderColumnFilterPanel('follower_count', followersFilterRef)}
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
                        <div className="flex items-center gap-2">
                          <a
                            href={`/band/${band.band_profile_id || band.id?.toString().replace('profile_', '')}`}
                            className="text-accent-400 hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {band.name}
                          </a>
                          {isInactive(band) && <InactiveBadge />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/70">{formatOrigin(band) || '-'}</td>
                      <td className="px-4 py-3 text-white/70">{band.genre || '-'}</td>
                      <td className="px-4 py-3 text-white/70">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                            isInactive(band) ? 'bg-gray-700 text-white/80' : 'bg-emerald-600/20 text-emerald-200'
                          }`}
                        >
                          {isInactive(band) ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <SocialLinksIcons band={band} />
                      </td>
                      <td className="px-4 py-3 text-white/70">{band.contact_email || '-'}</td>
                      <td className="px-4 py-3 text-right text-white/70">
                        {band.follower_count > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-accent-500/15 px-2 py-1 text-xs font-semibold text-accent-300">
                            {band.follower_count}
                          </span>
                        ) : (
                          <span className="text-white/30">0</span>
                        )}
                      </td>
                      {!readOnly && (
                        <td className="px-4 py-3 flex justify-end gap-2">
                          <button
                            onClick={() => startEdit(band)}
                            className="px-4 py-2 min-h-[44px] bg-amber-700 hover:bg-amber-800 text-white rounded text-sm"
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
                      checked={effectiveSelectedIds.size === filteredBands.length && filteredBands.length > 0}
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
                      {isInactive(band) && <InactiveBadge />}
                    </label>
                  </div>
                  <div className="text-sm text-text-secondary space-y-1">
                    <div>Origin: {formatOrigin(band) || '-'}</div>
                    <div>Genre: {band.genre || '-'}</div>
                    <div>Status: {isInactive(band) ? 'Inactive' : 'Active'}</div>
                    <div className="flex items-center gap-2">
                      <span>Links:</span>
                      <SocialLinksIcons band={band} />
                    </div>
                    <div>Contact: {band.contact_email || '-'}</div>
                    <div>Followers: {band.follower_count ?? 0}</div>
                  </div>
                  {!readOnly && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => startEdit(band)}
                        className="px-4 py-2 min-h-[44px] bg-amber-700 hover:bg-amber-800 text-white rounded text-sm"
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

        <button
          onClick={() => setMobileFilterSheetOpen(true)}
          className="md:hidden w-full px-4 py-3 flex items-center justify-center gap-2 text-white bg-bg-navy hover:bg-bg-purple transition-colors min-h-[44px] font-medium border-t border-accent-500/10"
        >
          Filters
          {activeFilterCount(columnFilters) > 0 && (
            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-accent-500 text-bg-navy text-xs font-bold">
              {activeFilterCount(columnFilters)}
            </span>
          )}
        </button>

        <MobileFilterSheet
          isOpen={mobileFilterSheetOpen}
          onClose={() => setMobileFilterSheetOpen(false)}
          columnFilters={columnFilters}
          setColumnFilters={setColumnFilters}
          searchFiltered={searchFiltered}
        />
      </div>
    </div>
  )
}
