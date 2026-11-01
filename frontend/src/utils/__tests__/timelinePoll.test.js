import { describe, expect, it } from 'vitest'
import { POLL_LIVE_MS, POLL_OFF_SEASON_MS, POLL_UPCOMING_MS, timelinePollDelayMs } from '../timelinePoll'

describe('timelinePollDelayMs (#1412)', () => {
  it('polls every minute while something is on, and before the first response', () => {
    expect(timelinePollDelayMs({ now: [{ id: 1 }], upcoming: [{ id: 2 }], past: [] })).toBe(POLL_LIVE_MS)
    expect(timelinePollDelayMs(null)).toBe(POLL_LIVE_MS)
  })

  it('slows to 5 minutes while an edition is only upcoming', () => {
    expect(timelinePollDelayMs({ now: [], upcoming: [{ id: 2 }], past: [{ id: 3 }] })).toBe(POLL_UPCOMING_MS)
  })

  it('slows to 15 minutes between seasons, when only past editions remain', () => {
    expect(timelinePollDelayMs({ now: [], upcoming: [], past: [{ id: 3 }] })).toBe(POLL_OFF_SEASON_MS)
    expect(POLL_OFF_SEASON_MS).toBe(15 * POLL_LIVE_MS)
  })
})
