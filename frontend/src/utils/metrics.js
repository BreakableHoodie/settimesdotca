// Privacy-first metrics collector
// Uses Beacon API for non-blocking sends

const METRICS_ENDPOINT = '/api/metrics'
const BATCH_INTERVAL = 5000
const MAX_BATCH_SIZE = 20

const ALLOWED_EVENTS = new Set([
  'page_view',
  'event_view',
  'artist_profile_view',
  'social_link_click',
  'share_event',
  'filter_use',
])

const SAFE_KEYS = new Set(['band_profile_id', 'event_id', 'link_type', 'page'])

let eventQueue = []
let flushTimeout = null
let sessionId = null

function getSessionId() {
  if (!sessionId) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      sessionId = crypto.randomUUID().slice(0, 8)
    } else {
      sessionId = `sess_${Date.now().toString(36)}`
    }
  }
  return sessionId
}

function sanitizeProps(props) {
  if (!props || typeof props !== 'object') return {}
  const safe = {}
  for (const key of SAFE_KEYS) {
    if (props[key] !== undefined && props[key] !== null) {
      safe[key] = props[key]
    }
  }
  return safe
}

export function trackEvent(eventName, props = {}) {
  if (!ALLOWED_EVENTS.has(eventName)) {
    return
  }

  eventQueue.push({
    event: eventName,
    props: sanitizeProps(props),
    ts: Date.now(),
    sid: getSessionId(),
  })

  if (!flushTimeout) {
    flushTimeout = setTimeout(flushEvents, BATCH_INTERVAL)
  }

  if (eventQueue.length >= MAX_BATCH_SIZE) {
    flushEvents()
  }
}

function flushEvents() {
  if (eventQueue.length === 0) {
    flushTimeout = null
    return
  }

  const events = [...eventQueue]
  eventQueue = []
  flushTimeout = null

  const payload = JSON.stringify({ events })

  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon(METRICS_ENDPOINT, payload)
    return
  }

  fetch(METRICS_ENDPOINT, {
    method: 'POST',
    body: payload,
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => {})
}

if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushEvents()
    }
  })
}

export const trackPageView = page => trackEvent('page_view', { page })
export const trackEventView = eventId => trackEvent('event_view', { event_id: eventId })
export const trackArtistView = bandProfileId => trackEvent('artist_profile_view', { band_profile_id: bandProfileId })
export const trackSocialClick = (bandProfileId, linkType) =>
  trackEvent('social_link_click', { band_profile_id: bandProfileId, link_type: linkType })
