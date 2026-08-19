import { walkMinutesBetween } from './walkTime'

function hasValidWindow(band) {
  return (
    band &&
    Number.isFinite(band.startMs) &&
    Number.isFinite(band.endMs) &&
    band.startMs > 0 &&
    band.endMs > band.startMs
  )
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
      return a.walkMinutes - b.walkMinutes || a.startsAtMs - b.startsAtMs
    })

  return suggestions.slice(0, limit)
}
