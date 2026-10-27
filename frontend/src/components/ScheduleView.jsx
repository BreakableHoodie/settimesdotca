import { Check, ChevronDown, Copy, Music } from 'lucide-react'
import { Fragment, memo, useMemo, useState } from 'react'
import { copyToClipboard } from '../utils/clipboard'
import { compareByName } from '../utils/sortableName'
import { dayNumberByDate, orderedFestivalDays, torontoWallClockMs } from '../utils/festivalDays'
import { formatTime, formatTimeRange } from '../utils/timeFormat'
import { UNSCHEDULED, currentTimeMs, deriveLineup } from '../utils/lineupFilter'
import { useFestivalDayFilter } from '../hooks/useFestivalDayFilter'
import { useIsNarrow } from '../hooks/useIsNarrow'
import BandCard from './BandCard'
import { DayDivider, DayTabs } from './ui'

const UNSCHEDULED_FILTER_VALUE = '__unscheduled__'

// Groups by (festival day, clock time) rather than bare clock time. `band.date`
// is already the set's festival day (see AFTER_MIDNIGHT_THRESHOLD_HOUR in
// festivalDays.js / prepareBands in bandUtils.js — after-midnight sets keep
// their *previous* evening's date). Without the day component, two sets at the same clock time
// on different festival days (e.g. both nights' 8 PM slot) would collapse into
// one bucket (#538). In the single-day case `date` is constant across every
// band, so the key degenerates to the old bare-time key and grouping is
// byte-identical to before.
export function groupByTime(bands) {
  const timeGroups = new Map()
  const grouped = []
  bands.forEach(band => {
    const slot = !band.startTime || band.startTime === 'TBD' ? 'TBD' : band.startTime
    const day = band.date ?? ''
    const key = `${day}|${slot}`
    if (!timeGroups.has(key)) {
      const group = { time: slot, date: band.date, bands: [] }
      timeGroups.set(key, group)
      grouped.push(group)
    }
    timeGroups.get(key).bands.push(band)
  })
  grouped.forEach(group => {
    group.bands.sort((a, b) => (a.venue ?? '').localeCompare(b.venue ?? ''))
  })
  return grouped
}

