/**
 * Fan-facing "N days away" countdown chip (LiveContextBar's warning-styled
 * badge, shown while the event is "Upcoming" — see liveLabel.js/#569).
 *
 * On the event's own day, pre-doors, the day-granularity distance is 0 —
 * "0 days away" reads wrong at exactly the moment fans are most likely to
 * check the page (#596). Render "Tonight" instead. For every other value,
 * pluralize: "1 day away" vs "N days away".
 *
 * @param {number} daysUntil
 * @returns {string}
 */
export function getDaysAwayLabel(daysUntil) {
  if (daysUntil === 0) return 'Tonight'
  return `${daysUntil} ${daysUntil === 1 ? 'day away' : 'days away'}`
}

/**
 * Screen-reader text for the same chip. Kept separate from the visible label
 * because the accessible phrasing reads better as a full sentence fragment
 * ("N days until the event") than the terse visible chip text.
 *
 * @param {number} daysUntil
 * @returns {string}
 */
export function getDaysAwayAriaLabel(daysUntil) {
  if (daysUntil === 0) return 'Tonight — the event is today'
  return `${daysUntil} ${daysUntil === 1 ? 'day' : 'days'} until the event`
}
