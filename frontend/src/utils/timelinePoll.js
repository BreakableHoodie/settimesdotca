// How long the homepage waits before re-fetching the timeline (#1412). The poll
// exists for "Now Playing": minute-level freshness only matters while a show is
// on. Before the first response (null) it assumes the live pace.
export const POLL_LIVE_MS = 60 * 1000
export const POLL_UPCOMING_MS = 5 * 60 * 1000
export const POLL_OFF_SEASON_MS = 15 * 60 * 1000

export function timelinePollDelayMs(timeline) {
  if (!timeline || timeline.now?.length) return POLL_LIVE_MS
  if (timeline.upcoming?.length) return POLL_UPCOMING_MS
  return POLL_OFF_SEASON_MS
}
