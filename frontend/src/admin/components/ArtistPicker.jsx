import React, { useState, useMemo, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'

export default function ArtistPicker({ artists, onSelect, onBulkSelect, onCancel, loading = false, venues = [] }) {
  const [query, setQuery] = useState('')
  const [checkedIds, setCheckedIds] = useState(new Set())
  const [bulkVenueId, setBulkVenueId] = useState('')
  const [bulkStartTime, setBulkStartTime] = useState('')
  const [bulkEndTime, setBulkEndTime] = useState('')
  const inputRef = useRef(null)

  const formatOrigin = artist =>
    [artist.origin_city, artist.origin_region].filter(Boolean).join(', ') || artist.origin || ''

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const uniqueArtists = useMemo(() => {
    const map = new Map()
    artists.forEach(a => {
      const key = a.band_profile_id || a.id || a.name
      if (!map.has(key)) map.set(key, a)
    })
    return Array.from(map.values())
  }, [artists])

  const filtered = useMemo(() => {
    if (!query) return uniqueArtists.slice(0, 50)
    const lower = query.toLowerCase()
    return uniqueArtists.filter(a => a.name.toLowerCase().includes(lower))
  }, [query, uniqueArtists])

  const toggleCheck = (id, e) => {
    e.stopPropagation()
    setCheckedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBulkAdd = () => {
    if (!checkedIds.size) return
    const selected = uniqueArtists.filter(a => {
      const id = a.band_profile_id || a.id
      return checkedIds.has(id)
    })
    onBulkSelect(selected, bulkVenueId ? Number(bulkVenueId) : null, bulkStartTime || null, bulkEndTime || null)
  }

  const isBulkReady = checkedIds.size > 0

  return (
    <div className="bg-bg-purple p-6 rounded-lg border border-accent-500/20 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-bold text-white">Add to Lineup</h3>
          <p className="text-white/60 text-sm">Check multiple artists to bulk-add, or click Select for a single act.</p>
        </div>
        <button onClick={onCancel} className="text-white/40 hover:text-white">
          ✕
        </button>
      </div>

      <input
        ref={inputRef}
        type="text"
        placeholder="Search for an artist..."
        className="w-full min-h-[44px] px-4 py-3 bg-bg-navy border border-white/20 rounded text-white focus:border-accent-500 focus:outline-hidden text-lg"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />

      <div className="max-h-64 overflow-y-auto border border-white/10 rounded bg-black/20">
        {loading && artists.length === 0 && <div className="p-8 text-center text-white/50">Loading roster...</div>}
        {filtered.map(artist => {
          const id = artist.band_profile_id || artist.id
          const checked = checkedIds.has(id)
          return (
            <div
              key={id || artist.name}
              className={`flex items-center gap-3 p-3 border-b border-white/5 last:border-0 transition-colors ${
                checked ? 'bg-accent-500/10' : 'hover:bg-white/5'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={e => toggleCheck(id, e)}
                className="h-5 w-5 cursor-pointer shrink-0"
                aria-label={`Select ${artist.name}`}
              />
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {artist.photo_url ? (
                  <img
                    src={artist.photo_url}
                    alt=""
                    className="w-9 h-9 rounded-full object-cover bg-white/10 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-accent-500/20 flex items-center justify-center text-accent-400 font-bold shrink-0">
                    {artist.name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-bold text-white truncate">{artist.name}</div>
                  <div className="text-xs text-white/60 truncate">
                    {[formatOrigin(artist), artist.genre].filter(Boolean).join(' • ')}
                  </div>
                </div>
              </div>
              <button
                onClick={() => onSelect(artist)}
                className="shrink-0 px-3 py-1 bg-bg-navy border border-accent-500/30 text-accent-400 rounded text-xs uppercase font-medium hover:border-accent-500/60 transition-colors"
              >
                Select
              </button>
            </div>
          )
        })}
        {filtered.length === 0 && query && !loading && (
          <div className="p-8 text-center">
            <p className="text-white/50 mb-4">No artist found named &quot;{query}&quot;</p>
            <button
              onClick={() => onSelect(null, query)}
              className="min-h-[44px] px-4 py-2 bg-accent-500 text-white rounded hover:bg-accent-600 transition"
            >
              + Create &quot;{query}&quot;
            </button>
          </div>
        )}
      </div>

      {/* Bulk add bar — shown when 1+ artists are checked */}
      {checkedIds.size > 0 && (
        <div className="border border-accent-500/30 rounded-lg bg-accent-500/5 p-4 space-y-3">
          <p className="text-accent-300 font-semibold text-sm">
            {checkedIds.size} act{checkedIds.size !== 1 ? 's' : ''} selected — set shared venue and time (all optional):
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={bulkVenueId}
              onChange={e => setBulkVenueId(e.target.value)}
              className="flex-1 min-h-[44px] px-3 py-2 bg-bg-navy border border-white/20 rounded text-white focus:border-accent-500 focus:outline-hidden"
            >
              <option value="">Select venue (optional)...</option>
              {(venues || []).map(v => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={bulkStartTime}
              onChange={e => setBulkStartTime(e.target.value)}
              className="min-h-[44px] px-3 py-2 bg-bg-navy border border-white/20 rounded text-white focus:border-accent-500 focus:outline-hidden w-full sm:w-36"
              placeholder="Start (optional)"
              aria-label="Shared start time (optional)"
            />
            <input
              type="time"
              value={bulkEndTime}
              onChange={e => setBulkEndTime(e.target.value)}
              className="min-h-[44px] px-3 py-2 bg-bg-navy border border-white/20 rounded text-white focus:border-accent-500 focus:outline-hidden w-full sm:w-36"
              placeholder="End (optional)"
              aria-label="Shared end time (optional)"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setCheckedIds(new Set())}
              className="px-4 py-2 min-h-[44px] rounded text-white/60 hover:text-white transition-colors text-sm"
            >
              Clear selection
            </button>
            <button
              onClick={handleBulkAdd}
              disabled={!isBulkReady}
              className={`px-6 py-2 min-h-[44px] rounded font-semibold text-sm transition-colors ${
                isBulkReady
                  ? 'bg-accent-500 text-white hover:bg-accent-600'
                  : 'bg-white/10 text-white/30 cursor-not-allowed'
              }`}
            >
              Add {checkedIds.size} act{checkedIds.size !== 1 ? 's' : ''} to Lineup
            </button>
          </div>
        </div>
      )}

      {checkedIds.size === 0 && (
        <div className="flex justify-end pt-2 border-t border-white/10">
          <button onClick={() => onSelect(null)} className="text-accent-400 hover:text-accent-300 text-sm font-medium">
            + Create New Artist manually
          </button>
        </div>
      )}
    </div>
  )
}

ArtistPicker.propTypes = {
  artists: PropTypes.array.isRequired,
  onSelect: PropTypes.func.isRequired,
  onBulkSelect: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  venues: PropTypes.array,
  loading: PropTypes.bool,
}

