import { describe, expect, it } from 'vitest'
import { diffRoutes, resolveRouteDiff } from '../routeDiff'
import { prepareBands } from '../bandUtils'

describe('diffRoutes', () => {
  it('splits two routes into together / gain / lose', () => {
    const result = diffRoutes(['a', 'b', 'c'], ['b', 'c', 'd'])
    expect(result.together).toEqual(['b', 'c'])
    expect(result.gain).toEqual(['d'])
    expect(result.lose).toEqual(['a'])
  })

  it('reports everything as a gain when the recipient has no route', () => {
    const result = diffRoutes([], ['a', 'b'])
    expect(result.together).toEqual([])
    expect(result.gain).toEqual(['a', 'b'])
    expect(result.lose).toEqual([])
  })

  it('reports no gain and no loss for identical routes', () => {
    // Same members, different order. This asserts membership only: `together`
    // follows the incoming route's order (covered by the ordering test below),
    // and pinning it here would make the case fail for a reason unrelated to
    // what it exists to check.
    const result = diffRoutes(['a', 'b'], ['b', 'a'])
    expect([...result.together].sort()).toEqual(['a', 'b'])
    expect(result.gain).toEqual([])
    expect(result.lose).toEqual([])
  })

  it('treats every own pick as at risk when the shared route is empty', () => {
    // Replace with an empty route would drop everything, so `lose` must say so
    // rather than quietly reporting no difference.
    const result = diffRoutes(['a', 'b'], [])
    expect(result.together).toEqual([])
    expect(result.gain).toEqual([])
    expect(result.lose).toEqual(['a', 'b'])
  })

  it('preserves each source route’s own order', () => {
    // The caller re-sorts by schedule position; the helper must not impose an
    // order of its own, or a caller that skips sorting silently reorders sets.
    const result = diffRoutes(['c', 'a'], ['a', 'z'])
    expect(result.together).toEqual(['a'])
    expect(result.gain).toEqual(['z'])
    expect(result.lose).toEqual(['c'])
  })

  it('deduplicates repeated ids', () => {
    const result = diffRoutes(['a', 'a', 'b'], ['b', 'b', 'c'])
    expect(result.together).toEqual(['b'])
    expect(result.gain).toEqual(['c'])
    expect(result.lose).toEqual(['a'])
  })

  it.each([
    ['both null', null, null],
    ['mine null', null, ['a']],
    ['theirs null', ['a'], null],
    ['both undefined', undefined, undefined],
  ])('does not throw on missing input (%s)', (_label, mine, theirs) => {
    expect(() => diffRoutes(mine, theirs)).not.toThrow()
  })

  it('treats a null own route as an empty one rather than a missing diff', () => {
    const result = diffRoutes(null, ['a'])
    expect(result.together).toEqual([])
    expect(result.gain).toEqual(['a'])
    expect(result.lose).toEqual([])
  })
})

describe('resolveRouteDiff', () => {
  // Built through the real prepareBands so the after-midnight offset under test
  // is the production one, not a hand-rolled imitation of it.
  const raw = [
    { id: 'early', name: 'Openers', date: '2026-10-11', startTime: '20:00', endTime: '20:45', venue: 'Roost' },
    { id: 'mid', name: 'Middle', date: '2026-10-11', startTime: '22:30', endTime: '23:15', venue: 'Room 47' },
    {
      id: 'afterMidnight',
      name: 'Last Call',
      date: '2026-10-11',
      startTime: '01:00',
      endTime: '01:45',
      venue: 'Blue Room',
    },
  ]
  const bands = prepareBands(raw)

  it('resolves ids to bands and orders them by schedule position', () => {
    const result = resolveRouteDiff([], ['mid', 'early'], bands)
    expect(result.gain.map(b => b.id)).toEqual(['early', 'mid'])
  })

  it('sorts an after-midnight set last, not first', () => {
    // 01:00 is chronologically the smallest clock time but belongs at the END
    // of the evening. Sorting on raw start time would put it first — the
    // recurring bug class this ordering exists to avoid.
    const result = resolveRouteDiff([], ['afterMidnight', 'early', 'mid'], bands)
    expect(result.gain.map(b => b.id)).toEqual(['early', 'mid', 'afterMidnight'])
  })

  it('drops ids with no matching band instead of rendering a blank row', () => {
    // A shared route can name a performance deleted since it was sent (#733).
    const result = resolveRouteDiff([], ['early', 'no-such-band'], bands)
    expect(result.gain.map(b => b.id)).toEqual(['early'])
  })

  it('splits resolved bands across all three buckets', () => {
    const result = resolveRouteDiff(['early', 'mid'], ['mid', 'afterMidnight'], bands)
    expect(result.together.map(b => b.id)).toEqual(['mid'])
    expect(result.gain.map(b => b.id)).toEqual(['afterMidnight'])
    expect(result.lose.map(b => b.id)).toEqual(['early'])
  })

  it('does not throw when the band list is missing', () => {
    expect(() => resolveRouteDiff(['a'], ['b'], undefined)).not.toThrow()
  })

  describe('hasRouteChanges', () => {
    it('is false for genuinely identical routes', () => {
      expect(resolveRouteDiff(['early', 'mid'], ['mid', 'early'], bands).hasRouteChanges).toBe(false)
    })

    it('is true when a stored id names a performance that no longer exists', () => {
      // The stale id resolves to no band, so it disappears from the rendered
      // `lose` rows — but Replace still drops it from storage, so the routes
      // are not identical and the dialog must not claim they are.
      const result = resolveRouteDiff(['early', 'mid', 'deleted-perf'], ['early', 'mid'], bands)
      expect(result.lose).toEqual([])
      expect(result.hasRouteChanges).toBe(true)
    })

    it('is true when the incoming route names a deleted performance', () => {
      const result = resolveRouteDiff(['early'], ['early', 'deleted-perf'], bands)
      expect(result.gain).toEqual([])
      expect(result.hasRouteChanges).toBe(true)
    })

    it('is true whenever there is a visible gain or loss', () => {
      expect(resolveRouteDiff(['early'], ['early', 'mid'], bands).hasRouteChanges).toBe(true)
      expect(resolveRouteDiff(['early', 'mid'], ['early'], bands).hasRouteChanges).toBe(true)
    })
  })
})
