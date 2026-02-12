const SELECTED_BANDS_KEY = 'selectedBandsByEvent'

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
 * Save selected band IDs for an event to localStorage
 */
export function saveSelectedBands(eventSlug, bandIds) {
  if (typeof window === 'undefined') return
  try {
    const data = localStorage.getItem(SELECTED_BANDS_KEY)
    const parsed = data ? JSON.parse(data) : {}
    parsed[eventSlug] = bandIds
    localStorage.setItem(SELECTED_BANDS_KEY, JSON.stringify(parsed))
  } catch (err) {
    console.warn('Failed to save schedule:', err)
  }
}

/**
 * Check if user has any schedule built (across all events)
 */
export function hasAnySchedule() {
  if (typeof window === 'undefined') return false
  try {
    const data = localStorage.getItem(SELECTED_BANDS_KEY)
    if (!data) return false
    const parsed = JSON.parse(data)
    if (!parsed || typeof parsed !== 'object') return false
    return Object.values(parsed).some(arr => Array.isArray(arr) && arr.length > 0)
  } catch {
    return false
  }
}

/**
 * Get the first event slug that has bands selected
 */
export function getScheduleEventSlug() {
  if (typeof window === 'undefined') return null
  try {
    const data = localStorage.getItem(SELECTED_BANDS_KEY)
    if (!data) return null
    const parsed = JSON.parse(data)
    if (!parsed || typeof parsed !== 'object') return null
    for (const [slug, bands] of Object.entries(parsed)) {
      if (Array.isArray(bands) && bands.length > 0 && slug !== 'default') {
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

/**
 * Get a map of event slugs to their saved band count
 * Returns { slug: count, ... } for events with selections
 */
export function getSelectedCountByEvent() {
  if (typeof window === 'undefined') return {}
  try {
    const data = localStorage.getItem(SELECTED_BANDS_KEY)
    if (!data) return {}
    const parsed = JSON.parse(data)
    if (!parsed || typeof parsed !== 'object') return {}
    const counts = {}
    for (const [slug, bands] of Object.entries(parsed)) {
      if (Array.isArray(bands) && bands.length > 0) {
        counts[slug] = bands.length
      }
    }
    return counts
  } catch {
    return {}
  }
}
