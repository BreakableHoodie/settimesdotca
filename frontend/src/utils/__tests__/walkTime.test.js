import { describe, it, expect } from 'vitest'
import { walkMinutesBetween, haversineMeters } from '../walkTime'

describe('walkTime', () => {
  it('returns null when either venue lacks usable coordinates', () => {
    const ok = { latitude: 43.46, longitude: -80.52 }
    expect(walkMinutesBetween(null, ok)).toBeNull()
    expect(walkMinutesBetween(ok, {})).toBeNull()
    expect(walkMinutesBetween({ latitude: 43.46 }, ok)).toBeNull()
    expect(walkMinutesBetween({ latitude: 'x', longitude: 'y' }, ok)).toBeNull()
  })

  it('computes a small walk for nearby King St venues', () => {
    // ~320 m apart (≈ 0.0029° latitude) → ~4 min at 80 m/min
    const a = { latitude: 43.4795, longitude: -80.5235 }
    const b = { latitude: 43.4824, longitude: -80.5235 }
    const minutes = walkMinutesBetween(a, b)
    expect(minutes).toBeGreaterThanOrEqual(3)
    expect(minutes).toBeLessThanOrEqual(6)
  })

  it('haversine distance is ~0 for identical points', () => {
    expect(haversineMeters(43.46, -80.52, 43.46, -80.52)).toBeCloseTo(0, 5)
  })
})
