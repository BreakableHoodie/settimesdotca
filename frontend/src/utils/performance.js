// Privacy-preserving performance monitoring
// No user tracking, aggregate metrics only

export function measurePageLoad() {
  if (!window.performance) return

  window.addEventListener('load', () => {
    setTimeout(() => {
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
  const observer = new PerformanceObserver(list => {
    const entries = list.getEntries()
    const lastEntry = entries[entries.length - 1]
    if (import.meta.env.DEV) {
      console.log('LCP:', Math.round(lastEntry.startTime), 'ms')
    }
  })

  try {
    observer.observe({ entryTypes: ['largest-contentful-paint'] })
  } catch (e) {
    // LCP not supported
  }
}
