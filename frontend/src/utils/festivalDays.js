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
 *   start times by one local calendar day (`addLocalDays`, below) so they
 *   sort after the same evening's earlier sets rather than at the top of
 *   the schedule.
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
 * `style: 'short'` -> "Aug 2"
 * `style: 'long'`  -> "August 2"
 *
 * No weekday (#681): a festival day runs 6 AM -> 6 AM
 * (`AFTER_MIDNIGHT_THRESHOLD_HOUR`), so an after-midnight set belongs to the
 * *previous evening's* lineup even though its calendar weekday has already
 * ticked over. A fan at a venue at 1 AM would see their phone say Monday
 * while a weekday label here said Sunday — both correct, but the mismatch
 * reads as the app being wrong. Month/day carries the same information
 * without that ambiguity, and is redundant with the day-number label on
 * single-day events regardless (see CLAUDE.md "Single-day events: never
 * show 'Day 1'").
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
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  return date.toLocaleDateString('en-US', {
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
 * Maps each entry in an already-ordered `days` array (e.g. the output of
 * `orderedFestivalDays`) to its 1-based day number. Split out from
 * `dayNumberByDate` so a caller holding the *authoritative* full-event day
 * list doesn't have to round-trip back through a possibly-partial `items`
 * array to get the same numbering (see MySchedule's `festivalDays` prop,
 * #542 PR-3 — a fan's selected-bands subset can span fewer days than the
 * event itself, e.g. Day-2-only selections, which would otherwise mislabel
 * Day 2 as "Day 1").
 */
export const dayNumberMapFromDays = days => new Map(days.map((date, index) => [date, index + 1]))

/**
 * Maps each distinct festival date to its 1-based day number (earliest = Day 1).
 */
export const dayNumberByDate = items => dayNumberMapFromDays(orderedFestivalDays(items))

/**
 * True when `items` span more than one distinct festival day.
 */
export const isMultiDay = items => orderedFestivalDays(items).length > 1

/**
 * Resolves which 1-based festival day should be active for the day-tab
 * filter (#542 PR-3). Day tabs are a hard FILTER — exactly one day's
 * performances render at a time, there is no "all days" tab — so this is
 * the single source of truth both `ScheduleView` and `MySchedule` call
 * through `useFestivalDayFilter` to agree on the same day.
 *
 * Precedence:
 *  1. `dayParam` (the `?day=N` URL value, 1-indexed) when it parses as a
 *     plain positive integer within `[1, days.length]`. Anything else
 *     (missing, non-numeric, out-of-range, a stale link after the lineup
 *     shrank) falls through to the default — an invalid `?day=` must never
 *     blank the view.
 *  2. Smart default: if `todayStr` (YYYY-MM-DD, Toronto-local per CLAUDE.md)
 *     falls within `[startDate, endDate]` (the event's official run) AND
 *     matches one of the festival `days` exactly, default to that day.
 *     `startDate`/`endDate` are optional — surfaces without the event
 *     record (e.g. the embed view) omit them and "in progress" degrades to
 *     direct membership in `days`.
 *  3. Otherwise day 1.
 *
 * Pure and synchronous — unit-testable without mounting a component or a
 * Router.
 */
export function resolveActiveFestivalDay({ days, dayParam, todayStr, startDate = null, endDate = null }) {
  if (!days || days.length === 0) return null

  const trimmed = typeof dayParam === 'string' ? dayParam.trim() : ''
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number(trimmed)
    if (parsed >= 1 && parsed <= days.length) return parsed
  }

  const inProgress = startDate && endDate ? todayStr >= startDate && todayStr <= endDate : days.includes(todayStr)
  if (inProgress) {
    const idx = days.indexOf(todayStr)
    if (idx >= 0) return idx + 1
  }

  return 1
}

/**
 * Advances a LOCAL epoch-ms timestamp by `days` local calendar days — NOT a
 * fixed `days * 86_400_000`. A local day is 23h or 25h across a DST
 * transition (spring-forward / fall-back), so a flat millisecond add lands
 * on the wrong wall-clock time, and sometimes the wrong calendar date, for
 * any after-midnight set on a transition night (#768).
 *
 * `setDate()` walks the calendar and re-resolves the UTC offset for the
 * landing date, so it is DST-correct by construction. This is the same
 * technique `SharePreviewPage.jsx`'s `sortKey()` already uses (stepping
 * backward across the boundary) — see the comment there for the reasoning;
 * this is that pattern's forward-stepping, shared home so `bandUtils.js`
 * and `MySchedule.jsx` don't each re-derive it.
 *
 * Spring-forward edge case: advancing into the 2:00–2:59 AM hour on the
 * night clocks jump forward lands on a local time that does not exist.
 * `setDate()` normalizes it forward by the size of the gap (e.g. 2:30 AM ->
 * 3:30 AM) rather than throwing — the same normalization a wall clock
 * itself performs on that night. That is treated as correct here, not an
 * accident of the engine: an after-midnight set is deliberately re-anchored
 * to the previous evening's day, and the exact minute a non-existent
 * wall-clock time resolves to is a one-night-a-year edge no fan-facing
 * surface distinguishes. Pinned by a test in `bandUtils.test.js`.
 *
 * @param {number} ms - epoch milliseconds
 * @param {number} days - number of local calendar days to advance (may be negative)
 * @returns {number} new epoch milliseconds
 */
export function addLocalDays(ms, days) {
  const d = new Date(ms)
  d.setDate(d.getDate() + days)
  return d.getTime()
}
