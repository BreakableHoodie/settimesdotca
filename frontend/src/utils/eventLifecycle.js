/**
 * Event Lifecycle Utilities
 *
 * Determines event state based on date and provides protection logic
 * for old events to prevent accidental modifications.
 *
 * States:
 * - upcoming: Event has not ended yet
 * - recently_completed: 0-48h after event end (grace period for edits)
 * - archived: 48h+ after event end (restricted editing)
 */

/**
 * Grace period in milliseconds (48 hours)
 */
const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000

/**
 * Calculate event lifecycle state
 *
 * @param {string} eventDate - Event date in YYYY-MM-DD format
 * @param {Date|string|number} referenceTime - Optional time to evaluate against
 * @returns {string} One of: 'upcoming', 'recently_completed', 'archived'
 */
export function getEventState(eventDate, referenceTime = new Date()) {
  if (!eventDate) return 'upcoming' // No date = treat as upcoming

  const now = referenceTime instanceof Date ? referenceTime : new Date(referenceTime)
  // Event ends at 23:59:59 on the event date
  const eventEnd = new Date(eventDate + 'T23:59:59')
  const gracePeriodEnd = new Date(eventEnd.getTime() + GRACE_PERIOD_MS)

  if (now < eventEnd) {
    return 'upcoming'
  } else if (now < gracePeriodEnd) {
    return 'recently_completed'
  } else {
    return 'archived'
  }
}

/**
 * Check if event is archived (48h+ past event date)
 *
 * @param {string} eventDate - Event date in YYYY-MM-DD format
 * @returns {boolean}
 */
export function isEventArchived(eventDate) {
  return getEventState(eventDate) === 'archived'
}

/**
 * Check if event is in grace period (0-48h after event end)
 *
 * @param {string} eventDate - Event date in YYYY-MM-DD format
 * @returns {boolean}
 */
function isEventInGracePeriod(eventDate) {
  return getEventState(eventDate) === 'recently_completed'
}

/**
 * Calculate whole calendar days since the event date
 *
 * Counts CALENDAR days in the local zone, not elapsed time: the event's own
 * date is 0, the next date is 1, a future date is negative.
 *
 * @param {string} eventDate - Event date in YYYY-MM-DD format
 * @param {Date|string|number} referenceTime - Optional time to evaluate against
 * @returns {number} Calendar days since the event date (negative if future, -1 if no date)
 */
export function getDaysSinceEvent(eventDate, referenceTime = new Date()) {
  if (!eventDate) return -1

  const now = referenceTime instanceof Date ? referenceTime : new Date(referenceTime)
  const [year, month, day] = eventDate.split('-').map(Number)

  // Both endpoints are projected onto UTC midnight, so their difference is
  // always an exact multiple of 24h no matter what the local zone does in
  // between. Dividing REAL elapsed milliseconds by 86400000 cannot work here
  // (#770): a spring-forward day is only 23 wall-clock hours, so Math.floor
  // reported 0 for a full calendar day. Math.round appears to fix that case
  // but is worse — it rounds 12h up, so an event reads "1 day ago" at noon
  // the morning after, and a future event yields -0 instead of a negative.
  const eventDayUtc = Date.UTC(year, month - 1, day)
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())

  return Math.round((todayUtc - eventDayUtc) / (1000 * 60 * 60 * 24))
}

/**
 * Calculate hours remaining in grace period
 *
 * @param {string} eventDate - Event date in YYYY-MM-DD format
 * @returns {number} Hours remaining (0 if not in grace period)
 */
export function getGracePeriodHoursRemaining(eventDate) {
  if (!eventDate || !isEventInGracePeriod(eventDate)) return 0

  const now = new Date()
  const eventEnd = new Date(eventDate + 'T23:59:59')
  const gracePeriodEnd = new Date(eventEnd.getTime() + GRACE_PERIOD_MS)
  const remainingMs = gracePeriodEnd.getTime() - now.getTime()
  const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60))

  return Math.max(0, remainingHours)
}

/**
 * Format event state for display
 *
 * @param {string} eventDate - Event date in YYYY-MM-DD format
 * @returns {Object} Display info with label, color, icon
 */
export function formatEventState(eventDate) {
  const state = getEventState(eventDate)

  const stateInfo = {
    upcoming: {
      label: 'Upcoming Event',
      color: 'green',
      icon: 'calendar',
      description: 'Event has not started yet',
    },
    recently_completed: {
      label: 'Grace Period',
      color: 'yellow',
      icon: 'clock',
      description: `${getGracePeriodHoursRemaining(eventDate)}h remaining to make edits`,
    },
    archived: {
      label: 'Archived Event',
      color: 'gray',
      icon: 'archive',
      description: `Ended ${getDaysSinceEvent(eventDate)} days ago`,
    },
  }

  return stateInfo[state]
}

/**
 * Two-confirmation gate for editing archived events
 *
 * Shows sequential confirmations with increasing explicitness.
 * Returns true if user confirms both dialogs.
 *
 * @param {Object} event - Event object with name and date
 * @returns {boolean} True if user confirmed both dialogs
 */
export function confirmArchivedEventEdit(event) {
  if (!event) return false

  const daysAgo = getDaysSinceEvent(event.date)

  // First confirmation - General warning
  const confirmed1 = window.confirm(
    `Warning: This event ended ${daysAgo} ${daysAgo === 1 ? 'day' : 'days'} ago.\n\n` +
      `Editing historical data can affect analytics and records.\n\n` +
      `Are you sure you want to edit this archived event?`
  )

  if (!confirmed1) return false

  // Second confirmation - More explicit
  const confirmed2 = window.confirm(
    `Final Confirmation\n\n` +
      `You are about to modify historical data for "${event.name}".\n\n` +
      `This action will be logged in the audit trail.\n\n` +
      `Continue with edit?`
  )

  return confirmed2
}

/**
 * Single confirmation for deleting archived events
 *
 * @param {Object} event - Event object with name and date
 * @returns {boolean} True if user confirmed
 */
export function confirmArchivedEventDelete(event) {
  if (!event) return false

  const daysAgo = getDaysSinceEvent(event.date)

  return window.confirm(
    `Delete Archived Event\n\n` +
      `Event: "${event.name}"\n` +
      `Ended: ${daysAgo} ${daysAgo === 1 ? 'day' : 'days'} ago\n\n` +
      `This will permanently delete historical event data.\n` +
      `This action cannot be undone.\n\n` +
      `Are you sure you want to delete this event?`
  )
}
