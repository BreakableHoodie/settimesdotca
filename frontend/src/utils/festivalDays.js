/**
 * Shared festival-day helpers for multi-day events (#541).
 *
 * Both the admin day-selector (`frontend/src/admin/utils/dayOptions.js`) and
 * fan-facing schedule surfaces (`ScheduleView`, `MySchedule`) need to label
 * and order festival days consistently. This module is the single source of
 * truth for that date handling so the two surfaces never drift.
 *
 * A "festival day" is `band.date` (a YYYY-MM-DD string) — the evening a
 * performance belongs to, already offset for after-midnight sets by
 * `prepareBands()` in `bandUtils.js`. These helpers never re-derive which
 * day a performance belongs to; they only order/label the distinct days
 * already present in the data.
 */

/**
 * The 6 AM boundary a festival day runs on: 6 AM -> 6 AM, not midnight -> midnight.
 * A set starting at 1 AM belongs to the festival day of the *evening it
 * started* (the previous night's lineup), not the calendar day its clock
 * time falls on.
 *
 * This is the single canonical definition (#550) — every consumer imports
 * it rather than re-encoding `6`:
 * - `frontend/src/utils/bandUtils.js` (`prepareBands`) offsets sub-6-AM
 *   start times by `MS_PER_DAY` so they sort after the same evening's
 *   earlier sets rather than at the top of the schedule.
 * - `frontend/src/admin/utils/timeUtils.js` derives
 *   `AFTER_MIDNIGHT_THRESHOLD_MINUTES` (`AFTER_MIDNIGHT_THRESHOLD_HOUR * 60`)
 *   from this for its own minutes-based offset (`adjustForMidnight`).
 *
 * Repo invariant (see CLAUDE.md "After-midnight band sorting"): this value
 * must never be removed or lowered — doing so is a recurring bug class
 * (after-midnight sets sorting to the top of the schedule instead of the
 * end).
 */
export const AFTER_MIDNIGHT_THRESHOLD_HOUR = 6

const parseDateParts = dateStr => {
  const [year, month, day] = dateStr.split('-').map(Number)
  return { year, month, day }
}

/**
 * Formats a YYYY-MM-DD string for display.
 *
 * `style: 'short'` -> "Sat Aug 2"
 * `style: 'long'`  -> "Saturday, August 2"
 *
 * Uses the local-timezone numeric `new Date(year, month - 1, day)`
 * constructor (parsed by splitting on `-`) — NEVER `new Date('YYYY-MM-DD')`,
 * which parses a bare date string as UTC midnight and drifts a day in
 * negative-offset timezones (documented repo invariant, see CLAUDE.md).
 */
export const formatFestivalDate = (dateValue, style = 'long') => {
  if (!dateValue) return ''
  const { year, month, day } = parseDateParts(dateValue)
  const date = new Date(year, month - 1, day)

  if (style === 'short') {
    const label = date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
    return label.replace(',', '')
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Returns the distinct non-empty `.date` values present across `items`, in
 * ascending order. Plain lexicographic string sort — YYYY-MM-DD strings sort
 * chronologically as strings, so this never needs `new Date(...)` parsing.
 */
export const orderedFestivalDays = items => {
  const dates = new Set()
  ;(items ?? []).forEach(item => {
    if (item?.date) dates.add(item.date)
  })
  return [...dates].sort()
}

/**
 * Maps each distinct festival date to its 1-based day number (earliest = Day 1).
 */
export const dayNumberByDate = items => {
  const days = orderedFestivalDays(items)
  return new Map(days.map((date, index) => [date, index + 1]))
}

/**
 * True when `items` span more than one distinct festival day.
 */
export const isMultiDay = items => orderedFestivalDays(items).length > 1
