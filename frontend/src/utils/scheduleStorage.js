export const SELECTED_BANDS_KEY = 'selectedBandsByEvent'
// Internal key within the stored object for event date metadata
const DATES_KEY = '__dates__'

// Returns true if the event's stored date is before today.
// Events with no stored date are never considered stale (backward compat).
// Compares YYYY-MM-DD strings directly to avoid UTC-parsing timezone issues.
function isEventStale(parsed, slug) {
  const date = parsed?.[DATES_KEY]?.[slug]
  if (!date) return false
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return date < todayStr
}

/**
 * Get selected band IDs for an event from localStorage
 */
export function getSelectedBands(eventSlug) {
  if (typeof window === 'undefined') return []
  try {
    const data = localStorage.getItem(SELECTED_BANDS_KEY)
    if (!data) return []
    const parsed = JSON.parse(data)
    return Array.isArray(parsed[eventSlug]) ? parsed[eventSlug] : []
  } catch {
    return []
  }
}

/**
 * Save selected band IDs for an event to localStorage.
 * Pass eventDate (YYYY-MM-DD) so stale past-event entries can be filtered out.
 */
export function saveSelectedBands(eventSlug, bandIds, eventDate) {
  if (typeof window === 'undefined') return
  try {
    const data = localStorage.getItem(SELECTED_BANDS_KEY)
    const parsed = data ? JSON.parse(data) : {}
    parsed[eventSlug] = bandIds
    if (eventDate) {
      if (!parsed[DATES_KEY] || typeof parsed[DATES_KEY] !== 'object') {
        parsed[DATES_KEY] = {}
      }
      parsed[DATES_KEY][eventSlug] = eventDate
    }
    localStorage.setItem(SELECTED_BANDS_KEY, JSON.stringify(parsed))
  } catch (err) {
    console.warn('Failed to save schedule:', err)
  }
}

/**
 * Check if user has any schedule built for a non-past event.
 */
export function hasAnySchedule() {
  if (typeof window === 'undefined') return false
  try {
    const data = localStorage.getItem(SELECTED_BANDS_KEY)
    if (!data) return false
    const parsed = JSON.parse(data)
    if (!parsed || typeof parsed !== 'object') return false
    return Object.entries(parsed).some(
      ([slug, arr]) => slug !== DATES_KEY && Array.isArray(arr) && arr.length > 0 && !isEventStale(parsed, slug)
    )
  } catch {
    return false
  }
}

/**
 * Get the first non-past event slug that has bands selected.
 */
export function getScheduleEventSlug() {
  if (typeof window === 'undefined') return null
  try {
    const data = localStorage.getItem(SELECTED_BANDS_KEY)
    if (!data) return null
    const parsed = JSON.parse(data)
    if (!parsed || typeof parsed !== 'object') return null
    for (const [slug, bands] of Object.entries(parsed)) {
      if (
        slug !== DATES_KEY &&
        slug !== 'default' &&
        Array.isArray(bands) &&
        bands.length > 0 &&
        !isEventStale(parsed, slug)
      ) {
        return slug
      }
    }
    if (Array.isArray(parsed.default) && parsed.default.length > 0) {
      return null
    }
    return null
  } catch {
    return null
  }
}
