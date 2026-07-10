/**
 * Doors-time form-state helpers for EventFormModal (#573).
 *
 * `events.doors_json` is a JSON map of festival date (YYYY-MM-DD) -> 24h
 * "HH:MM" gates-open time (see the `events.doors_json` invariant in
 * CLAUDE.md, #569). EventFormModal renders one <input type="time"> per
 * festival day and keeps that as flat `{ [date]: 'HH:MM' | '' }` form
 * state. These two pure functions convert between that flat state and the
 * `doors_json` payload shape, so the conversion logic can be unit-tested
 * without importing the modal component itself (see the coverage-ratchet
 * note in CLAUDE.md — importing a large untested component tanks the
 * global coverage number).
 */

/**
 * Parses a stored `doors_json` value into flat form state keyed by festival
 * day, always returning exactly one key per entry in `days`.
 *
 * Defensive: malformed JSON, a non-object/array payload, or a missing value
 * all collapse to an all-empty map rather than throwing — the form should
 * never crash on a legacy or hand-edited row. Keys outside `days` are
 * dropped (a stale doors_json key from a since-shrunk event span should
 * never surface a phantom input), and non-string values are ignored.
 *
 * @param {string|object|null|undefined} doorsJson - raw `event.doors_json`
 * @param {string[]} days - festival day values, e.g. from `enumerateFestivalDays`
 * @returns {Object<string, string>} `{ [date]: 'HH:MM' | '' }`, one key per day
 */
export function parseDoorsJsonToForm(doorsJson, days) {
  const dayList = Array.isArray(days) ? days : []
  const empty = Object.fromEntries(dayList.map(day => [day, '']))

  if (!doorsJson) {
    return empty
  }

  let parsed
  if (typeof doorsJson === 'object') {
    parsed = doorsJson
  } else if (typeof doorsJson === 'string') {
    try {
      parsed = JSON.parse(doorsJson)
    } catch {
      return empty
    }
  } else {
    return empty
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return empty
  }

  const dayValues = new Set(dayList)
  const result = { ...empty }
  for (const [date, time] of Object.entries(parsed)) {
    if (dayValues.has(date) && typeof time === 'string') {
      result[date] = time
    }
  }
  return result
}

/**
 * Serializes flat doors form state back into the `doors_json` payload shape
 * expected by the admin events API (a JSON string, or `null`).
 *
 * Entries for dates outside the CURRENT `days` span are pruned before
 * serializing — this is what closes the stale-keys gap named in #573: if
 * the admin shrinks the event's date span in the same edit, `days` (re-
 * derived from the live date/end_date form fields) no longer includes the
 * dropped day, so any leftover value for it is discarded here rather than
 * round-tripped back to the API as an orphaned key. Blank values are
 * omitted, and an all-empty result serializes to `null` (equivalent to "no
 * doors info", matching `validateDoorsJson` on the backend).
 *
 * @param {Object<string, string>} formValues - `{ [date]: 'HH:MM' | '' }`
 * @param {string[]} days - CURRENT festival day values to keep
 * @returns {string|null}
 */
export function serializeDoorsForm(formValues, days) {
  const dayValues = new Set(Array.isArray(days) ? days : [])
  const values = formValues && typeof formValues === 'object' ? formValues : {}

  const entries = Object.entries(values).filter(
    ([date, time]) => dayValues.has(date) && typeof time === 'string' && time !== ''
  )

  if (entries.length === 0) {
    return null
  }

  return JSON.stringify(Object.fromEntries(entries))
}
