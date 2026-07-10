/**
 * Shared helpers for `events.doors_json` (#569) — a JSON map of festival
 * date (YYYY-MM-DD) -> 24h doors/gates-open time ("HH:MM"), e.g.
 * `{"2026-07-10":"16:00","2026-07-11":"10:00"}`. Nullable; absent or
 * malformed always means "no doors info" — every consumer of this module
 * must stay byte-identical to current behaviour in that case.
 *
 * Used by `liveLabel.js` (the "started"/live gate) and the day-divider /
 * event-header doors display — kept in one place so parsing never drifts
 * between the two.
 */

const DOORS_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Parses the raw doors_json string defensively. Never throws — malformed
 * JSON, non-object shapes (arrays, primitives), and null/undefined input all
 * resolve to `null` ("no doors info") rather than surfacing an error to fans.
 * @param {string|null|undefined} doorsJson
 * @returns {Record<string, string>|null}
 */
export function parseDoorsJson(doorsJson) {
  if (!doorsJson || typeof doorsJson !== 'string') return null
  try {
    const parsed = JSON.parse(doorsJson)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * @param {string|null|undefined} doorsJson - raw doors_json string
 * @param {string|null|undefined} date - YYYY-MM-DD festival day to look up
 * @returns {string|null} the "HH:MM" doors time for `date`, or null if absent/invalid
 */
export function getDoorsTimeForDate(doorsJson, date) {
  if (!date) return null
  const map = parseDoorsJson(doorsJson)
  const value = map?.[date]
  return typeof value === 'string' && DOORS_TIME_REGEX.test(value) ? value : null
}
