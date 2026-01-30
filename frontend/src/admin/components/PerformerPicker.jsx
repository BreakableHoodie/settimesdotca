import React, { useState, useMemo, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'

export default function ArtistPicker({ artists, onSelect, onCancel }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    // Focus input on mount using ref instead of autoFocus prop
    inputRef.current?.focus()
  }, [])

  // Deduplicate artists just in case, though the API should handle it
  const uniqueArtists = useMemo(() => {
    const map = new Map()
    artists.forEach(a => {
      // Use ID if available, otherwise name as key
      const key = a.id || a.name
      if (!map.has(key)) {
        map.set(key, a)
      }
    })
    return Array.from(map.values())
  }, [artists])

  const filtered = useMemo(() => {
    if (!query) return uniqueArtists.slice(0, 10) // Show top 10 initially
    const lower = query.toLowerCase()
    return uniqueArtists.filter(a => a.name.toLowerCase().includes(lower))
  }, [query, uniqueArtists])

  return (
    <div className="bg-band-purple p-6 rounded-lg border border-band-orange/20 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-bold text-white">Add to Lineup</h3>
          <p className="text-white/60 text-sm">
            Search the Global Artist Roster to add an existing artist, or create a new one.
          </p>
        </div>
        <button onClick={onCancel} className="text-white/40 hover:text-white">
          ✕
        </button>
      </div>

      <input
        ref={inputRef}
        type="text"
        placeholder="Search for an artist..."
        className="w-full min-h-[44px] px-4 py-3 bg-band-navy border border-white/20 rounded text-white focus:border-band-orange focus:outline-none text-lg"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />

      <div className="max-h-60 overflow-y-auto border border-white/10 rounded bg-black/20">
        {filtered.map(artist => (
          <button
            key={artist.id || artist.name}
            onClick={() => onSelect(artist)}
            className="w-full text-left p-3 hover:bg-white/10 cursor-pointer flex justify-between items-center transition-colors border-b border-white/5 last:border-0"
          >
            <div className="flex items-center gap-3">
              {artist.photo_url ? (
                <img src={artist.photo_url} alt="" className="w-10 h-10 rounded-full object-cover bg-white/10" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-band-orange/20 flex items-center justify-center text-band-orange font-bold">
                  {artist.name.charAt(0)}
                </div>
              )}
              <div>
                <div className="font-bold text-white">{artist.name}</div>
                <div className="text-xs text-white/60">{[artist.origin, artist.genre].filter(Boolean).join(' • ')}</div>
              </div>
            </div>
            <span className="px-3 py-1 bg-band-navy border border-band-orange/30 text-band-orange rounded text-xs uppercase font-medium">
              Select
            </span>
          </button>
        ))}
        {filtered.length === 0 && query && (
          <div className="p-8 text-center">
            <p className="text-white/50 mb-4">No artist found named &quot;{query}&quot;</p>
            <button
              onClick={() => onSelect(null, query)} // Pass query as name for new artist
              className="min-h-[44px] px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600 transition"
            >
              + Create &quot;{query}&quot;
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2 border-t border-white/10">
        <button onClick={() => onSelect(null)} className="text-band-orange hover:text-orange-400 text-sm font-medium">
          + Create New Artist manually
        </button>
      </div>
    </div>
  )
}

ArtistPicker.propTypes = {
  artists: PropTypes.array.isRequired,
  onSelect: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
}
