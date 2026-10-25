import { filterPerformancesByTime } from './timeFilter'

// Sentinel for "sets with no venue". A symbol so it can never collide with a
// real venue name.
export const UNSCHEDULED = Symbol('unscheduled')

/** `currentTime` arrives as a Date or a timestamp; the filters want epoch ms. */
export function currentTimeMs(currentTime) {
  const d = currentTime instanceof Date ? currentTime : new Date(currentTime)
  return d.getTime()
}

/**
 * The one place the lineup's filter chain lives. ScheduleView renders from it
 * and the event page's filter panel reads its genre options and "Show N sets"
 * count from it, so the number on the button can never disagree with the list
 * (the two used to be separate computations in separate components).
 *
 * `bands` is the full prepared list. `activeDate` is the day-tab selection
 * (null for a single-day event). Order matters and is unchanged: day, then
 * time, then venue/genre, then finished sets -- `finishedCount` is taken
 * BEFORE the finished-sets cut so it does not depend on `showPast`.
 */
export function deriveLineup(
  bands,
  { activeDate = null, timeFilter = 'all', venueFilter = null, genreFilter = null, showPast = false, nowMs }
) {
  const dayFilteredBands = activeDate ? bands.filter(band => band.date === activeDate) : bands
  const genres = [...new Set(dayFilteredBands.filter(b => b.genre).map(b => b.genre))].sort()
  const timeFilteredBands = filterPerformancesByTime(dayFilteredBands, timeFilter)
  const venueGenreFilteredBands = timeFilteredBands.filter(b => {
    if (venueFilter === UNSCHEDULED) return !b.venue
    if (venueFilter && b.venue !== venueFilter) return false
    if (genreFilter && b.genre !== genreFilter) return false
    return true
  })
  // endMs, not the raw endTime string: prepareBands derives an end for an
  // open-ended set ("12:25 - END"), and the grouping uses endMs. Testing the
  // string hid that set as past without counting it.
  const finishedCount = venueGenreFilteredBands.reduce(
    (count, band) => (band.endMs > 0 && band.endMs <= nowMs ? count + 1 : count),
    0
  )
  const visibleBands = showPast
    ? venueGenreFilteredBands
    : // Untimed sets (endMs 0) always show; timed ones hide once over.
      venueGenreFilteredBands.filter(band => !(band.endMs > 0) || band.endMs > nowMs)
  return { dayFilteredBands, genres, finishedCount, visibleBands }
}
