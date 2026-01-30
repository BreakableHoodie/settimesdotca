/* eslint-disable no-console -- Performance instrumentation intentionally logs metrics in dev */
// Privacy-preserving performance monitoring
// No user tracking, aggregate metrics only

const DEV_FLAG = '__APP_DEV__'
const LISTENER_ADDED = Symbol.for('performanceListenerAdded')

export function measurePageLoad() {
  if (typeof window === 'undefined' || !window.performance) {
    return
  }

  if (window[LISTENER_ADDED]) {
    return
  }
  window[LISTENER_ADDED] = true

  const runMeasurements = () => {
    if (!getIsDevEnvironment()) {
      return
    }

    setTimeout(() => {
      // Guard again in case env flipped between registration and execution
      if (!getIsDevEnvironment()) {
        return
      }

      const timing = resolveTimingEntry()
      if (!timing) {
        console.warn('Navigation Timing API not supported')
        return
      }

      const metrics = {
        dns: diff(timing.domainLookupEnd, timing.domainLookupStart),
        tcp: diff(timing.connectEnd, timing.connectStart),
        request: diff(timing.responseStart, timing.requestStart),
        response: diff(timing.responseEnd, timing.responseStart),
        dom: diff(timing.domContentLoadedEventEnd, timing.domContentLoadedEventStart),
        load: diff(timing.loadEventEnd, getFetchStart(timing)),
        fcp: getFirstContentfulPaint(),
        lcp: null,
      }

      if (getIsDevEnvironment()) {
        console.table(metrics)
      }

      getLargestContentfulPaint(getIsDevEnvironment())
    }, 0)
  }

  const triggerMeasurements = () => {
    window[LISTENER_ADDED] = 'executed'
    runMeasurements()
  }

  if (hasWindowFinishedLoading()) {
    triggerMeasurements()
  } else {
    window.addEventListener('load', triggerMeasurements, { once: true })
  }
}

function hasWindowFinishedLoading() {
  if (typeof document !== 'undefined' && document.readyState === 'complete') {
    return true
  }

  if (typeof performance !== 'undefined' && performance.timing) {
    const loadEventEnd = performance.timing.loadEventEnd
    return typeof loadEventEnd === 'number' && loadEventEnd > 0
  }

  return false
}

function resolveTimingEntry() {
  if (typeof performance === 'undefined') {
    return null
  }

  if (typeof performance.getEntriesByType === 'function') {
    const entries = performance.getEntriesByType('navigation') || []
    if (entries.length > 0 && typeof entries[0].domainLookupStart === 'number') {
      return entries[0]
    }
  }

  if (performance.timing) {
    return performance.timing
  }

  return null
}

function diff(end, start) {
  if (typeof end !== 'number' || typeof start !== 'number') {
    return null
  }

  const value = Math.round(end - start)
  return Number.isNaN(value) ? null : value
}

function getFetchStart(timing) {
  if (typeof timing.fetchStart === 'number') {
    return timing.fetchStart
  }
  if (typeof timing.startTime === 'number') {
    return timing.startTime
  }
  return timing.navigationStart ?? 0
}

function getFirstContentfulPaint() {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return null
  }

  const entries = performance.getEntriesByType('paint') || []
  const fcp = entries.find(entry => entry.name === 'first-contentful-paint')
  return fcp ? Math.round(fcp.startTime) : null
}

function getLargestContentfulPaint(isDev) {
  if (!isDev) {
    return null
  }

  const observerCtor =
    (typeof globalThis !== 'undefined' && globalThis.PerformanceObserver) ||
    (typeof PerformanceObserver !== 'undefined' ? PerformanceObserver : null)

  if (!observerCtor) {
    return null
  }

  try {
    const observer = new observerCtor(list => {
      const entries = list.getEntries()
      if (!entries.length) {
        return
      }

      const lastEntry = entries[entries.length - 1]
      if (isDev) {
        console.log('LCP:', Math.round(lastEntry.startTime), 'ms')
      }
    })

    observer.observe({ type: 'largest-contentful-paint', buffered: true })
  } catch {
    return null
  }

  return null
}

function getIsDevEnvironment() {
  if (typeof globalThis !== 'undefined' && typeof globalThis[DEV_FLAG] === 'boolean') {
    return globalThis[DEV_FLAG]
  }

  if (typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.DEV === 'boolean') {
    return import.meta.env.DEV
  }

  if (typeof process !== 'undefined' && process.env && typeof process.env.NODE_ENV === 'string') {
    return process.env.NODE_ENV !== 'production'
  }

  return true
}
