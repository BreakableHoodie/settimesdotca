import { faCheck, faCopy, faMusic } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { memo, useMemo, useState } from 'react'
import { copyToClipboard } from '../utils/clipboard'
import { formatTime, formatTimeRange } from '../utils/timeFormat'
import { filterPerformancesByTime } from '../utils/timeFilter'
import BandCard from './BandCard'

function ScheduleView({
  bands,
  selectedBands,
  onToggleBand,
  onSelectAll,
  currentTime,
  showPast,
  onToggleShowPast,
  timeFilter,
}) {
  const [copyAllLabel, setCopyAllLabel] = useState('Copy Full Schedule')
  const [isCopyingAll, setIsCopyingAll] = useState(false)
  const [venueFilter, setVenueFilter] = useState(null)
  const [genreFilter, setGenreFilter] = useState(null)
  const nowDate = currentTime instanceof Date ? currentTime : new Date(currentTime)
  const nowMs = nowDate.getTime()

  const finishedCount = bands.reduce((count, band) => {
    const bandEndMs = typeof band.endMs === 'number' ? band.endMs : Date.parse(`${band.date}T${band.endTime}:00`)
    return bandEndMs <= nowMs ? count + 1 : count
  }, 0)

  // First apply time filter, then apply showPast filter
  const timeFilteredBands = filterPerformancesByTime(bands, timeFilter)

  const visibleBands = showPast
    ? timeFilteredBands
    : timeFilteredBands.filter(band => {
        // If no endTime (TBD), always show the band
        if (!band.endTime || band.endTime === 'TBD') {
          return true
        }
        const bandEndMs = typeof band.endMs === 'number' ? band.endMs : Date.parse(`${band.date}T${band.endTime}:00`)
        return bandEndMs > nowMs
      })

  const uniqueVenues = useMemo(() => [...new Set(bands.map(b => b.venue))].sort(), [bands])
  const uniqueGenres = useMemo(() => [...new Set(bands.filter(b => b.genre).map(b => b.genre))].sort(), [bands])

  const filteredBands = visibleBands.filter(
    b => (!venueFilter || b.venue === venueFilter) && (!genreFilter || b.genre === genreFilter)
  )

  const sortedBands = [...filteredBands].sort((a, b) => {
    // TBD bands go to the end
    const aTBD = !a.startTime || a.startTime === 'TBD'
    const bTBD = !b.startTime || b.startTime === 'TBD'

    if (aTBD && !bTBD) return 1
    if (!aTBD && bTBD) return -1
    if (aTBD && bTBD) return a.name.localeCompare(b.name)

    // Normal time-based sorting
    const aTime = typeof a.startMs === 'number' ? a.startMs : Date.parse(`${a.date}T${a.startTime}:00`)
    const bTime = typeof b.startMs === 'number' ? b.startMs : Date.parse(`${b.date}T${b.startTime}:00`)
    if (aTime === bTime) {
      return a.venue.localeCompare(b.venue)
    }
    return aTime - bTime
  })

  // Helper function to group bands by time slot
  const groupByTime = bands => {
    const timeGroups = new Map()
    const grouped = []

    bands.forEach(band => {
      const slot = !band.startTime || band.startTime === 'TBD' ? 'TBD' : band.startTime
      if (!timeGroups.has(slot)) {
        const group = { time: slot, bands: [] }
        timeGroups.set(slot, group)
        grouped.push(group)
      }
      timeGroups.get(slot).bands.push(band)
    })

    grouped.forEach(group => {
      group.bands.sort((a, b) => a.venue.localeCompare(b.venue))
    })

    return grouped
  }

  // Categorize bands into Now Playing, Upcoming, and Past
  const nowPlaying = []
  const upcomingBands = []
  const pastBands = []

  sortedBands.forEach(band => {
    // TBD or missing times go to upcoming
    if (!band.startTime || band.startTime === 'TBD' || !band.startMs || !band.endMs) {
      upcomingBands.push(band)
      return
    }

    const startMs = band.startMs
    const endMs = band.endMs

    // Currently performing: started but not finished
    if (startMs <= nowMs && endMs > nowMs) {
      nowPlaying.push(band)
    }
    // Future performances
    else if (startMs > nowMs) {
      upcomingBands.push(band)
    }
    // Past performances
    else if (endMs <= nowMs) {
      pastBands.push(band)
    }
  })

  // Sort Now Playing by venue only (no time grouping)
  nowPlaying.sort((a, b) => a.venue.localeCompare(b.venue))

  // Group upcoming and past bands by time
  const upcomingByTime = groupByTime(upcomingBands)
  const pastByTime = groupByTime(pastBands).reverse() // Reverse chronological for past events

  const allSelected = bands.length > 0 && selectedBands.length === bands.length
  const hiddenFinished = !showPast ? finishedCount : 0
  const noVisibleBands = sortedBands.length === 0

  const copyBands = async bandsToCopy => {
    if (bandsToCopy.length === 0) return false
    const text = bandsToCopy
      .map(band => `${band.name} — ${formatTimeRange(band.startTime, band.endTime)} @ ${band.venue}`)
      .join('\n')
    return copyToClipboard(text)
  }

  const handleCopyAll = async () => {
    if (isCopyingAll) return
    setIsCopyingAll(true)
    const success = await copyBands(bands)
    if (success) {
      setCopyAllLabel('Copied!')
      setTimeout(() => {
        setCopyAllLabel('Copy Full Schedule')
        setIsCopyingAll(false)
      }, 2000)
    } else {
      setIsCopyingAll(false)
    }
  }

  return (
    <div className="py-6 space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1 text-center sm:text-left">
          <h2 className="text-2xl font-bold text-white text-center">Full Lineup</h2>
          {!showPast && hiddenFinished > 0 && (
            <p className="text-xs text-band-orange/80 mt-1 text-center sm:text-left">
              {hiddenFinished} finished {hiddenFinished === 1 ? 'set hidden' : 'sets hidden'}
            </p>
          )}
        </div>
        <div className="flex justify-center sm:justify-end gap-3 flex-wrap">
          {finishedCount > 0 && (
            <button
              onClick={onToggleShowPast}
              className={`text-xs px-3 py-1.5 min-h-[44px] rounded transition-transform duration-150 hover:brightness-110 active:scale-95 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-band-orange ${
                showPast
                  ? 'bg-band-orange/20 border-band-orange/50 text-band-orange hover:bg-band-orange/30'
                  : 'bg-band-purple/50 border-band-orange/50 text-band-orange hover:bg-band-purple'
              }`}
              title={showPast ? 'Hide finished sets' : 'Show finished sets'}
              aria-label={showPast ? 'Hide finished sets' : 'Show finished sets'}
            >
              {showPast ? 'Hide finished sets' : 'Show finished sets'}
            </button>
          )}
          <button
            onClick={handleCopyAll}
            className="text-xs px-3 py-1.5 min-h-[44px] rounded bg-band-purple/60 border border-band-purple/40 text-white flex items-center gap-2 transition-transform duration-150 hover:bg-band-purple/80 hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-band-orange"
            title={copyAllLabel === 'Copied!' ? 'Full schedule copied to clipboard' : 'Copy the full schedule'}
            aria-label="Copy the full schedule"
            disabled={isCopyingAll}
          >
            <FontAwesomeIcon icon={copyAllLabel === 'Copied!' ? faCheck : faCopy} aria-hidden="true" />
            <span className="transition-opacity duration-200 ease-in-out">{copyAllLabel}</span>
          </button>
          <button
            onClick={onSelectAll}
            disabled={allSelected}
            className={`text-xs px-3 py-1.5 min-h-[44px] rounded transition-transform duration-150 hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-band-orange ${
              allSelected
                ? 'bg-gray-500/20 border border-gray-500/50 text-gray-400 cursor-not-allowed'
                : 'bg-band-orange/20 border border-band-orange/50 text-band-orange hover:bg-band-orange/30'
            }`}
            title={allSelected ? 'All bands already selected' : 'Select all bands'}
          >
            {allSelected ? 'All Selected' : 'Select All'}
          </button>
        </div>
      </div>

      {/* Filter pills */}
      {(uniqueVenues.length > 1 || uniqueGenres.length > 0) && (
        <div className="space-y-3">
          {uniqueVenues.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40 uppercase tracking-wide shrink-0">Venue</span>
              <div className="overflow-x-auto flex gap-2 pb-1 -mb-1">
                {uniqueVenues.map(venue => (
                  <button
                    key={venue}
                    onClick={() => setVenueFilter(prev => (prev === venue ? null : venue))}
                    aria-pressed={venueFilter === venue}
                    className={`text-xs px-3 py-1.5 min-h-[44px] rounded-full border whitespace-nowrap transition-colors ${
                      venueFilter === venue
                        ? 'bg-accent-500/20 border-accent-500/50 text-accent-400'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {venue}
                  </button>
                ))}
              </div>
            </div>
          )}
          {uniqueGenres.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40 uppercase tracking-wide shrink-0">Genre</span>
              <div className="overflow-x-auto flex gap-2 pb-1 -mb-1">
                {uniqueGenres.map(genre => (
                  <button
                    key={genre}
                    onClick={() => setGenreFilter(prev => (prev === genre ? null : genre))}
                    aria-pressed={genreFilter === genre}
                    className={`text-xs px-3 py-1.5 min-h-[44px] rounded-full border whitespace-nowrap transition-colors ${
                      genreFilter === genre
                        ? 'bg-accent-500/20 border-accent-500/50 text-accent-400'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {noVisibleBands ? (
        <div className="text-center text-white/70 py-12">
          {showPast
            ? 'No bands in this lineup right now.'
            : finishedCount > 0
              ? 'All finished sets are hidden. Show them to revisit earlier performances.'
              : 'No upcoming bands at the moment.'}
        </div>
      ) : (
        <div className="space-y-12">
          {/* Now Playing Section */}
          {nowPlaying.length > 0 && (
            <div className="relative">
              <div className="flex items-center mb-4">
                <div className="bg-band-orange text-band-navy font-mono font-bold text-xl md:text-2xl px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-band-navy/60"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-band-navy"></span>
                  </span>
                  <FontAwesomeIcon icon={faMusic} aria-hidden="true" />
                  NOW PLAYING
                </div>
                <div className="flex-1 h-1 bg-band-orange ml-4"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 ml-0 sm:ml-4">
                {nowPlaying.map(band => (
                  <BandCard
                    key={band.id}
                    band={band}
                    isSelected={selectedBands.includes(band.id)}
                    onToggle={onToggleBand}
                    showVenue={true}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Section */}
          {upcomingByTime.length > 0 && (
            <div className="space-y-8">
              <div className="flex items-center mb-4">
                <div className="bg-band-purple text-white font-mono font-bold text-lg md:text-xl px-4 py-2 rounded-lg shadow-lg">
                  UPCOMING
                </div>
                <div className="flex-1 h-0.5 bg-band-purple/30 ml-4"></div>
              </div>
              {upcomingByTime.map(({ time, bands: timeBands }) => (
                <div key={time} className="relative ml-0 sm:ml-4">
                  <div className="flex items-center mb-4">
                    <div className="bg-band-navy text-white font-mono font-semibold text-base md:text-lg px-4 py-2 rounded-lg shadow">
                      {time === 'TBD' ? 'Time To Be Announced' : formatTime(time)}
                    </div>
                    <div className="flex-1 h-0.5 bg-band-navy/20 ml-4"></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 ml-0 sm:ml-4">
                    {timeBands.map(band => (
                      <BandCard
                        key={band.id}
                        band={band}
                        isSelected={selectedBands.includes(band.id)}
                        onToggle={onToggleBand}
                        showVenue={true}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Past Events Section (Collapsible) */}
          {pastByTime.length > 0 && showPast && (
            <div className="space-y-8">
              <div className="flex items-center mb-4">
                <div className="bg-white/10 text-white/40 font-mono font-bold text-lg md:text-xl px-4 py-2 rounded-lg shadow-lg">
                  PAST EVENTS
                </div>
                <div className="flex-1 h-0.5 bg-white/10 ml-4"></div>
              </div>
              {pastByTime.map(({ time, bands: timeBands }) => (
                <div key={time} className="relative ml-0 sm:ml-4 opacity-60">
                  <div className="flex items-center mb-4">
                    <div className="bg-white/5 text-white/30 font-mono font-semibold text-base md:text-lg px-4 py-2 rounded-lg shadow">
                      {time === 'TBD' ? 'Time To Be Announced' : formatTime(time)}
                    </div>
                    <div className="flex-1 h-0.5 bg-white/5 ml-4"></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 ml-0 sm:ml-4">
                    {timeBands.map(band => (
                      <BandCard
                        key={band.id}
                        band={band}
                        isSelected={selectedBands.includes(band.id)}
                        onToggle={onToggleBand}
                        showVenue={true}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default memo(ScheduleView)
