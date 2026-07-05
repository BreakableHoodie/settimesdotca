import { describe, it, expect } from 'vitest'
import { FIELD_LIMITS, validatePasswordStrength, validateBandsData } from '../validation'

describe('FIELD_LIMITS', () => {
  it('exposes min/max bounds for the core fields (kept in sync with the backend)', () => {
    for (const key of ['email', 'password', 'bandName', 'eventName', 'eventSlug']) {
      expect(FIELD_LIMITS[key]).toBeDefined()
      expect(FIELD_LIMITS[key].max).toBeGreaterThan(FIELD_LIMITS[key].min)
    }
    expect(FIELD_LIMITS.password.min).toBe(12)
  })
})

describe('validatePasswordStrength', () => {
  it('requires a password', () => {
    expect(validatePasswordStrength('')).toBe('Password is required')
    expect(validatePasswordStrength(null)).toBe('Password is required')
  })

  it('enforces the minimum length', () => {
    expect(validatePasswordStrength('Ab1!aa')).toMatch(/at least 12 characters/)
  })

  it('requires an uppercase letter', () => {
    expect(validatePasswordStrength('abcdefgh1234!')).toMatch(/uppercase/)
  })

  it('requires a lowercase letter', () => {
    expect(validatePasswordStrength('ABCDEFGH1234!')).toMatch(/lowercase/)
  })

  it('requires a number', () => {
    expect(validatePasswordStrength('Abcdefghijk!')).toMatch(/number/)
  })

  it('requires a special character', () => {
    expect(validatePasswordStrength('Abcdefgh1234')).toMatch(/special character/)
  })

  it('returns null for a strong password meeting every rule', () => {
    expect(validatePasswordStrength('Abcdefgh1234!')).toBeNull()
  })
})

describe('validateBandsData', () => {
  it('rejects non-array input', () => {
    expect(validateBandsData(null)).toEqual({ valid: false, error: 'Bands data must be an array' })
    expect(validateBandsData({})).toEqual({ valid: false, error: 'Bands data must be an array' })
  })

  it('accepts an empty array', () => {
    expect(validateBandsData([])).toEqual({ valid: true })
  })

  it('requires each band to have a name string', () => {
    expect(validateBandsData([{ date: '2026-08-02' }])).toEqual({
      valid: false,
      error: 'Each band must have a name string',
    })
    expect(validateBandsData([{ name: 42, date: '2026-08-02' }])).toEqual({
      valid: false,
      error: 'Each band must have a name string',
    })
  })

  it('requires each band to have a date string', () => {
    expect(validateBandsData([{ name: 'The Band' }])).toEqual({
      valid: false,
      error: 'Each band must have a date string',
    })
  })

  it('accepts a well-formed bands array', () => {
    expect(validateBandsData([{ name: 'The Band', date: '2026-08-02' }])).toEqual({ valid: true })
  })
})
