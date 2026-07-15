import { describe, expect, it } from 'vitest'
import { getDaysAwayAriaLabel, getDaysAwayLabel } from '../daysAway'

describe('getDaysAwayLabel', () => {
  it('reads "Tonight" on the event\'s own day (#596 — was "0 days away")', () => {
    expect(getDaysAwayLabel(0)).toBe('Tonight')
  })

  it('singularizes for exactly 1 day away', () => {
    expect(getDaysAwayLabel(1)).toBe('1 day away')
  })

  it('pluralizes for more than 1 day away', () => {
    expect(getDaysAwayLabel(2)).toBe('2 days away')
    expect(getDaysAwayLabel(14)).toBe('14 days away')
  })
})

describe('getDaysAwayAriaLabel', () => {
  it('describes the event as today when 0 days away', () => {
    expect(getDaysAwayAriaLabel(0)).toBe('Tonight — the event is today')
  })

  it('singularizes for exactly 1 day away', () => {
    expect(getDaysAwayAriaLabel(1)).toBe('1 day until the event')
  })

  it('pluralizes for more than 1 day away', () => {
    expect(getDaysAwayAriaLabel(2)).toBe('2 days until the event')
  })
})
