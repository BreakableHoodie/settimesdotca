// "Next Move" live companion — pure state machine.
//
// Given the user's saved bands (already enriched with startMs/endMs by
// prepareBands, so the after-midnight offset is already applied — do NOT
// re-derive it here) and the current time, decide the single most useful thing
// to surface right now:
//   watching → a saved set is playing now
//   move     → nothing playing, next set is at a different venue (walk there)
//   decide   → two saved sets clash (now, or imminently)
//   upnext   → next set is soon, same venue / first set of the night
//   null     → the event isn't close enough to matter (ComingUp covers that)
import { walkMinutesBetween } from './walkTime'

// How far ahead (minutes) the live card stays relevant. Beyond this the rich
// card stands down and the generic "coming up" banner takes over.
export const LIVE_WINDOW_MIN = 240

const toMinutes = ms => Math.round(ms / 60000)

// Build a maps directions deep-link for a band's venue. Prefers exact
// coordinates (opens the Maps app on mobile); falls back to a name search.
export function directionsHref(band) {
  if (!band) return null
  const { venue_lat: lat, venue_lng: lng, venue } = band
  if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  }
  if (venue) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue} Waterloo ON`)}`
  }
  return null
}

export function computeNextMove(bands, now, { windowMin = LIVE_WINDOW_MIN } = {}) {
  const nowMs = (now instanceof Date ? now : new Date(now || Date.now())).getTime()

  // Only bands with usable precomputed times participate.
  const timed = (Array.isArray(bands) ? bands : []).filter(
    b => Number.isFinite(b.startMs) && b.startMs > 0 && Number.isFinite(b.endMs) && b.endMs > 0
  )

  const playingNow = timed.filter(b => b.startMs <= nowMs && nowMs < b.endMs).sort((a, b) => a.endMs - b.endMs)
  const upcoming = timed.filter(b => b.startMs > nowMs).sort((a, b) => a.startMs - b.startMs)
  const finished = timed.filter(b => b.endMs <= nowMs).sort((a, b) => b.endMs - a.endMs)

  const nextBand = upcoming[0] || null
  const minutesToNext = nextBand ? toMinutes(nextBand.startMs - nowMs) : null

  // 1. Hard clash: two saved sets overlap *right now* — you can't be in two
  //    rooms at once, so the only move is to choose.
  if (playingNow.length >= 2) {
    return { kind: 'decide', conflict: [playingNow[0], playingNow[1]], nextBand, minutesToNext }
  }

  // 2. Currently watching a saved set.
  if (playingNow.length === 1) {
    const nowBand = playingNow[0]
    return {
      kind: 'watching',
      nowBand,
      minutesLeft: toMinutes(nowBand.endMs - nowMs),
      nextBand,
      minutesToNext,
    }
  }

  // Nothing playing. If the next set is beyond the live window, stand down.
  if (!nextBand || minutesToNext > windowMin) {
    return { kind: null }
  }

  // 3. Imminent clash: the next two saved sets overlap.
  if (upcoming.length >= 2 && upcoming[1].startMs < nextBand.endMs) {
    return { kind: 'decide', conflict: [nextBand, upcoming[1]], nextBand, minutesToNext }
  }

  // 4. Move vs. up-next. If the most recently finished set was at a different
  //    venue, the actionable thing is to get up and walk there now.
  const prev = finished[0] || null
  const venueChanged = Boolean(prev && prev.venue && nextBand.venue && prev.venue !== nextBand.venue)
  if (venueChanged) {
    const walkMin = walkMinutesBetween(
      { latitude: prev.venue_lat, longitude: prev.venue_lng },
      { latitude: nextBand.venue_lat, longitude: nextBand.venue_lng }
    )
    return {
      kind: 'move',
      fromBand: prev,
      nextBand,
      minutesToNext,
      walkMin,
      slackMin: walkMin != null ? minutesToNext - walkMin : null,
    }
  }

  // 5. Otherwise just announce what's up next.
  return { kind: 'upnext', nextBand, minutesToNext }
}