function ScheduleView({
  bands,
  selectedBands,
  onToggleBand,
  onSelectAll,
  currentTime,
  showPast,
  onToggleShowPast,
  timeFilter = 'all',
  venueFilter: controlledVenueFilter,
  onVenueFilterChange,
  genreFilter: controlledGenreFilter,
  groupBy: controlledGroupBy,
  // 'inline' draws the filter rows itself (the embed). 'external' means the
  // event page's single control row owns every filter, so none render here;
  // genreFilter/groupBy then come in as props, and copy/select-all follow the
  // lineup instead of sitting above it.
  controls = 'inline',
  showVenueFilter = true,
  eventSlug,
  doorsJson = null,
  eventStartDate = null,
  eventEndDate = null,
}) {
  const [justCopied, setJustCopied] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [isCopyingAll, setIsCopyingAll] = useState(false)
  const [localVenueFilter, setLocalVenueFilter] = useState(null)
  const [localGenreFilter, setLocalGenreFilter] = useState(null)
  const [localGroupBy, setLocalGroupBy] = useState('time')
  const isExternal = controls === 'external'
  const copyAllLabel = justCopied ? 'Copied!' : isExternal ? 'Copy this list' : 'Copy visible schedule'
  const venueFilter = controlledVenueFilter === undefined ? localVenueFilter : controlledVenueFilter
  const genreFilter = controlledGenreFilter === undefined ? localGenreFilter : controlledGenreFilter
  const groupBy = controlledGroupBy === undefined ? localGroupBy : controlledGroupBy
  const setGenreFilter = next => setLocalGenreFilter(next)
  const setGroupBy = next => setLocalGroupBy(next)
  const nowMs = useMemo(() => currentTimeMs(currentTime), [currentTime])

  // Day-divider support (#541): numbering/gate derive from the full incoming
  // `bands` set (not the filtered/split subsets below) so day numbers stay
  // consistent across the Upcoming and Past sections and across filter changes.
  const dayNumberByDateMap = useMemo(() => dayNumberByDate(bands), [bands])
  const festivalDays = useMemo(() => orderedFestivalDays(bands), [bands])

  // Day-tab filter (#542 PR-3): a hard FILTER, not a scroll-anchor — exactly
  // one festival day's performances render at a time once an event spans
  // more than one day. `hasDayTabs`/`activeDate` derive from the full
  // `bands` (same array as the divider numbering above) so both stay in
  // sync as the day-tab selection changes.
  const {
    isMultiDay: hasDayTabs,
    activeDayNumber,
    activeDate,
    setActiveDayNumber,
  } = useFestivalDayFilter(festivalDays, { currentTime, startDate: eventStartDate, endDate: eventEndDate })

  // The filter chain is shared with the event page's filter panel (see
  // deriveLineup), so the "Show N sets" button and this list cannot disagree.
  const {
    dayFilteredBands,
    genres: uniqueGenres,
    finishedCount,
    visibleBands,
  } = useMemo(
    () =>
      deriveLineup(bands, {
        activeDate: hasDayTabs ? activeDate : null,
        timeFilter,
        venueFilter,
        genreFilter,
        showPast,
        nowMs,
      }),
    [bands, hasDayTabs, activeDate, timeFilter, venueFilter, genreFilter, showPast, nowMs]
  )

  const uniqueVenues = useMemo(
    () => [...new Set(dayFilteredBands.map(b => b.venue).filter(Boolean))].sort(),
    [dayFilteredBands]
  )
  const hasUnscheduled = useMemo(() => dayFilteredBands.some(b => !b.venue), [dayFilteredBands])

  const sortedBands = useMemo(
    () =>
      [...visibleBands].sort((a, b) => {
        const aTBD = !a.startTime || a.startTime === 'TBD'
        const bTBD = !b.startTime || b.startTime === 'TBD'
        if (aTBD && !bTBD) return 1
        if (!aTBD && bTBD) return -1
        if (aTBD && bTBD) return compareByName(a, b)
        const aTime = typeof a.startMs === 'number' ? a.startMs : torontoWallClockMs(a.date, a.startTime)
        const bTime = typeof b.startMs === 'number' ? b.startMs : torontoWallClockMs(b.date, b.startTime)
        return aTime === bTime ? (a.venue ?? '').localeCompare(b.venue ?? '') : aTime - bTime
      }),
    [visibleBands]
  )

  const { nowPlaying, upcomingBands, pastBands } = useMemo(() => {
    const nowPlaying = []
    const upcomingBands = []
    const pastBands = []
    sortedBands.forEach(band => {
      if (!band.startTime || band.startTime === 'TBD' || !band.startMs || !band.endMs) {
        upcomingBands.push(band)
        return
      }
      if (band.startMs <= nowMs && band.endMs > nowMs) {
        nowPlaying.push(band)
      } else if (band.startMs > nowMs) {
        upcomingBands.push(band)
      } else {
        pastBands.push(band)
      }
    })
    nowPlaying.sort((a, b) => (a.venue ?? '').localeCompare(b.venue ?? ''))
    return { nowPlaying, upcomingBands, pastBands }
  }, [sortedBands, nowMs])

  const upcomingByTime = useMemo(() => groupByTime(upcomingBands), [upcomingBands])
  const pastByTime = useMemo(() => groupByTime(pastBands).reverse(), [pastBands])

  // One presentation at a time -- see useIsNarrow for why this is not CSS.
  const isNarrow = useIsNarrow()

  // Venue-lane view: group the visible (already time-sorted) bands by venue, so
  // each venue's sets stay in chronological order within its section.
  const bandsByVenue = useMemo(() => {
    const map = new Map()
    sortedBands.forEach(band => {
      const venue = band.venue || 'Unscheduled'
      if (!map.has(venue)) map.set(venue, [])
      map.get(venue).push(band)
    })
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [sortedBands])

  const selectedBandsSet = useMemo(() => new Set(selectedBands), [selectedBands])
  // A cancelled set stays on screen (struck through) but can never be added
  // (#732), so "Add all" counts and adds only the sets a fan can actually pick.
  const selectableBands = useMemo(() => visibleBands.filter(band => !band.is_cancelled), [visibleBands])
  const visibleBandIds = useMemo(() => selectableBands.map(band => band.id), [selectableBands])
  const canToggleBands = typeof onToggleBand === 'function'
  const canTogglePast = typeof onToggleShowPast === 'function'
  const canSelectAll = typeof onSelectAll === 'function' && selectableBands.length > 0

  const allSelected = visibleBandIds.length > 0 && visibleBandIds.every(id => selectedBandsSet.has(id))
  const canCopyVisible = sortedBands.length > 0
  const hiddenFinished = !showPast ? finishedCount : 0
  const noVisibleBands = sortedBands.length === 0

  const copyBands = async bandsToCopy => {
    if (bandsToCopy.length === 0) return false
    const text = bandsToCopy
      .map(band => {
        const venuePart = band.venue ? ` @ ${band.venue}` : ''
        return `${band.name} — ${formatTimeRange(band.startTime, band.endTime)}${venuePart}`
      })
      .join('\n')
    return copyToClipboard(text)
  }

  const handleCopyAll = async () => {
    if (isCopyingAll || !canCopyVisible) return
    setIsCopyingAll(true)
    const success = await copyBands(sortedBands)
    if (success) {
      setJustCopied(true)
      setTimeout(() => {
        setJustCopied(false)
        setIsCopyingAll(false)
      }, 2000)
    } else {
      setIsCopyingAll(false)
    }
  }

  const handleSelectAll = () => {
    if (!canSelectAll) return
    onSelectAll(selectableBands)
  }

  const handleVenueFilterToggle = nextVenue => {
    const nextValue = venueFilter === nextVenue ? null : nextVenue
    if (typeof onVenueFilterChange === 'function') {
      onVenueFilterChange(nextValue)
      return
    }
    setLocalVenueFilter(nextValue)
  }

  const handleVenueSelectChange = event => {
    const nextValue = event.target.value
    if (nextValue === '') {
      handleVenueFilterToggle(venueFilter)
      return
    }

    handleVenueFilterToggle(nextValue === UNSCHEDULED_FILTER_VALUE ? UNSCHEDULED : nextValue)
  }

  return (
    <div className="py-2 space-y-3 sm:py-6 sm:space-y-8">
      {isExternal ? (
        // The sticky control row owns the visible heading space; this still
        // names the region for a screen reader.
        <h2 className="sr-only">Full lineup</h2>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1 text-center sm:text-left">
            {/* Kept in the a11y tree at every width -- it names this region for a
              screen reader. Hidden VISUALLY on mobile only, where it costs ~56px
              directly above the lineup while saying less than the "UPCOMING"
              heading immediately below it and the "Lineup" tab above it. */}
            <h2 className="sr-only sm:not-sr-only text-2xl font-bold text-text-primary text-center">Full lineup</h2>
            {!showPast && hiddenFinished > 0 && (
              <p className="text-xs text-accent-400/80 mt-1 text-center sm:text-left">
                {hiddenFinished} finished {hiddenFinished === 1 ? 'set hidden' : 'sets hidden'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div
              className="inline-flex items-center rounded-lg border border-border bg-surface p-0.5"
              role="group"
              aria-label="Group lineup by"
            >
              {['time', 'venue'].map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setGroupBy(mode)}
                  aria-pressed={groupBy === mode}
                  className={`min-h-[44px] rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
                    groupBy === mode ? 'bg-accent-500/20 text-accent-400' : 'text-text-tertiary hover:text-text-primary'
                  }`}
                >
                  By {mode}
                </button>
              ))}
            </div>
            {finishedCount > 0 && canTogglePast && (
              <button
                onClick={onToggleShowPast}
                className={`text-xs px-3 py-1.5 min-h-[44px] rounded transition-transform duration-150 hover:brightness-110 active:scale-95 border focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-400 ${
                  showPast
                    ? 'bg-accent-500/20 border-accent-500/50 text-accent-400 hover:bg-accent-500/30'
                    : 'bg-bg-purple/50 border-accent-500/50 text-accent-400 hover:bg-bg-purple'
                }`}
                title={showPast ? 'Hide finished sets' : 'Show finished sets'}
                aria-label={showPast ? 'Hide finished sets' : 'Show finished sets'}
              >
                {showPast ? 'Hide finished sets' : 'Show finished sets'}
              </button>
            )}
            <div className="relative">
              {/* Deliberately NOT a <details>. A closed <details> is supposed to hide
                its non-summary children, but measured here at 390px it did not:
                details.open was false while Select All still occupied 62px above
                the fold, so the disclosure read as closed and cost the space
                anyway. Conditional rendering has no UA-behaviour dependency and
                is assertable in a test. */}
              <button
                type="button"
                onClick={() => setMoreOpen(open => !open)}
                aria-expanded={moreOpen}
                className="text-xs px-3 py-1.5 min-h-[44px] rounded border border-border bg-surface text-text-tertiary cursor-pointer hover:text-text-primary hover:bg-surface-hover list-none flex items-center gap-1 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                <ChevronDown size={12} aria-hidden="true" />
                More
              </button>
              {moreOpen && (
                <div className="absolute right-0 z-10 mt-1 flex gap-2 rounded-lg border border-border bg-surface p-2 shadow-lg">
                  <button
                    onClick={handleCopyAll}
                    className={`text-xs px-3 py-1.5 min-h-[44px] rounded border text-text-primary flex items-center gap-2 transition-transform duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-400 ${
                      canCopyVisible
                        ? 'bg-bg-purple/60 border-bg-purple/40 hover:bg-bg-purple/80 hover:brightness-110 active:scale-95'
                        : 'bg-surface border-border text-text-tertiary cursor-not-allowed'
                    }`}
                    title={
                      !canCopyVisible
                        ? 'No visible bands to copy'
                        : copyAllLabel === 'Copied!'
                          ? 'Visible schedule copied to clipboard'
                          : 'Copy the visible schedule'
                    }
                    disabled={isCopyingAll || !canCopyVisible}
                  >
                    {copyAllLabel === 'Copied!' ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <Copy size={14} aria-hidden="true" />
                    )}
                    <span className="transition-opacity duration-200 ease-in-out">{copyAllLabel}</span>
                  </button>
                  {canSelectAll && (
                    <button
                      onClick={handleSelectAll}
                      disabled={allSelected}
                      className={`text-xs px-3 py-1.5 min-h-[44px] rounded transition-transform duration-150 hover:brightness-110 active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-400 ${
                        allSelected
                          ? 'bg-gray-500/20 border border-gray-500/50 text-text-disabled cursor-not-allowed'
                          : 'bg-accent-500/20 border border-accent-500/50 text-accent-400 hover:bg-accent-500/30'
                      }`}
                      title={allSelected ? 'All visible bands already selected' : 'Select all visible bands'}
                    >
                      {allSelected ? 'All selected' : 'Select all'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Day-tab filter (#542 PR-3): a hard FILTER — selecting a day renders
          ONLY that day's performances, never "all days" merged. Gated on
          hasDayTabs so single-day events render nothing here (repo
          invariant: no lone "Day 1" control). */}
      {hasDayTabs && (
        <div className="flex justify-center sm:justify-start">
          <DayTabs days={festivalDays} activeDayNumber={activeDayNumber} onSelectDay={setActiveDayNumber} />
        </div>
      )}

      {/* Filter pills */}
      {!isExternal &&
        (showVenueFilter || uniqueGenres.length > 0) &&
        (uniqueVenues.length > 1 || uniqueGenres.length > 0 || hasUnscheduled) && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:hidden">
              {showVenueFilter && (uniqueVenues.length > 1 || hasUnscheduled) && (
                <div className="space-y-1.5">
                  <label htmlFor="schedule-venue-filter" className="sr-only">
                    Venue filter
                  </label>
                  <select
                    id="schedule-venue-filter"
                    value={venueFilter === UNSCHEDULED ? UNSCHEDULED_FILTER_VALUE : venueFilter || ''}
                    onChange={handleVenueSelectChange}
                    className="min-h-[44px] w-full rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary focus:border-accent-500 focus:outline-hidden"
                  >
                    <option value="">All venues</option>
                    {uniqueVenues.map(venue => (
                      <option key={venue} value={venue}>
                        {venue}
                      </option>
                    ))}
                    {hasUnscheduled && <option value={UNSCHEDULED_FILTER_VALUE}>Unscheduled</option>}
                  </select>
                </div>
              )}

              {uniqueGenres.length > 0 && (
                <div className="space-y-1.5">
                  <label htmlFor="schedule-genre-filter" className="sr-only">
                    Genre filter
                  </label>
                  <select
                    id="schedule-genre-filter"
                    value={genreFilter || ''}
                    onChange={event => setGenreFilter(event.target.value || null)}
                    className="min-h-[44px] w-full rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary focus:border-accent-500 focus:outline-hidden"
                  >
                    <option value="">All genres</option>
                    {uniqueGenres.map(genre => (
                      <option key={genre} value={genre}>
                        {genre}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {showVenueFilter && (uniqueVenues.length > 1 || hasUnscheduled) && (
              <div className="hidden items-center gap-2 sm:flex">
                <span className="text-xs text-text-tertiary uppercase tracking-wide shrink-0">Venue</span>
                <div className="overflow-x-auto flex gap-2 pb-1 -mb-1">
                  {uniqueVenues.map(venue => (
                    <button
                      key={venue}
                      onClick={() => handleVenueFilterToggle(venue)}
                      aria-pressed={venueFilter === venue}
                      className={`text-xs px-3 py-1.5 min-h-[44px] rounded-md border whitespace-nowrap transition-colors ${
                        venueFilter === venue
                          ? 'bg-accent-500/20 border-accent-500/50 text-accent-400'
                          : 'bg-surface border-border text-text-tertiary hover:bg-surface-hover'
                      }`}
                    >
                      {venue}
                    </button>
                  ))}
                  {hasUnscheduled && (
                    <button
                      onClick={() => handleVenueFilterToggle(UNSCHEDULED)}
                      aria-pressed={venueFilter === UNSCHEDULED}
                      className={`text-xs px-3 py-1.5 min-h-[44px] rounded-md border whitespace-nowrap transition-colors ${
                        venueFilter === UNSCHEDULED
                          ? 'bg-accent-500/20 border-accent-500/50 text-accent-400'
                          : 'bg-surface border-border text-text-tertiary hover:bg-surface-hover'
                      }`}
                    >
                      Unscheduled
                    </button>
                  )}
                </div>
              </div>
            )}
            {uniqueGenres.length > 0 && (
              <div className="hidden items-center gap-2 sm:flex">
                <span className="text-xs text-text-tertiary uppercase tracking-wide shrink-0">Genre</span>
                <div className="overflow-x-auto flex gap-2 pb-1 -mb-1">
                  {uniqueGenres.map(genre => (
                    <button
                      key={genre}
                      onClick={() => setGenreFilter(genreFilter === genre ? null : genre)}
                      aria-pressed={genreFilter === genre}
                      className={`text-xs px-3 py-1.5 min-h-[44px] rounded-md border whitespace-nowrap transition-colors ${
                        genreFilter === genre
                          ? 'bg-accent-500/20 border-accent-500/50 text-accent-400'
                          : 'bg-surface border-border text-text-tertiary hover:bg-surface-hover'
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
        <div className="text-center text-text-secondary py-12">
          {showPast
            ? 'No bands in this lineup right now.'
            : finishedCount > 0
              ? 'All finished sets are hidden. Show them to revisit earlier performances.'
              : 'No upcoming bands at the moment.'}
        </div>
      ) : groupBy === 'venue' ? (
        <div className="space-y-12">
          {bandsByVenue.map(([venue, venueBands]) => (
            <div key={venue}>
              <div className="flex items-center mb-4">
                <h2 className="bg-bg-purple text-text-primary font-mono font-bold text-lg md:text-xl px-4 py-2 rounded-lg shadow-lg">
                  {venue}
                </h2>
                <span className="ml-3 text-xs text-text-tertiary shrink-0">
                  {venueBands.length} {venueBands.length === 1 ? 'set' : 'sets'}
                </span>
                <div className="flex-1 h-0.5 bg-bg-purple/30 ml-4"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 ml-0 sm:ml-4">
                {venueBands.map(band => (
                  <BandCard
                    key={band.id}
                    band={band}
                    isSelected={selectedBandsSet.has(band.id)}
                    onToggle={onToggleBand}
                    showToggleButton={canToggleBands}
                    eventSlug={eventSlug}
                    showVenue={false}
                    currentTime={currentTime}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-12">
          {/* Now Playing Section */}
          {nowPlaying.length > 0 && (
            <div className="relative">
              <div className="hidden sm:flex items-center mb-4">
                <h2 className="bg-accent-500 text-bg-navy font-mono font-bold text-xl md:text-2xl px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
                  <span className="relative flex h-3 w-3" aria-hidden="true">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-bg-navy/60"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-bg-navy"></span>
                  </span>
                  <Music size={16} aria-hidden="true" />
                  NOW PLAYING
                </h2>
                <div className="flex-1 h-1 bg-accent-500 ml-4"></div>
              </div>
              <div className="flex flex-col ml-0 sm:mb-4 sm:ml-4 sm:grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 sm:gap-6">
                {nowPlaying.map(band => (
                  <BandCard
                    variant={isNarrow ? 'board' : 'card'}
                    boardVenue={isNarrow}
                    key={band.id}
                    band={band}
                    isSelected={selectedBandsSet.has(band.id)}
                    onToggle={onToggleBand}
                    showToggleButton={canToggleBands}
                    eventSlug={eventSlug}
                    showVenue={true}
                    currentTime={currentTime}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Section */}
          {upcomingByTime.length > 0 && (
            <div className="space-y-1 sm:space-y-8">
              {isExternal ? (
                // "Later" exists only to separate this list from a Now Playing
                // section above it; with nothing playing it labels the whole
                // lineup, which the page already names.
                nowPlaying.length > 0 && (
                  <div className="flex items-center mb-1 sm:mb-4">
                    <h2 className="text-base font-semibold text-text-secondary">Later</h2>
                    <div className="flex-1 h-0.5 bg-bg-purple/30 ml-4"></div>
                  </div>
                )
              ) : (
                <>
                  {/* Compact on mobile: this heading sat directly above the lineup
                  costing ~60px with its margin. It still earns its place -- it is
                  what separates UPCOMING from a NOW PLAYING section when one
                  exists -- so it is shrunk rather than hidden. Desktop unchanged. */}
                  <div className="flex items-center mb-1 sm:mb-4">
                    <h2 className="bg-bg-purple text-text-primary font-mono font-bold text-xs px-2 py-0.5 sm:text-lg md:text-xl sm:px-4 sm:py-2 rounded-lg shadow-lg">
                      UPCOMING
                    </h2>
                    <div className="flex-1 h-0.5 bg-bg-purple/30 ml-4"></div>
                  </div>
                </>
              )}
              {upcomingByTime.map(({ time, date, bands: timeBands }, idx) => {
                const previousDate = idx > 0 ? upcomingByTime[idx - 1].date : undefined
                const showDayDivider = hasDayTabs && date !== previousDate
                return (
                  <Fragment key={`${date ?? ''}-${time}`}>
                    {showDayDivider && (
                      <DayDivider date={date} dayNumber={dayNumberByDateMap.get(date)} doorsJson={doorsJson} />
                    )}
                    <div className="relative ml-0 sm:ml-4">
                      <div className="hidden sm:flex items-center mb-4">
                        <h3 className="bg-bg-navy text-text-primary font-mono font-semibold text-base md:text-lg px-4 py-2 rounded-lg shadow">
                          {time === 'TBD' ? 'Time to be announced' : formatTime(time)}
                        </h3>
                        <div className="flex-1 h-0.5 bg-bg-navy/20 ml-4"></div>
                      </div>
                      <div className="flex flex-col ml-0 sm:mb-4 sm:ml-4 sm:grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 sm:gap-6">
                        {timeBands.map(band => (
                          <BandCard
                            variant={isNarrow ? 'board' : 'card'}
                            boardVenue={isNarrow}
                            key={band.id}
                            band={band}
                            isSelected={selectedBandsSet.has(band.id)}
                            onToggle={onToggleBand}
                            showToggleButton={canToggleBands}
                            eventSlug={eventSlug}
                            showVenue={true}
                            currentTime={currentTime}
                          />
                        ))}
                      </div>
                    </div>
                  </Fragment>
                )
              })}
            </div>
          )}

          {/* Past Events Section (Collapsible) */}
          {pastByTime.length > 0 && showPast && (
            <div className="space-y-1 sm:space-y-8">
              <div className="hidden sm:flex items-center mb-4">
                <h2 className="bg-surface text-text-tertiary font-mono font-bold text-lg md:text-xl px-4 py-2 rounded-lg shadow-lg">
                  PAST EVENTS
                </h2>
                <div className="flex-1 h-0.5 bg-surface ml-4"></div>
              </div>
              {pastByTime.map(({ time, date, bands: timeBands }, idx) => {
                const previousDate = idx > 0 ? pastByTime[idx - 1].date : undefined
                const showDayDivider = hasDayTabs && date !== previousDate
                return (
                  <Fragment key={`${date ?? ''}-${time}`}>
                    {showDayDivider && (
                      <DayDivider date={date} dayNumber={dayNumberByDateMap.get(date)} doorsJson={doorsJson} />
                    )}
                    <div className="relative ml-0 sm:ml-4 opacity-60">
                      <div className="hidden sm:flex items-center mb-4">
                        <h3 className="bg-surface text-text-tertiary font-mono font-semibold text-base md:text-lg px-4 py-2 rounded-lg shadow">
                          {time === 'TBD' ? 'Time to be announced' : formatTime(time)}
                        </h3>
                        <div className="flex-1 h-0.5 bg-surface ml-4"></div>
                      </div>
                      <div className="flex flex-col ml-0 sm:mb-4 sm:ml-4 sm:grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 sm:gap-6">
                        {timeBands.map(band => (
                          <BandCard
                            variant={isNarrow ? 'board' : 'card'}
                            boardVenue={isNarrow}
                            key={band.id}
                            band={band}
                            isSelected={selectedBandsSet.has(band.id)}
                            onToggle={onToggleBand}
                            showToggleButton={canToggleBands}
                            eventSlug={eventSlug}
                            showVenue={true}
                            currentTime={currentTime}
                          />
                        ))}
                      </div>
                    </div>
                  </Fragment>
                )
              })}
            </div>
          )}
        </div>
      )}

      {isExternal && (canSelectAll || canCopyVisible) && (
        // Actions follow the content they act on: they used to sit above the
        // lineup, costing a row before the first band.
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3">
          {canSelectAll && (
            <button
              type="button"
              onClick={handleSelectAll}
              disabled={allSelected}
              className="min-h-[44px] rounded-md px-2 text-sm font-medium text-accent-400 hover:text-text-primary disabled:cursor-not-allowed disabled:text-text-disabled focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              {allSelected
                ? `All ${selectableBands.length} in My route`
                : `Add all ${selectableBands.length} to My route`}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopyAll}
            disabled={isCopyingAll || !canCopyVisible}
            className="min-h-[44px] rounded-md px-2 text-sm font-medium text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:text-text-disabled focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            {copyAllLabel}
          </button>
        </div>
      )}
    </div>
  )
}

export default memo(ScheduleView)
