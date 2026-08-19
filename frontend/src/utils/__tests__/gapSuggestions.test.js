import { describe, expect, it } from 'vitest'
import { suggestGapFillers } from '../gapSuggestions'
import { prepareBands } from '../bandUtils'

const date = '2026-08-02'

function makeBand(id, startTime, endTime, overrides = {}) {
  return {
    id,
    name: id,
    date,
    startTime,
    endTime,
    venue: `Venue ${id}`,
    venue_lat: 43.48,
    venue_lng: -80.52,
    ...overrides,
  }
}

function prepare(...bands) {
  return prepareBands(bands)
}

describe('suggestGapFillers', () => {
  it('suggests a set that starts inside the cancelled window', () => {
    const [cancelledBand, candidate] = prepare(
      makeBand('cancelled', '20:00', '22:00', { is_cancelled: 1 }),
      makeBand('candidate', '21:00', '21:30')
    )

    expect(
      suggestGapFillers({ cancelledBand, myBands: [cancelledBand], allBands: [cancelledBand, candidate] })
    ).toEqual([{ band: candidate, walkMinutes: 1, startsAtMs: candidate.startMs }])
  })

  it('suggests nothing when there is nothing to suggest', () => {
    const [cancelledBand] = prepare(makeBand('cancelled', '20:00', '22:00', { is_cancelled: 1 }))

    expect(suggestGapFillers({ cancelledBand, myBands: [cancelledBand], allBands: [cancelledBand] })).toEqual([])
  })

  it('never suggests a cancelled set', () => {
    const [cancelledBand, candidate] = prepare(
      makeBand('cancelled', '20:00', '22:00', { is_cancelled: 1 }),
      makeBand('candidate', '21:00', '21:30', { is_cancelled: 1 })
    )

    expect(
      suggestGapFillers({ cancelledBand, myBands: [cancelledBand], allBands: [cancelledBand, candidate] })
    ).toEqual([])
  })

  it('never suggests a set the fan already has', () => {
    const [cancelledBand, candidate] = prepare(
      makeBand('cancelled', '20:00', '22:00', { is_cancelled: 1 }),
      makeBand('candidate', '21:00', '21:30')
    )

    expect(
      suggestGapFillers({ cancelledBand, myBands: [cancelledBand, candidate], allBands: [cancelledBand, candidate] })
    ).toEqual([])
  })

  it('rejects a candidate overlapping another set the fan still holds', () => {
    const [cancelledBand, heldBand, candidate] = prepare(
      makeBand('cancelled', '20:00', '22:00', { is_cancelled: 1 }),
      makeBand('held', '21:30', '22:30'),
      makeBand('candidate', '21:00', '22:00')
    )

    expect(
      suggestGapFillers({
        cancelledBand,
        myBands: [cancelledBand, heldBand],
        allBands: [cancelledBand, heldBand, candidate],
      })
    ).toEqual([])
  })

  it('finds an after-midnight candidate using prepared timestamps', () => {
    const [cancelledBand, candidate] = prepare(
      makeBand('cancelled', '23:30', '01:00', { is_cancelled: 1 }),
      makeBand('candidate', '00:15', '01:00')
    )

    expect(candidate.startMs).toBeGreaterThan(cancelledBand.startMs)
    expect(
      suggestGapFillers({ cancelledBand, myBands: [cancelledBand], allBands: [cancelledBand, candidate] })[0].band
    ).toBe(candidate)
  })

  it('orders by walk time, then start time', () => {
    const [cancelledBand, later, earlier, closest] = prepare(
      makeBand('cancelled', '20:00', '23:00', { is_cancelled: 1, venue_lat: 43.48, venue_lng: -80.52 }),
      makeBand('later', '21:30', '22:00', { venue_lat: 43.4824, venue_lng: -80.52 }),
      makeBand('earlier', '21:00', '21:30', { venue_lat: 43.4824, venue_lng: -80.52 }),
      makeBand('closest', '22:00', '22:30', { venue_lat: 43.4801, venue_lng: -80.52 })
    )

    expect(
      suggestGapFillers({
        cancelledBand,
        myBands: [cancelledBand],
        allBands: [cancelledBand, later, earlier, closest],
      }).map(suggestion => suggestion.band.id)
    ).toEqual(['closest', 'earlier', 'later'])
  })

  it('puts unknown walk times last and includes them', () => {
    const [cancelledBand, known, unknown] = prepare(
      makeBand('cancelled', '20:00', '23:00', { is_cancelled: 1 }),
      makeBand('known', '21:00', '21:30'),
      makeBand('unknown', '21:30', '22:00', { venue_lat: undefined, venue_lng: undefined })
    )

    const suggestions = suggestGapFillers({
      cancelledBand,
      myBands: [cancelledBand],
      allBands: [cancelledBand, known, unknown],
    })
    expect(suggestions.map(suggestion => suggestion.band.id)).toEqual(['known', 'unknown'])
    expect(suggestions[1].walkMinutes).toBeNull()
  })

  it('breaks a full tie on id so the cap is deterministic', () => {
    // Equal walk time AND equal start time: without a final tiebreak, which two
    // survive `maxSuggestions` would depend on the order allBands arrived in.
    const venue = { venue_lat: 43.4824, venue_lng: -80.52 }
    const [cancelledBand, charlie, alpha, bravo] = prepare(
      makeBand('cancelled', '20:00', '23:00', { is_cancelled: 1, ...venue }),
      makeBand('charlie', '21:00', '21:30', venue),
      makeBand('alpha', '21:00', '21:30', venue),
      makeBand('bravo', '21:00', '21:30', venue)
    )

    const forward = suggestGapFillers({
      cancelledBand,
      myBands: [cancelledBand],
      allBands: [cancelledBand, charlie, alpha, bravo],
      maxSuggestions: 2,
    })
    const reversed = suggestGapFillers({
      cancelledBand,
      myBands: [cancelledBand],
      allBands: [cancelledBand, bravo, alpha, charlie],
      maxSuggestions: 2,
    })

    expect(forward.map(s => s.band.id)).toEqual(['alpha', 'bravo'])
    expect(reversed.map(s => s.band.id)).toEqual(forward.map(s => s.band.id))
  })

  it('respects maxSuggestions', () => {
    const [cancelledBand, first, second] = prepare(
      makeBand('cancelled', '20:00', '23:00', { is_cancelled: 1 }),
      makeBand('first', '21:00', '21:30'),
      makeBand('second', '22:00', '22:30')
    )

    expect(
      suggestGapFillers({
        cancelledBand,
        myBands: [cancelledBand],
        allBands: [cancelledBand, first, second],
        maxSuggestions: 1,
      })
    ).toHaveLength(1)
  })

  it('does not throw on null or empty input', () => {
    expect(() => suggestGapFillers()).not.toThrow()
    expect(() => suggestGapFillers({ cancelledBand: null, myBands: [], allBands: [] })).not.toThrow()
    expect(suggestGapFillers({ cancelledBand: null, myBands: [], allBands: [] })).toEqual([])
    expect(suggestGapFillers({ cancelledBand: {}, myBands: [], allBands: [] })).toEqual([])
  })
})
