// Privacy-first metrics collector
// Uses Beacon API for non-blocking sends
/* global crypto, Blob */

const METRICS_ENDPOINT = '/api/metrics'
const BATCH_INTERVAL = 5000
const MAX_BATCH_SIZE = 20

const ALLOWED_EVENTS = new Set([
  'page_view',
  'event_view',
  'artist_profile_view',
  'social_link_click',
  'ticket_click',
  'visit',
  'turnstile_error',
])

const SAFE_KEYS = new Set(['band_profile_id', 'event_id', 'link_type', 'page', 'error_code', 'referrer_bucket'])

const VISIT_FLAG_KEY = 'settimes_visit_sent'

const hostIs = (host, domain) => host === domain || host.endsWith(`.${domain}`)
const stripWww = host => host.replace(/^www\./, '')

export function referrerBucket(referrer, ownHost) {
  if (!referrer || typeof referrer !== 'string') return 'direct'

  let host
  try {
    host = new URL(referrer).hostname.toLowerCase()
  } catch {
    return 'other'
  }

  if (!host) return 'other'
  if (ownHost && stripWww(host) === stripWww(String(ownHost).toLowerCase())) return 'direct'
  if (hostIs(host, 'instagram.com')) return 'instagram'
  if (['facebook.com', 'fb.com', 'fb.me'].some(domain => hostIs(host, domain))) return 'facebook'
  if (/(^|\.)google\.(com|[a-z]{2}|(co|com)\.[a-z]{2})$/.test(host)) return 'google'
  if (/(^|\.)yahoo\.(com|[a-z]{2}|(co|com)\.[a-z]{2})$/.test(host)) return 'other_search'
  if (
    ['bing.com', 'duckduckgo.com', 'ecosia.org', 'search.brave.com', 'kagi.com'].some(domain => hostIs(host, domain))
  ) {
    return 'other_search'
  }
  return 'other'
}

let eventQueue = []
let flushTimeout = null
let sessionId = null
let visitSentThisLoad = false

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
    const blob = new Blob([payload], { type: 'application/json' })
    navigator.sendBeacon(METRICS_ENDPOINT, blob)
    return
  }

  fetch(METRICS_ENDPOINT, {
    method: 'POST',
    body: payload,
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => {})
}

export function trackVisitOnce() {
  if (visitSentThisLoad) return
  visitSentThisLoad = true
  if (typeof window === 'undefined') return

  try {
    if (window.sessionStorage.getItem(VISIT_FLAG_KEY)) return
    window.sessionStorage.setItem(VISIT_FLAG_KEY, '1')
  } catch {
    // The in-memory flag still limits this to one visit when storage is blocked.
  }

  trackEvent('visit', {
    referrer_bucket: referrerBucket(
      typeof document !== 'undefined' ? document.referrer : '',
      window.location?.hostname
    ),
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushEvents()
    }
  })
}

export const trackPageView = page => {
  trackVisitOnce()
  trackEvent('page_view', { page })
}
export const trackEventView = eventId => trackEvent('event_view', { event_id: eventId })
export const trackArtistView = bandProfileId => trackEvent('artist_profile_view', { band_profile_id: bandProfileId })
export const trackSocialClick = (bandProfileId, linkType) =>
  trackEvent('social_link_click', { band_profile_id: bandProfileId, link_type: linkType })
export const trackTicketClick = eventId => trackEvent('ticket_click', { event_id: eventId })
