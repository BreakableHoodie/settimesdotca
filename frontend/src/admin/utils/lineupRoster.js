import { sortableName } from '../../utils/sortableName'
import { parseOrigin } from '../../utils/parseOrigin'
import { DEFAULT_GENRES, getNormalizedGenreSuggestions } from '../../utils/genres'
import {
  adjustForMidnight,
  deriveDurationMinutes,
  detectConflicts,
  parseTimeToMinutes,
  sortBandsByStart,
} from './timeUtils'

/**
 * Pure roster logic for LineupTab — what an operator sees, and in what order.
 *
 * Extracted rather than left inline because LineupTab is 1,200+ lines and
 * loaded in zero tests (#905), while this is the code that decides which sets
 * appear during a show. Mounting the component to reach it would pull its whole
 * uncovered surface into the coverage denominator; a pure module can be tested
 * directly.
 *
 * Every function here takes its collaborators as arguments instead of closing
 * over component state, so a test supplies them without a render.
 */

/**
 * Keep retired profiles out of the lineup picker while retaining them for
 * origin and genre suggestions.
 *
 * @param {Array<object>} bands
 * @returns {Array<object>}
 */
export function getActiveBands(bands) {
  return (bands ?? []).filter(band => band.is_active !== 0 && band.is_active !== false)
}

/**
 * Narrow the roster by search text, venue, and festival day.
 *
 * `dayFilter` is ignored unless `isMultiDay` — single-day events never render
 * the selector and leave `performance_date` NULL (#540), so filtering on it
 * would drop every set.
 *
 * @param {Array<object>} bands
 * @param {object} options
 * @param {string} [options.searchTerm]
 * @param {string|number} [options.venueFilter] - "all" for no filter
 * @param {string} [options.dayFilter] - "all" for no filter; YYYY-MM-DD otherwise
 * @param {boolean} [options.isMultiDay]
 * @param {(band: object) => string|null} options.bandFestivalDate - resolves a
 *   set's festival day, applying the event-start fallback for NULL
 *   performance_date. Passed in rather than re-derived so the fallback lives in
 *   exactly one place.
 * @returns {Array<object>}
 */
export function filterRosterBands(bands, { searchTerm, venueFilter, dayFilter, isMultiDay, bandFestivalDate } = {}) {
  let next = bands ?? []
  if (searchTerm?.trim()) {
    const query = searchTerm.trim().toLowerCase()
    next = next.filter(band => band.name?.toLowerCase().includes(query))
  }
  if (venueFilter !== undefined && venueFilter !== 'all') {
    next = next.filter(band => String(band.venue_id) === String(venueFilter))
  }
  if (isMultiDay && dayFilter !== undefined && dayFilter !== 'all') {
    next = next.filter(band => bandFestivalDate(band) === dayFilter)
  }
  return next
}

/**
 * Order the roster. With no explicit sort key this falls back to start time via
 * `sortBandsByStart`, which applies the after-midnight offset — a 1 AM set
 * belongs to the end of the previous evening, not the top of the schedule.
 *
 * @param {Array<object>} bands
 * @param {{key: string|null, direction: 'asc'|'desc'}} sortConfig
 * @param {object} deps
 * @param {(venueId: number|string) => string} deps.getVenueName
 * @param {(band: object) => string|null} deps.bandFestivalDate
 * @returns {Array<object>} a new array; the input is not mutated
 */
export function sortRosterBands(bands, sortConfig, { getVenueName, bandFestivalDate } = {}) {
  const list = bands ?? []
  if (!sortConfig?.key) {
    return sortBandsByStart(list)
  }

  const direction = sortConfig.direction === 'asc' ? 1 : -1

  return [...list].sort((a, b) => {
    if (sortConfig.key === 'name') {
      // Article-stripped alphabetization (#587) — "The Anti-Queens" sorts under A.
      return sortableName(a.name).localeCompare(sortableName(b.name)) * direction
    }
    if (sortConfig.key === 'venue') {
      return getVenueName(a.venue_id).toLowerCase().localeCompare(getVenueName(b.venue_id).toLowerCase()) * direction
    }
    if (sortConfig.key === 'duration') {
      const aVal = deriveDurationMinutes(a.start_time, a.end_time) || 0
      const bVal = deriveDurationMinutes(b.start_time, b.end_time) || 0
      return (aVal - bVal) * direction
    }
    if (sortConfig.key === 'performance_date') {
      // Plain YYYY-MM-DD string comparison sorts chronologically (#588) — same
      // convention as festivalDays.js. NULL performance_date resolves via
      // bandFestivalDate, never re-deriving the fallback locally.
      return (bandFestivalDate(a) || '').localeCompare(bandFestivalDate(b) || '') * direction
    }

    // Start time. Nulls sort last in BOTH directions: an unscheduled set is not
    // "earliest", and flipping the arrow should not promote it to the top.
    const aMin = parseTimeToMinutes(a.start_time)
    const bMin = parseTimeToMinutes(b.start_time)
    if (aMin == null && bMin == null) return 0
    if (aMin == null) return 1
    if (bMin == null) return -1
    return (adjustForMidnight(aMin) - adjustForMidnight(bMin)) * direction
  })
}

