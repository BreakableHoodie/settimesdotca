import { walkMinutesBetween } from './walkTime'

const MS_PER_MINUTE = 60000

function hasValidWindow(band) {
  return (
    band &&
    Number.isFinite(band.startMs) &&
    Number.isFinite(band.endMs) &&
    band.startMs > 0 &&
    band.endMs > band.startMs
  )
}

/**
 * Minutes of the gap the fan actually SEES, given when they can leave and how
 * long the walk takes.
 *
 * Walking only costs music when it makes the fan LATE. A 20-minute walk to a set
 * that starts 25 minutes from now costs nothing; the same walk to a set starting
 * in 5 minutes costs 15 minutes of it. Deducting the whole walk unconditionally
 * (the first version of this) understates every candidate the fan has time to
 * reach, and would have ranked a reachable 35-minute set below a 30-minute one.
 *
 * This is the ranking key rather than walk time alone (#972). Measured against
 * every real Vol. 17 and Buddies Fest 2 performance, walk time was the PRIMARY
 * key while having almost no dynamic range to sort on -- 1-3 minutes across all
 * 15 Vol. 17 venue pairs, since the whole crawl fits in ~250 m of King St N and
 * `walkMinutesBetween` floors at 1. Gap coverage spans 5-30 minutes over the
 * same scenarios. So the old ordering decided the headline suggestion on its
 * lowest-information key, and got it wrong in 7 of 26 scenarios -- every time
 * trading 10-25 minutes of music to save a single minute of walking.
 *
 * The end is clamped to the gap because the feature answers "what fills the hole
 * your cancelled set left". A candidate running past the gap is still SUGGESTED
 * -- the filter never rejects one, and it only ever survives when the fan holds
 * nothing after -- it just earns no extra credit for time outside the hole,
 * which would otherwise rank a late-starting long set above one that fills the
 * dead time immediately.
 *
 * The start is clamped to the gap as well as to arrival. Nothing reaches this
 * through `suggestGapFillers`, whose filter admits only candidates starting at
 * or after the gap opens -- but this is exported, and a direct caller passing a
 * set that began before the gap would otherwise be credited for minutes outside
 * it, contradicting the "minutes of the gap" contract above.
 *
 * An unknown walk time is treated as instant rather than poisoning the value
 * with NaN; those candidates are already sorted last by the null check in the
 * sort, so this only ever orders two unknowns against each other.
 *
 * @param {{startMs: number, endMs: number}} band - a prepared candidate
 * @param {{startMs: number, endMs: number}} gap - the cancelled set's window
 * @param {number} departureMs - when the fan is free to start walking
 * @param {number|null} walkMinutes - walking time to the candidate's venue
 * @returns {number} minutes of the gap actually seen, never negative
 */
export function seenMinutes(band, gap, departureMs, walkMinutes) {
  const arrivalMs = departureMs + (walkMinutes ?? 0) * MS_PER_MINUTE
  const from = Math.max(gap.startMs, band.startMs, arrivalMs)
  const until = Math.min(band.endMs, gap.endMs)
  return Math.max(0, Math.round((until - from) / MS_PER_MINUTE))
}

export function suggestGapFillers({ cancelledBand, myBands, allBands, maxSuggestions = 3 } = {}) {
  if (!hasValidWindow(cancelledBand) || !Array.isArray(allBands) || !Array.isArray(myBands)) return []

  const limit = Number.isFinite(maxSuggestions) ? Math.max(0, Math.floor(maxSuggestions)) : 0
  if (limit === 0) return []

  const selectedIds = new Set(myBands.map(band => band?.id).filter(id => id !== undefined && id !== null))
  const previousBand = myBands
    .filter(band => !band?.is_cancelled && hasValidWindow(band) && band.startMs < cancelledBand.startMs)
    .sort((a, b) => b.startMs - a.startMs)[0]
  const sourceBand = previousBand || cancelledBand
  const sourceVenue = { latitude: sourceBand.venue_lat, longitude: sourceBand.venue_lng }
  // Paired with sourceBand: the fan leaves the prior set's venue when it ends,
  // or the dark venue at the moment the cancelled set would have started.
  const departureMs = previousBand ? previousBand.endMs : cancelledBand.startMs

  const suggestions = allBands
    .filter(
      candidate =>
        hasValidWindow(candidate) &&
        !candidate.is_cancelled &&
        !selectedIds.has(candidate.id) &&
        cancelledBand.startMs <= candidate.startMs &&
        candidate.startMs < cancelledBand.endMs &&
        !myBands.some(
          band =>
            !band?.is_cancelled &&
            hasValidWindow(band) &&
            candidate.startMs < band.endMs &&
            band.startMs < candidate.endMs
        )
    )
    .map(band => ({
      band,
      walkMinutes: walkMinutesBetween(sourceVenue, {
        latitude: band.venue_lat,
        longitude: band.venue_lng,
      }),
      startsAtMs: band.startMs,
    }))
    .sort((a, b) => {
      if (a.walkMinutes === null && b.walkMinutes !== null) return 1
      if (a.walkMinutes !== null && b.walkMinutes === null) return -1
      // Most of the gap actually seen wins; walk time then start time break
      // ties. id is the
      // final tiebreak so the cap is deterministic: with every other key equal,
      // which candidates survive `slice` would otherwise depend on the order
      // `allBands` happened to arrive in.
      return (
        seenMinutes(b.band, cancelledBand, departureMs, b.walkMinutes) -
          seenMinutes(a.band, cancelledBand, departureMs, a.walkMinutes) ||
        a.walkMinutes - b.walkMinutes ||
        a.startsAtMs - b.startsAtMs ||
        String(a.band.id).localeCompare(String(b.band.id))
      )
    })

  return suggestions.slice(0, limit)
}
