import { describe, it, expect } from 'vitest'
import { parseDoorsJson, getDoorsTimeForDate } from '../doorsTime'

describe('parseDoorsJson (#569)', () => {
  it('parses a valid map', () => {
    expect(parseDoorsJson('{"2026-07-10":"16:00","2026-07-11":"10:00"}')).toEqual({
      '2026-07-10': '16:00',
      '2026-07-11': '10:00',
    })
  })

  it('returns null for null/undefined/empty input', () => {
    expect(parseDoorsJson(null)).toBeNull()
    expect(parseDoorsJson(undefined)).toBeNull()
    expect(parseDoorsJson('')).toBeNull()
  })

  it('returns null for malformed JSON (never throws)', () => {
    expect(parseDoorsJson('{not valid json')).toBeNull()
  })

  it('returns null for a non-object JSON value (array, string, number)', () => {
    expect(parseDoorsJson('[]')).toBeNull()
    expect(parseDoorsJson('"18:30"')).toBeNull()
    expect(parseDoorsJson('42')).toBeNull()
  })

  it('returns null for a non-string input', () => {
    expect(parseDoorsJson({ '2026-07-10': '16:00' })).toBeNull()
  })
})

describe('getDoorsTimeForDate (#569)', () => {
  const doorsJson = JSON.stringify({ '2026-07-10': '16:00', '2026-07-11': '10:00' })

  it('returns the time for a date present in the map', () => {
    expect(getDoorsTimeForDate(doorsJson, '2026-07-10')).toBe('16:00')
    expect(getDoorsTimeForDate(doorsJson, '2026-07-11')).toBe('10:00')
  })

  it('returns null for a date absent from the map', () => {
    expect(getDoorsTimeForDate(doorsJson, '2026-07-12')).toBeNull()
  })

  it('returns null when doorsJson is absent', () => {
    expect(getDoorsTimeForDate(null, '2026-07-10')).toBeNull()
    expect(getDoorsTimeForDate(undefined, '2026-07-10')).toBeNull()
  })

  it('returns null when date is absent', () => {
    expect(getDoorsTimeForDate(doorsJson, null)).toBeNull()
    expect(getDoorsTimeForDate(doorsJson, undefined)).toBeNull()
  })

  it('returns null for a malformed time value in an otherwise-valid map', () => {
    expect(getDoorsTimeForDate('{"2026-07-10":"6:30 PM"}', '2026-07-10')).toBeNull()
    expect(getDoorsTimeForDate('{"2026-07-10":25}', '2026-07-10')).toBeNull()
  })

  it('returns null for malformed doorsJson', () => {
    expect(getDoorsTimeForDate('{not valid json', '2026-07-10')).toBeNull()
  })
})
