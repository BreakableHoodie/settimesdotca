import { describe, it, expect, beforeEach } from 'vitest'
import { hasAnySchedule, getScheduleEventSlug, saveSelectedBands, SELECTED_BANDS_KEY } from '../scheduleStorage'

const DATES_KEY = '__dates__'

// Returns a YYYY-MM-DD date offset from today by the given number of days.
function offsetDate(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function setStorage(obj) {
  localStorage.setItem(SELECTED_BANDS_KEY, JSON.stringify(obj))
}

beforeEach(() => {
  localStorage.clear()
})

describe('hasAnySchedule', () => {
  it('returns false when localStorage is empty', () => {
    expect(hasAnySchedule()).toBe(false)
  })

  it('returns false when all events are past', () => {
    setStorage({
      'past-fest': ['band-1'],
      [DATES_KEY]: { 'past-fest': offsetDate(-1) },
    })
    expect(hasAnySchedule()).toBe(false)
  })

  it('returns true for a future event with bands', () => {
    setStorage({
      'summer-fest': ['band-1'],
      [DATES_KEY]: { 'summer-fest': offsetDate(30) },
    })
    expect(hasAnySchedule()).toBe(true)
  })

  it('returns true for a same-day event (today is not stale)', () => {
    setStorage({
      'today-fest': ['band-1'],
      [DATES_KEY]: { 'today-fest': offsetDate(0) },
    })
    expect(hasAnySchedule()).toBe(true)
  })

  it('returns true for a legacy entry with no __dates__ metadata', () => {
    setStorage({ 'legacy-slug': ['band-1'] })
    expect(hasAnySchedule()).toBe(true)
  })

  it('returns false when the event has an empty band list', () => {
    setStorage({
      'empty-fest': [],
      [DATES_KEY]: { 'empty-fest': offsetDate(30) },
    })
    expect(hasAnySchedule()).toBe(false)
  })
})

describe('getScheduleEventSlug', () => {
  it('returns null when localStorage is empty', () => {
    expect(getScheduleEventSlug()).toBeNull()
  })

  it('returns null for a past event', () => {
    setStorage({
      'past-slug': ['band-1'],
      [DATES_KEY]: { 'past-slug': offsetDate(-1) },
    })
    expect(getScheduleEventSlug()).toBeNull()
  })

  it('returns the slug for a future event', () => {
    setStorage({
      'future-slug': ['band-1'],
      [DATES_KEY]: { 'future-slug': offsetDate(10) },
    })
    expect(getScheduleEventSlug()).toBe('future-slug')
  })

  it('returns the slug for a legacy entry with no __dates__ metadata', () => {
    setStorage({ 'legacy-slug': ['band-2'] })
    expect(getScheduleEventSlug()).toBe('legacy-slug')
  })

  it('skips past events and returns the first non-past slug', () => {
    setStorage({
      'past-slug': ['band-1'],
      'future-slug': ['band-2'],
      [DATES_KEY]: {
        'past-slug': offsetDate(-1),
        'future-slug': offsetDate(5),
      },
    })
    expect(getScheduleEventSlug()).toBe('future-slug')
  })
})

describe('saveSelectedBands + hasAnySchedule round-trip', () => {
  it('marks event as non-stale when saved with a future date', () => {
    saveSelectedBands('round-trip', ['band-1'], offsetDate(7))
    expect(hasAnySchedule()).toBe(true)
    expect(getScheduleEventSlug()).toBe('round-trip')
  })

  it('marks event as stale when saved with a past date', () => {
    saveSelectedBands('old-trip', ['band-1'], offsetDate(-1))
    expect(hasAnySchedule()).toBe(false)
    expect(getScheduleEventSlug()).toBeNull()
  })
})

describe('multi-day event staleness (#542 PR-1 regression)', () => {
  // Reproduces the exact production bug: a multi-day event that started
  // yesterday and ends tomorrow must never be treated as stale mid-run.
  // App.jsx / BandProfilePage.jsx previously called saveSelectedBands with
  // only the event's START date (eventData.date), so isEventStale() (a
  // straight YYYY-MM-DD string comparison against today) started marking the
  // fan's saved schedule stale on day 2 — silently wiping their selections
  // mid-festival. The fix passes end_date (falling back to date for
  // single-day events) instead.

  it('is NOT stale when saved with the event end_date, even though the event started yesterday', () => {
    // Simulates the fixed call sites: callers now pass
    // eventData.end_date || eventData.date. A multi-day event spanning
    // yesterday -> tomorrow must keep the fan's schedule live throughout.
    saveSelectedBands('multiday-fest', ['band-1', 'band-2'], offsetDate(1))
    expect(hasAnySchedule()).toBe(true)
    expect(getScheduleEventSlug()).toBe('multiday-fest')
  })

  it('documents the bug: saving with only the start date would wrongly mark a still-running multi-day event stale', () => {
    // Pins down the pre-fix behavior for the exact date value the old
    // call sites passed (eventData.date, the START date) — proving
    // isEventStale() alone was never the bug; the caller's date choice was.
    saveSelectedBands('multiday-fest-bug', ['band-1'], offsetDate(-1))
    expect(hasAnySchedule()).toBe(false)
    expect(getScheduleEventSlug()).toBeNull()
  })
})
