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
