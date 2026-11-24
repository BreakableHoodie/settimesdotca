import { describe, expect, test } from 'vitest'
import { buildBandTitle } from '../bandMeta'

const fixtures = [
  [{ name: 'Hamilton Act', genre: 'Punk', origin_city: 'Hamilton' }, 'Hamilton Act — Punk from Hamilton | SetTimes'],
  [
    { name: 'Kitchener Act', genre: 'Rock', origin_city: 'Kitchener', origin_region: 'Waterloo Region' },
    'Kitchener Act — Rock from Kitchener | SetTimes',
  ],
  [{ name: 'No Facts Act' }, 'No Facts Act | SetTimes'],
  [{ name: 'Legacy Act', genre: 'Jazz', origin: 'Toronto, ON' }, 'Legacy Act — Jazz from Toronto, ON | SetTimes'],
]

describe('buildBandTitle', () => {
  test.each(fixtures)('formats %j', (band, expected) => {
    expect(buildBandTitle(band)).toBe(expected)
  })
})
