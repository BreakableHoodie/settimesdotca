// Codes are derived, not stored: no migration, and a venue renamed in admin
// cannot leave a stale code behind. Uniqueness is resolved ACROSS THE SET rather
// than per-name, because collisions only exist relative to the other venues on
// the same bill.
import { describe, expect, it } from 'vitest'
import { venueCodes } from '../venueCode'

describe('venueCodes', () => {
  it('takes the first four characters of the first significant word', () => {
    const codes = venueCodes(['Prohibition Warehouse'])
    expect(codes.get('Prohibition Warehouse')).toBe('PROH')
  })

  it('skips a leading article, which carries no identity', () => {
    // "The Copper Mug" reading THE would be useless on a schedule board.
    expect(venueCodes(['The Copper Mug']).get('The Copper Mug')).toBe('COPP')
  })

  it('separates the Vol 18 collision case', () => {
    // Both are at 28 King St N and both start from "Revive".
    const names = ['Revive Karaoke', 'Blue Room (Inside Revive Karaoke)', 'Princess Cafe', 'Prohibition Warehouse']
    const codes = venueCodes(names)
    const values = names.map(n => codes.get(n))
    expect(new Set(values).size, `codes collided: ${values.join(', ')}`).toBe(names.length)
    expect(codes.get('Blue Room (Inside Revive Karaoke)')).toBe('BLUE')
    expect(codes.get('Revive Karaoke')).toBe('REVI')
  })

  it('is stable regardless of input order', () => {
    const a = venueCodes(['Revive Karaoke', 'Room 47'])
    const b = venueCodes(['Room 47', 'Revive Karaoke'])
    expect(a.get('Room 47')).toBe(b.get('Room 47'))
    expect(a.get('Revive Karaoke')).toBe(b.get('Revive Karaoke'))
  })

  it('never returns more than four characters', () => {
    const codes = venueCodes(['The Extremely Long Venue Name Company'])
    expect(codes.get('The Extremely Long Venue Name Company').length).toBeLessThanOrEqual(4)
  })

  it('ignores empty and missing names rather than emitting a blank chip', () => {
    const codes = venueCodes(['', null, undefined, 'Roost'])
    expect(codes.get('Roost')).toBe('ROOS')
    expect(codes.has('')).toBe(false)
  })
})
