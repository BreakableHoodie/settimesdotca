// Privacy-preserving performance monitoring
// No user tracking, aggregate metrics only

// Use a global symbol to track if listener was added to this window instance
// Global symbols persist across module resets in tests
const LISTENER_ADDED = Symbol.for('performanceListenerAdded')

export function measurePageLoad() {
  if (!window.performance) return
  
  // Prevent multiple listeners from being added to the same window instance
  if (window[LISTENER_ADDED]) return
  window[LISTENER_ADDED] = true

  window.addEventListener('load', () => {
    // Prevent multiple executions if listener fires multiple times
    if (window[LISTENER_ADDED] === 'executed') return
    window[LISTENER_ADDED] = 'executed'
    
    setTimeout(() => {
      // Double-check DEV mode before logging (in case import.meta.env changes)
      if (!import.meta.env.DEV) {
        return
      }
      
      // Use modern Navigation Timing Level 2 API
      const navEntries = performance.getEntriesByType('navigation')
      if (navEntries.length === 0) {
        console.warn('Navigation Timing API not supported')
        return
      }

      const timing = navEntries[0]
      const metrics = {
        // Page load metrics
        dns: Math.round(timing.domainLookupEnd - timing.domainLookupStart),
        tcp: Math.round(timing.connectEnd - timing.connectStart),
        request: Math.round(timing.responseStart - timing.requestStart),
        response: Math.round(timing.responseEnd - timing.responseStart),
        dom: Math.round(timing.domContentLoadedEventEnd - timing.domContentLoadedEventStart),
        load: Math.round(timing.loadEventEnd - timing.fetchStart),

        // Core Web Vitals (approximations)
        fcp: getFirstContentfulPaint(),
        lcp: getLargestContentfulPaint(),
      }

      // Log to console in dev
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.table(metrics)
      }

      // Could send to analytics endpoint (future)
      // sendMetrics(metrics)
    }, 0)
  })
}

function getFirstContentfulPaint() {
  const entries = performance.getEntriesByType('paint')
  const fcp = entries.find(entry => entry.name === 'first-contentful-paint')
  return fcp ? Math.round(fcp.startTime) : null
}

function getLargestContentfulPaint() {
  // Check if PerformanceObserver is available (works in both browser and Node.js test env)
  if (typeof PerformanceObserver === 'undefined' && typeof global !== 'undefined' && typeof global.PerformanceObserver === 'undefined') {
    return null
  }

  // Only create observer if in DEV mode (to avoid triggering callbacks in production tests)
  if (!import.meta.env.DEV) {
    return null
  }

  // Use global.PerformanceObserver in test env, window.PerformanceObserver in browser
  const Observer = typeof global !== 'undefined' && global.PerformanceObserver 
    ? global.PerformanceObserver 
    : typeof PerformanceObserver !== 'undefined' 
      ? PerformanceObserver 
      : null

  if (!Observer) {
    return null
  }

  try {
    const observer = new Observer(list => {
      const entries = list.getEntries()
      const lastEntry = entries[entries.length - 1]
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('LCP:', Math.round(lastEntry.startTime), 'ms')
      }
    })

    observer.observe({ entryTypes: ['largest-contentful-paint'] })
  } catch {
    // LCP not supported
    return null
  }
  
  return null // LCP is measured asynchronously, return null for immediate value
}
