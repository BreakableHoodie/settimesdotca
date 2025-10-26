// Privacy-preserving performance monitoring
// No user tracking, aggregate metrics only

export function measurePageLoad() {
  if (!window.performance || !window.performance.timing) return

  window.addEventListener('load', () => {
    setTimeout(() => {
      const timing = window.performance.timing
      const metrics = {
        // Page load metrics
        dns: timing.domainLookupEnd - timing.domainLookupStart,
        tcp: timing.connectEnd - timing.connectStart,
        request: timing.responseStart - timing.requestStart,
        response: timing.responseEnd - timing.responseStart,
        dom: timing.domContentLoadedEventEnd - timing.domContentLoadedEventStart,
        load: timing.loadEventEnd - timing.navigationStart,

        // Core Web Vitals (approximations)
        fcp: getFirstContentfulPaint(),
        lcp: getLargestContentfulPaint()
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
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries()
    const lastEntry = entries[entries.length - 1]
    console.log('LCP:', Math.round(lastEntry.startTime), 'ms')
  })

  try {
    observer.observe({ entryTypes: ['largest-contentful-paint'] })
  } catch (e) {
    // LCP not supported
  }
}
