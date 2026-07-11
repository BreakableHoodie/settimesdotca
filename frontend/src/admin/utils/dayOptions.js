/**
 * Festival-day helpers for multi-day events (#540).
 *
 * A festival day runs 6 AM -> 6 AM (see AFTER_MIDNIGHT_THRESHOLD_HOUR in
 * frontend/src/utils/festivalDays.js): a set starting at 1 AM belongs to the
 * festival day of the *evening it started*, not the calendar day its clock
 * time falls on. These helpers only build/label the set of festival days for
 * an event — they never re-derive which day a given performance belongs to;
 * that's an explicit admin choice, stored in performances.performance_date.
 */
import { formatFestivalDate } from '../../utils/festivalDays'

const parseDateParts = dateStr => {
  const [year, month, day] = dateStr.split('-').map(Number)
  return { year, month, day }
}

const toDateValue = date =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// Hard cap so a malformed/reversed date range can't spin the enumeration loop forever.
const MAX_FESTIVAL_DAYS = 30

/**
 * True when an event spans more than one calendar day.
 *
 * String comparison only — never `new Date(...)`, which parses a bare
 * YYYY-MM-DD string as UTC midnight and drifts a day in negative-offset
 * timezones (documented repo invariant, see CLAUDE.md).
 */
export const isMultiDayEvent = event => Boolean(event?.date && event?.end_date && event.end_date > event.date)

/**
 * Enumerates the calendar dates from `startDate` through `endDate` inclusive,
 * as YYYY-MM-DD strings. Date math uses the local-timezone numeric
 * (year, month, day) constructor plus `setDate` increments — never the
 * UTC-parsing `new Date('YYYY-MM-DD')` form — so incrementing never drifts
 * across a DST boundary.
 *
 * A missing/reversed `endDate` collapses the range to a single day
 * (`startDate` alone) rather than looping indefinitely.
 */
export const enumerateFestivalDays = (startDate, endDate) => {
  if (!startDate) return []
  const { year, month, day } = parseDateParts(startDate)
  const cursor = new Date(year, month - 1, day)
  const endValue = endDate && endDate > startDate ? endDate : startDate

  const days = []
  for (let i = 0; i < MAX_FESTIVAL_DAYS; i++) {
    const value = toDateValue(cursor)
    days.push(value)
    if (value >= endValue) break
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

/**
 * Builds <select> options for an event's festival days:
 * [{ value: 'YYYY-MM-DD', label: 'Day 1 (Sat Aug 2)' }, ...]
 */
export const buildDayOptions = (startDate, endDate) =>
  enumerateFestivalDays(startDate, endDate).map((value, index) => ({
    value,
    label: `Day ${index + 1} (${formatFestivalDate(value, 'short')})`,
  }))