/**
 * Distinct origin values for a datalist, sorted for display.
 *
 * `field` selects the column; when it is empty the value is recovered from the
 * legacy freeform `origin` string via parseOrigin. City and region were two
 * near-identical copies inline — one parameterised function keeps them from
 * drifting.
 *
 * Deliberately reads ALL bands including inactive ones: reusing a retired
 * band's origin is harmless and losing the suggestion is not.
 *
 * @param {Array<object>} bands
 * @param {'city'|'region'} field
 * @returns {string[]}
 */
export function deriveOriginSuggestions(bands, field) {
  const column = field === 'city' ? 'origin_city' : 'origin_region'
  const values = new Set()
  for (const band of bands ?? []) {
    if (band[column]) {
      values.add(band[column])
      continue
    }
    if (band.origin) {
      const parsed = parseOrigin(band.origin)
      if (parsed[field]) values.add(parsed[field])
    }
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b))
}

/**
 * Distinct genre suggestions. Genres are stored comma-separated, so each entry
 * is split and trimmed before normalisation.
 *
 * @param {Array<object>} bands
 * @returns {string[]}
 */
export function deriveGenreSuggestions(bands) {
  const values = []
  for (const band of bands ?? []) {
    if (!band.genre) continue
    for (const entry of band.genre.split(',')) {
      const trimmed = entry.trim()
      if (trimmed) values.push(trimmed)
    }
  }
  return getNormalizedGenreSuggestions(values, DEFAULT_GENRES)
}

/**
 * Map each festival date to its 1-based day number, derived from the day
 * OPTIONS rather than from the performances present.
 *
 * That distinction is load-bearing: numbering from data drifts from the
 * dropdown when an interior day has no sets booked yet, so mid-setup "Day 2"
 * would mean different dates in two places on the same screen.
 *
 * @param {Array<{value: string}>} dayOptions
 * @returns {Map<string, number>}
 */
export function buildDayNumberMap(dayOptions) {
  return new Map((dayOptions ?? []).map((opt, index) => [opt.value, index + 1]))
}

/**
 * Pre-compute conflict results by performance id for the lineup table.
 *
 * @param {Array<object>} bands
 * @param {string} [eventDate]
 * @returns {Map<number|string, {overlaps: string[], conflicts: string[]}>}
 */
export function buildConflictsByBandId(bands, eventDate) {
  const conflicts = new Map()
  for (const band of bands ?? []) conflicts.set(band.id, detectConflicts(band, bands, eventDate))
  return conflicts
}

/**
 * Merge client- and server-reported conflict names without duplicates.
 *
 * @param {{overlaps?: string[], conflicts?: string[]}} formConflicts
 * @param {{overlaps?: string[], conflicts?: string[]}} serverConflicts
 * @returns {{overlaps: string[], conflicts: string[]}}
 */
export function mergeConflicts(formConflicts = {}, serverConflicts = {}) {
  return {
    overlaps: [...new Set([...(formConflicts.overlaps ?? []), ...(serverConflicts.overlaps ?? [])])],
    conflicts: [...new Set([...(formConflicts.conflicts ?? []), ...(serverConflicts.conflicts ?? [])])],
  }
}

/**
 * Apply one checkbox change without mutating the existing selection set.
 *
 * @param {Set<number|string>} selectedIds
 * @param {number|string} id
 * @param {boolean} checked
 * @returns {Set<number|string>}
 */
export function updateSelectedIds(selectedIds, id, checked) {
  const next = new Set(selectedIds)
  if (checked) next.add(id)
  else next.delete(id)
  return next
}

/**
 * Build the selection represented by a select-all checkbox.
 *
 * @param {Array<{id: number|string}>} bands
 * @param {boolean} checked
 * @returns {Set<number|string>}
 */
export function selectAllBandIds(bands, checked) {
  return checked ? new Set((bands ?? []).map(band => band.id)) : new Set()
}
