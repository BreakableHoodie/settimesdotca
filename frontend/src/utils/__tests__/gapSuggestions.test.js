import { describe, expect, it } from 'vitest'
import { seenMinutes, suggestGapFillers } from '../gapSuggestions'
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

  it('orders by walk time, then start time when every candidate covers the gap equally', () => {
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

  // #972. Walk time used to be the PRIMARY key, which decided the headline
  // suggestion on the key with the least dynamic range: across all 15 Vol. 17
  // venue pairs walk time spans 1-3 minutes, while gap coverage spans 5-30.
  // Measured over every real Vol. 17 / BF2 performance, that got the top pick
  // wrong in 7 of 26 scenarios -- always trading 10-25 minutes of music to save
  // one minute of walking. These lock in the corrected ranking.
  describe('ranks by the gap minutes the fan actually sees (#972)', () => {
    // The exact shape of the real Vol. 17 case: "Mixed Feelings" goes dark at
    // 20:00, and the old sort offered Rhx34 (5 minutes of the hole, 1 minute
    // away) over Rolodex Darko (the whole hole, 3 minutes away).
    it('prefers a candidate that fills the gap over a nearer one filling a sliver', () => {
      const [cancelledBand, sliver, filler] = prepare(
        makeBand('cancelled', '20:00', '20:30', { is_cancelled: 1 }),
        makeBand('sliver', '20:25', '20:55', { venue_lat: 43.4801 }),
        makeBand('filler', '20:00', '20:30', { venue_lat: 43.4824 })
      )

      const suggestions = suggestGapFillers({
        cancelledBand,
        myBands: [cancelledBand],
        allBands: [cancelledBand, sliver, filler],
      })

      expect(suggestions.map(s => s.band.id)).toEqual(['filler', 'sliver'])
      // The nearer set really is nearer -- the ranking is overriding proximity,
      // not benefiting from a coincidence where proximity already agreed.
      expect(suggestions[0].walkMinutes).toBeGreaterThan(suggestions[1].walkMinutes)
    })

    // A walk the fan completes BEFORE the set starts costs them nothing. An
    // earlier version deducted the whole walk unconditionally and would have
    // ranked this reachable 35-minute set below the 30-minute one.
    it('does not penalise a long walk the fan has time to make', () => {
      const [cancelledBand, near, reachable] = prepare(
        makeBand('cancelled', '20:00', '21:00', { is_cancelled: 1 }),
        makeBand('near', '20:30', '21:00', { venue_lat: 43.4801 }),
        makeBand('reachable', '20:25', '21:00', { venue_lat: 43.4944 })
      )

      const suggestions = suggestGapFillers({
        cancelledBand,
        myBands: [cancelledBand],
        allBands: [cancelledBand, near, reachable],
      })

      // Leaving at 20:00, a 20-minute walk arrives at 20:20 -- five minutes
      // before the set starts, so all 35 of its minutes count.
      expect(suggestions[1].walkMinutes).toBe(1)
      expect(suggestions.map(s => s.band.id)).toEqual(['reachable', 'near'])
    })

    // ...but a walk that makes the fan LATE costs exactly the minutes it eats.
    // This is why the key is minutes seen and not raw gap coverage: real data
    // cannot separate the two, because every Vol. 17 venue is within 3 minutes.
    it('does not send the fan across town to arrive late for a longer set', () => {
      const [cancelledBand, near, far] = prepare(
        makeBand('cancelled', '20:00', '21:00', { is_cancelled: 1 }),
        makeBand('near', '20:30', '21:00', { venue_lat: 43.4801 }),
        makeBand('far', '20:05', '21:00', { venue_lat: 43.5088 })
      )

      // `far` covers far more of the gap on paper, so ranking on raw coverage
      // would pick it: 55 minutes against 30.
      expect(seenMinutes(far, cancelledBand, cancelledBand.startMs, 0)).toBeGreaterThan(
        seenMinutes(near, cancelledBand, cancelledBand.startMs, 0)
      )

      const suggestions = suggestGapFillers({
        cancelledBand,
        myBands: [cancelledBand],
        allBands: [cancelledBand, near, far],
      })

      // A 40-minute walk arrives at 20:40, so only 20 of those 55 minutes are
      // ever seen -- against 30 for the set next door.
      expect(suggestions[1].walkMinutes).toBe(40)
      expect(suggestions.map(s => s.band.id)).toEqual(['near', 'far'])
    })

    it('breaks a tie on equal minutes seen by preferring the shorter walk', () => {
      const [cancelledBand, farther, nearer] = prepare(
        makeBand('cancelled', '20:00', '21:00', { is_cancelled: 1 }),
        makeBand('farther', '20:30', '21:00', { venue_lat: 43.4824 }),
        makeBand('nearer', '20:30', '21:00', { venue_lat: 43.4801 })
      )

      // Identical windows, and both walks finish before 20:30, so both are worth
      // the same 30 minutes and only the tiebreak separates them.
      expect(
        suggestGapFillers({
          cancelledBand,
          myBands: [cancelledBand],
          allBands: [cancelledBand, farther, nearer],
        }).map(s => s.band.id)
      ).toEqual(['nearer', 'farther'])
    })

    it('leaves when the prior set ends, not when the gap opens', () => {
      // departureMs is paired with the walk source. Holding an earlier set means
      // the fan is free from ITS end, which can be well before the gap opens --
      // and that head start is what makes the distant set reachable at all.
      const [cancelledBand, held, distant, close] = prepare(
        makeBand('cancelled', '21:00', '22:00', { is_cancelled: 1 }),
        makeBand('held', '20:00', '20:30'),
        makeBand('distant', '21:00', '22:00', { venue_lat: 43.5088 }),
        makeBand('close', '21:30', '22:00', { venue_lat: 43.4836 })
      )

      const suggestions = suggestGapFillers({
        cancelledBand,
        myBands: [held, cancelledBand],
        allBands: [cancelledBand, held, distant, close],
      })

      // Free at 20:30, the 40-minute walk lands at 21:10 and `distant` is worth
      // 50 minutes, beating `close` at 30. Measured from 21:00 instead it would
      // land at 21:40, be worth only 20, and the order would invert.
      expect(suggestions.map(s => s.band.id)).toEqual(['distant', 'close'])
      expect(seenMinutes(distant, cancelledBand, held.endMs, 40)).toBe(50)
      expect(seenMinutes(distant, cancelledBand, cancelledBand.startMs, 40)).toBe(20)
    })
  })

  describe('seenMinutes', () => {
    it('counts only the gap minutes remaining after the fan arrives', () => {
      const [gap, band] = prepare(makeBand('gap', '20:00', '21:00'), makeBand('band', '20:00', '21:00'))

      expect(seenMinutes(band, gap, gap.startMs, 0)).toBe(60)
      expect(seenMinutes(band, gap, gap.startMs, 15)).toBe(45)
    })

    it('treats an unknown walk as instant rather than poisoning the score', () => {
      // walkMinutesBetween returns null for a venue with no coordinates, and the
      // sort already puts those last -- but the value still has to be a number,
      // or NaN silently makes every comparison against it false.
      //
      // The OMITTED case is the one with teeth: null * 60000 is 0 in JS, so the
      // null assertion below survives dropping the ?? 0 guard, while the omitted
      // one yields NaN and fails. Both are kept -- null is what the engine
      // actually passes, undefined is what proves the guard is load-bearing.
      const [gap, band] = prepare(makeBand('gap', '20:00', '21:00'), makeBand('band', '20:00', '21:00'))

      expect(seenMinutes(band, gap, gap.startMs, null)).toBe(60)
      expect(seenMinutes(band, gap, gap.startMs)).toBe(60)
    })

    it('clamps the end at the gap, so overrun earns no extra credit', () => {
      // The candidate is still suggested -- the filter never rejects one that
      // runs long -- it just does not outrank a set that fills the dead time now.
      const [gap, overrunning] = prepare(makeBand('gap', '20:00', '21:00'), makeBand('overrunning', '20:00', '23:00'))

      expect(seenMinutes(overrunning, gap, gap.startMs, 0)).toBe(60)
    })

    it('does not count a set that began before the gap opened', () => {
      // Unreachable through suggestGapFillers -- its filter admits only
      // candidates starting at or after the gap opens -- but seenMinutes is
      // exported, and its contract is gap minutes, not set minutes.
      // Departing at 19:30 -- a fan freed by an earlier set can arrive before the
      // gap even opens, which is the only way `from` lands before `gap.startMs`.
      const [gap, early] = prepare(makeBand('gap', '20:00', '21:00'), makeBand('early', '19:30', '20:30'))

      expect(seenMinutes(early, gap, early.startMs, 0)).toBe(30)
    })

    it('clamps to zero when the fan arrives after the gap has closed', () => {
      const [gap, band] = prepare(makeBand('gap', '20:00', '21:00'), makeBand('band', '20:30', '21:00'))

      expect(seenMinutes(band, gap, gap.startMs, 180)).toBe(0)
    })
  })
})
