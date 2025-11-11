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
 * @returns {string} One of: 'upcoming', 'recently_completed', 'archived'
 */
export function getEventState(eventDate) {
  if (!eventDate) return 'upcoming' // No date = treat as upcoming

  const now = new Date()
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
export function isEventInGracePeriod(eventDate) {
  return getEventState(eventDate) === 'recently_completed'
}

/**
 * Check if event is upcoming (before event end)
 *
 * @param {string} eventDate - Event date in YYYY-MM-DD format
 * @returns {boolean}
 */
export function isEventUpcoming(eventDate) {
  return getEventState(eventDate) === 'upcoming'
}

/**
 * Calculate days since event ended
 *
 * @param {string} eventDate - Event date in YYYY-MM-DD format
 * @returns {number} Days since event ended (0 if upcoming, negative if in future)
 */
export function getDaysSinceEvent(eventDate) {
  if (!eventDate) return -1

  const now = new Date()
  const eventEnd = new Date(eventDate + 'T23:59:59')
  const diffMs = now.getTime() - eventEnd.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  return diffDays
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
 * @returns {Object} Display info with label, color, emoji
 */
export function formatEventState(eventDate) {
  const state = getEventState(eventDate)

  const stateInfo = {
    upcoming: {
      label: 'Upcoming Event',
      color: 'green',
      emoji: '📅',
      description: 'Event has not started yet',
    },
    recently_completed: {
      label: 'Grace Period',
      color: 'yellow',
      emoji: '⏰',
      description: `${getGracePeriodHoursRemaining(eventDate)}h remaining to make edits`,
    },
    archived: {
      label: 'Archived Event',
      color: 'gray',
      emoji: '🗄️',
      description: `Ended ${getDaysSinceEvent(eventDate)} days ago`,
    },
  }

  return stateInfo[state]
}

/**
 * Validate if action is allowed on event based on state
 *
 * @param {string} eventDate - Event date in YYYY-MM-DD format
 * @param {string} action - Action type: 'edit', 'delete', 'publish', 'add_performance'
 * @returns {Object} { allowed: boolean, reason: string }
 */
export function validateEventAction(eventDate, action) {
  const state = getEventState(eventDate)

  // Upcoming events: all actions allowed
  if (state === 'upcoming') {
    return { allowed: true, reason: '' }
  }

  // Grace period: edits allowed with warning
  if (state === 'recently_completed') {
    return {
      allowed: true,
      reason: `Grace period (${getGracePeriodHoursRemaining(eventDate)}h remaining)`,
    }
  }

  // Archived: restricted actions
  if (state === 'archived') {
    const restrictedActions = ['edit', 'delete', 'add_performance']

    if (restrictedActions.includes(action)) {
      return {
        allowed: false,
        reason: `Event archived ${getDaysSinceEvent(eventDate)} days ago. Use "Copy as Template" instead.`,
      }
    }

    // Publishing/unpublishing archived events is allowed (visibility control)
    return { allowed: true, reason: '' }
  }

  return { allowed: true, reason: '' }
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
    `⚠️ Warning: This event ended ${daysAgo} ${daysAgo === 1 ? 'day' : 'days'} ago.\n\n` +
      `Editing historical data can affect analytics and records.\n\n` +
      `Are you sure you want to edit this archived event?`
  )

  if (!confirmed1) return false

  // Second confirmation - More explicit
  const confirmed2 = window.confirm(
    `🔒 Final Confirmation\n\n` +
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
    `⚠️ Delete Archived Event\n\n` +
      `Event: "${event.name}"\n` +
      `Ended: ${daysAgo} ${daysAgo === 1 ? 'day' : 'days'} ago\n\n` +
      `This will permanently delete historical event data.\n` +
      `This action cannot be undone.\n\n` +
      `Are you sure you want to delete this event?`
  )
}
