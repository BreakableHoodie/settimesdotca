import { describe, expect, it } from 'vitest'
import { parseDoorsJsonToForm, serializeDoorsForm } from '../doorsFormData'

const TWO_DAYS = ['2026-08-02', '2026-08-03']

describe('parseDoorsJsonToForm', () => {
  it('maps a valid JSON string onto matching day keys', () => {
    const doorsJson = JSON.stringify({ '2026-08-02': '16:00', '2026-08-03': '10:00' })
    expect(parseDoorsJsonToForm(doorsJson, TWO_DAYS)).toEqual({
      '2026-08-02': '16:00',
      '2026-08-03': '10:00',
    })
  })

  it('accepts an already-parsed object (not just a JSON string)', () => {
    const doorsJson = { '2026-08-02': '16:00' }
    expect(parseDoorsJsonToForm(doorsJson, TWO_DAYS)).toEqual({
      '2026-08-02': '16:00',
      '2026-08-03': '',
    })
  })

  it('returns all-empty for malformed JSON rather than throwing', () => {
    expect(parseDoorsJsonToForm('{not valid json', TWO_DAYS)).toEqual({
      '2026-08-02': '',
      '2026-08-03': '',
    })
  })

  it('returns all-empty for a JSON array (not an object map)', () => {
    expect(parseDoorsJsonToForm('["16:00", "10:00"]', TWO_DAYS)).toEqual({
      '2026-08-02': '',
      '2026-08-03': '',
    })
  })

  it('returns all-empty for null doors_json', () => {
    expect(parseDoorsJsonToForm(null, TWO_DAYS)).toEqual({
      '2026-08-02': '',
      '2026-08-03': '',
    })
  })

  it('returns all-empty for undefined doors_json', () => {
    expect(parseDoorsJsonToForm(undefined, TWO_DAYS)).toEqual({
      '2026-08-02': '',
      '2026-08-03': '',
    })
  })

  it('returns all-empty for an empty string', () => {
    expect(parseDoorsJsonToForm('', TWO_DAYS)).toEqual({
      '2026-08-02': '',
      '2026-08-03': '',
    })
  })

  it('drops keys outside the current day span', () => {
    const doorsJson = JSON.stringify({ '2026-08-02': '16:00', '2026-08-09': '18:00' })
    expect(parseDoorsJsonToForm(doorsJson, TWO_DAYS)).toEqual({
      '2026-08-02': '16:00',
      '2026-08-03': '',
    })
  })

  it('ignores non-string time values for an otherwise-matching key', () => {
    const doorsJson = { '2026-08-02': 1600, '2026-08-03': '10:00' }
    expect(parseDoorsJsonToForm(doorsJson, TWO_DAYS)).toEqual({
      '2026-08-02': '',
      '2026-08-03': '10:00',
    })
  })

  it('returns an empty object when days is empty', () => {
    expect(parseDoorsJsonToForm(JSON.stringify({ '2026-08-02': '16:00' }), [])).toEqual({})
  })

  it('handles a single-day event (one key)', () => {
    expect(parseDoorsJsonToForm(JSON.stringify({ '2026-08-02': '19:00' }), ['2026-08-02'])).toEqual({
      '2026-08-02': '19:00',
    })
  })
})

describe('serializeDoorsForm', () => {
  it('serializes a normal fully-filled map to a JSON string', () => {
    const result = serializeDoorsForm({ '2026-08-02': '16:00', '2026-08-03': '10:00' }, TWO_DAYS)
    expect(JSON.parse(result)).toEqual({ '2026-08-02': '16:00', '2026-08-03': '10:00' })
  })

  it('prunes keys outside the CURRENT span (stale-keys gap, #573)', () => {
    // Event's span shrank to a single day, but the form still carries a
    // leftover value for the day that's no longer in range.
    const result = serializeDoorsForm({ '2026-08-02': '16:00', '2026-08-03': '10:00' }, ['2026-08-02'])
    expect(JSON.parse(result)).toEqual({ '2026-08-02': '16:00' })
  })

  it('omits empty-string values', () => {
    const result = serializeDoorsForm({ '2026-08-02': '16:00', '2026-08-03': '' }, TWO_DAYS)
    expect(JSON.parse(result)).toEqual({ '2026-08-02': '16:00' })
  })

  it('returns null when every value is empty', () => {
    expect(serializeDoorsForm({ '2026-08-02': '', '2026-08-03': '' }, TWO_DAYS)).toBeNull()
  })

  it('returns null for an empty formValues object', () => {
    expect(serializeDoorsForm({}, TWO_DAYS)).toBeNull()
  })

  it('returns null when days is empty, even with values present', () => {
    expect(serializeDoorsForm({ '2026-08-02': '16:00' }, [])).toBeNull()
  })

  it('round-trips through parseDoorsJsonToForm for the same day span', () => {
    const original = JSON.stringify({ '2026-08-02': '16:00', '2026-08-03': '10:00' })
    const form = parseDoorsJsonToForm(original, TWO_DAYS)
    const result = serializeDoorsForm(form, TWO_DAYS)
    expect(JSON.parse(result)).toEqual(JSON.parse(original))
  })

  it('round-trip through a shrunk span drops the pruned day permanently', () => {
    const original = JSON.stringify({ '2026-08-02': '16:00', '2026-08-03': '10:00' })
    const form = parseDoorsJsonToForm(original, TWO_DAYS)
    // Event shrank to day 1 only after parsing.
    const result = serializeDoorsForm(form, ['2026-08-02'])
    expect(JSON.parse(result)).toEqual({ '2026-08-02': '16:00' })
  })
})
