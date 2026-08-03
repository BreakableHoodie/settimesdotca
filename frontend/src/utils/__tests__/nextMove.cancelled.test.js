import { describe, expect, it } from 'vitest'
import { computeNextMove } from '../nextMove'

const at = iso => +new Date(iso)

describe('computeNextMove — cancelled sets', () => {
  const now = new Date('2026-08-07T20:00:00-04:00')

  const cancelledSoon = {
    id: 1,
    name: 'Deer Fang',
    venue: 'Room 47',
    is_cancelled: 1,
    startMs: at('2026-08-07T20:15:00-04:00'),
    endMs: at('2026-08-07T20:45:00-04:00'),
  }
  const scheduledLater = {
    id: 2,
    name: 'Sam Nabi',
    venue: 'Roost',
    is_cancelled: 0,
    startMs: at('2026-08-07T21:00:00-04:00'),
    endMs: at('2026-08-07T21:40:00-04:00'),
  }

  it('never routes a fan to a cancelled set', () => {
    // Without the guard the sooner (cancelled) set wins on start time.
    const state = computeNextMove([cancelledSoon, scheduledLater], now)
    expect(state.nextBand?.name).toBe('Sam Nabi')
  })

  it('still routes to the sooner set when it is NOT cancelled', () => {
    // Proves the assertion above turns on is_cancelled, not on ordering.
    const state = computeNextMove([{ ...cancelledSoon, is_cancelled: 0 }, scheduledLater], now)
    expect(state.nextBand?.name).toBe('Deer Fang')
  })

  it('does not report a cancelled set as playing now', () => {
    const playingButCancelled = {
      ...cancelledSoon,
      startMs: at('2026-08-07T19:45:00-04:00'),
      endMs: at('2026-08-07T20:30:00-04:00'),
    }
    const state = computeNextMove([playingButCancelled], now)
    expect(state.nowBand).toBeFalsy()
  })
})
