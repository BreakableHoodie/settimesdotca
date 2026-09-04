/**
 * `events.venue_info` is a JSON array of venue objects, stored as TEXT.
 *
 * One home for parsing it. This lived privately inside LiveContextBar until the
 * header's venue strip needed the same list; copying it would have been the
 * second parser for one column, and they drift.
 *
 * Malformed or absent input yields an empty array rather than throwing: the
 * column is hand-edited in admin, and a bad value must degrade to "no venues"
 * on a public page, never to a blank screen.
 */
export function parseVenueInfo(venueInfo) {
  if (!venueInfo) return []

  try {
    const parsed = typeof venueInfo === 'string' ? JSON.parse(venueInfo) : venueInfo
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * The venue NAMES for an event, in the order the organiser declared them.
 *
 * Order is meaningful and deliberately preserved: for a crawl it is the walk
 * order along the street, which is what the header strip draws.
 */
export function venueNamesFrom(venueInfo) {
  return parseVenueInfo(venueInfo)
    .map(venue => (typeof venue === 'string' ? venue : venue?.name))
    .map(name => (typeof name === 'string' ? name.trim() : ''))
    .filter(Boolean)
}
