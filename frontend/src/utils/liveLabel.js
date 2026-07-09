/**
 * Fan-facing event lifecycle label (the badge in LiveContextBar).
 *
 * Schedule-aware: the event stays "Live Tonight" until whichever is later —
 * the event day's local end, or the actual last set's end (which prepareBands
 * has already offset correctly for after-midnight sets). This fixes the badge
 * flipping to "Recap" at calendar midnight while 1 AM sets are still playing
 * (#558), while staying byte-identical for events with no after-midnight sets.
 *
 * Deliberately independent of the admin edit-protection lifecycle
 * (`getEventState` in `eventLifecycle.js`) — coupling the two is what caused
 * #558. This is display only; that is data-mutation protection.
 */

const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000

const LABELS = {
  archive: { label: 'Archive', classes: 'bg-surface text-text-secondary border-border' },
  recap: { label: 'Recap', classes: 'bg-info-500/15 text-info-400 border-info-500/30' },
  live: { label: 'Live Tonight', classes: 'bg-accent-500/15 text-accent-400 border-accent-500/30' },
  upcoming: { label: 'Upcoming', classes: 'bg-info-500/15 text-info-400 border-info-500/30' },
}

const toMs = value => (value instanceof Date ? value : new Date(value)).getTime()

/**
 * True when `currentTime` falls on the same local calendar day as the
 * YYYY-MM-DD `eventDate`. Local components on purpose — the badge is for the
 * viewer's own clock.
 */
export function isSameLocalDay(eventDate, currentTime) {
  if (!eventDate) return false
  const current = currentTime instanceof Date ? currentTime : new Date(currentTime)
  const year = current.getFullYear()
  const month = String(current.getMonth() + 1).padStart(2, '0')
  const day = String(current.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}` === eventDate
}

/**
 * Real start/end of the crawl from prepared bands. `prepareBands` sets
 * `endMs`/`startMs` to 0 for bands with no/invalid times, so we ignore those.
 * Fields are null when no band has a real time yet (e.g. before the schedule's
 * set times are entered).
 */
function scheduleWindow(bands) {
  let firstStart = Infinity
  let lastEnd = 0
  for (const band of bands ?? []) {
    if (band?.endMs > 0 && band.endMs > lastEnd) lastEnd = band.endMs
    if (band?.startMs > 0 && band.startMs < firstStart) firstStart = band.startMs
  }
  return { firstStart: firstStart === Infinity ? null : firstStart, lastEnd: lastEnd > 0 ? lastEnd : null }
}

/**
 * @param {string} eventDate - YYYY-MM-DD
 * @param {Date|number} currentTime
 * @param {Array<{startMs:number,endMs:number}>} bands - prepared bands (prepareBands)
 * @returns {{label:string, classes:string}}
 */
export function getLifecycleLabel(eventDate, currentTime, bands = []) {
  const { firstStart, lastEnd } = scheduleWindow(bands)

  // Baseline: the event day's local end (23:59:59), matching the prior
  // date-based behavior. `new Date('YYYY-MM-DDT23:59:59')` parses as LOCAL time
  // (no offset) — same as the old getEventState path, so single-day events are
  // byte-identical.
  const baselineEnd = eventDate ? new Date(eventDate + 'T23:59:59').getTime() : 0
  // Live through whichever is later — the day's end, or the real last set. Only
  // after-midnight sets push this past midnight; everything else is unchanged.
  const liveEnd = Math.max(baselineEnd, lastEnd ?? 0)

  // Neither a date nor any set times → nothing to reason about.
  if (liveEnd <= 0) return LABELS.upcoming

  const now = toMs(currentTime)
  if (now >= liveEnd + GRACE_PERIOD_MS) return LABELS.archive
  if (now >= liveEnd) return LABELS.recap
  // Before the crawl ends: "Live" on the event's local day, or once the first
  // set has started — the latter keeps it Live through the after-midnight
  // window, when the local calendar day has rolled over but the crawl is on.
  if (isSameLocalDay(eventDate, currentTime) || (firstStart != null && now >= firstStart)) {
    return LABELS.live
  }
  return LABELS.upcoming
}
