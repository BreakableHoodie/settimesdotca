import { describe, expect, it } from 'vitest'
import { buildBandProfileHref, buildBandProfileState } from '../bandProfileLink'

describe('band profile links', () => {
  it('uses a numeric band profile id when available', () => {
    expect(buildBandProfileHref({ id: 206, name: 'The Band' })).toBe('/band/206')
    expect(buildBandProfileHref({ id: '206', name: 'The Band' })).toBe('/band/206')
  })

  it('falls back to the band slug without an event query parameter', () => {
    expect(buildBandProfileHref({ name: 'The Band' })).toBe('/band/the-band')
  })

  it('keeps event context in router state', () => {
    expect(buildBandProfileState('lwbc18')).toEqual({ fromEventSlug: 'lwbc18' })
    expect(buildBandProfileState()).toBeUndefined()
  })
})
