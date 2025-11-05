# Sprint 2: Performance Optimization - Cursor Implementation Spec

**Goal**: Achieve offline-first PWA with < 100KB bundle, < 1s render on 3G networks.

**Timeline**: 2 weeks
**Deliverable**: Production-ready performance meeting fan-first principles

**Reference**: See `docs/FAN_FIRST_SPEC.md` Section: "Performance First" (lines 21-26)

---

## 📋 Tasks Overview

1. [Service Worker aggressive caching](#task-1-service-worker-caching)
2. [Bundle size optimization](#task-2-bundle-optimization)
3. [Lazy loading non-critical features](#task-3-lazy-loading)
4. [Remove/optimize images](#task-4-image-optimization)
5. [Offline mode enhancements](#task-5-offline-enhancements)
6. [Performance monitoring](#task-6-performance-monitoring)

---

## Task 1: Service Worker Caching

### Goal
Aggressive offline-first caching so app works in clubs with poor signal.

### File: `frontend/public/sw.js`

**Replace existing Service Worker** with this implementation:

```javascript
const CACHE_VERSION = 'v2'
const CACHE_NAME = `schedule-${CACHE_VERSION}`

// Assets to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/assets/index.css',
  '/assets/index.js',
  '/manifest.json'
]

// Install: cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker', CACHE_VERSION)

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets')
      return cache.addAll(STATIC_ASSETS)
    })
  )

  // Force activation immediately
  self.skipWaiting()
})

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker', CACHE_VERSION)

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('schedule-') && name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name)
            return caches.delete(name)
          })
      )
    })
  )

  // Take control of all pages immediately
  self.clients.claim()
})

// Fetch: Cache-first with network fallback
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only cache same-origin requests
  if (url.origin !== self.location.origin) {
    return
  }

  // API requests: Network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request))
    return
  }

  // Static assets: Cache-first with network fallback
  event.respondWith(cacheFirstStrategy(request))
})

// Cache-first strategy (for static assets)
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request)

  if (cached) {
    // Return cached version immediately
    // Update cache in background
    updateCache(request)
    return cached
  }

  // Not in cache, fetch from network
  try {
    const response = await fetch(request)

    // Cache successful responses
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }

    return response
  } catch (error) {
    console.error('[SW] Fetch failed:', error)

    // Return offline page if available
    const offlinePage = await caches.match('/offline.html')
    if (offlinePage) return offlinePage

    // Return basic error response
    return new Response('Offline - content not cached', {
      status: 503,
      statusText: 'Service Unavailable'
    })
  }
}

// Network-first strategy (for API requests)
async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request)

    // Cache successful GET requests
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }

    return response
  } catch (error) {
    // Network failed, try cache
    const cached = await caches.match(request)

    if (cached) {
      console.log('[SW] Serving cached API response:', request.url)
      return cached
    }

    throw error
  }
}

// Update cache in background
async function updateCache(request) {
  try {
    const response = await fetch(request)

    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(request, response)
    }
  } catch (error) {
    // Silent fail for background updates
  }
}
```

### File: `frontend/public/offline.html`

**Create new file** for offline fallback:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline - Schedule App</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
    }
    .container {
      max-width: 400px;
      padding: 2rem;
    }
    h1 {
      font-size: 3rem;
      margin: 0 0 1rem 0;
    }
    p {
      font-size: 1.125rem;
      line-height: 1.6;
      margin: 0 0 2rem 0;
      opacity: 0.9;
    }
    button {
      background: #ff6b35;
      color: white;
      border: none;
      padding: 1rem 2rem;
      font-size: 1rem;
      border-radius: 0.5rem;
      cursor: pointer;
      font-weight: 600;
    }
    button:hover {
      background: #ff8555;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📡</h1>
    <h2>You're Offline</h2>
    <p>This page isn't cached yet. Check your connection and try again.</p>
    <button onclick="window.location.reload()">Retry</button>
  </div>
</body>
</html>
```

### Testing Checklist
- [ ] Service worker installs successfully
- [ ] Static assets cached on first load
- [ ] App works offline after initial visit
- [ ] Cache updates in background
- [ ] Old caches cleaned up on version change
- [ ] API responses cached for offline use

---

## Task 2: Bundle Optimization

### Goal
Reduce JavaScript bundle to < 60KB (target from FAN_FIRST_SPEC: 60KB JS).

### File: `frontend/vite.config.js`

**Update build configuration**:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  build: {
    // Bundle size optimizations
    target: 'es2020',
    minify: 'terser',

    terserOptions: {
      compress: {
        drop_console: true,        // Remove console.log in production
        drop_debugger: true,        // Remove debugger statements
        pure_funcs: ['console.info', 'console.debug']
      }
    },

    rollupOptions: {
      output: {
        // Manual chunk splitting
        manualChunks: {
          // Vendor chunk (React, ReactDOM)
          vendor: ['react', 'react-dom'],

          // Admin panel (lazy loaded)
          admin: [
            './src/admin/AdminPanel.jsx',
            './src/admin/BandsTab.jsx',
            './src/admin/EventsTab.jsx'
          ]
        }
      }
    },

    // Warnings for large chunks
    chunkSizeWarningLimit: 100 // KB
  },

  // Production optimizations
  esbuild: {
    drop: ['console', 'debugger']
  }
})
```

### File: `frontend/package.json`

**Add bundle analysis scripts**:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "analyze": "vite-bundle-visualizer"
  },
  "devDependencies": {
    "vite-bundle-visualizer": "^1.0.0"
  }
}
```

**Install analyzer**:
```bash
npm install --save-dev vite-bundle-visualizer
```

### Testing Checklist
- [ ] Run `npm run build` and check output sizes
- [ ] Total JS bundle < 60KB gzipped
- [ ] Run `npm run analyze` to visualize bundle
- [ ] No console.log in production build
- [ ] Chunks load correctly in production

---

## Task 3: Lazy Loading

### Goal
Defer non-critical features to reduce initial load time.

### File: `frontend/src/App.jsx`

**Implement code splitting for admin panel**:

```javascript
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import ScheduleView from './components/ScheduleView'

// Lazy load admin panel (not needed for fans)
const AdminPanel = lazy(() => import('./admin/AdminPanel'))

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-band-navy to-band-purple">
      <div className="text-white text-xl">Loading...</div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Fan experience: Load immediately */}
        <Route path="/" element={
          <>
            <Header />
            <ScheduleView />
          </>
        } />

        {/* Admin panel: Lazy loaded */}
        <Route path="/admin/*" element={
          <Suspense fallback={<LoadingFallback />}>
            <AdminPanel />
          </Suspense>
        } />
      </Routes>
    </BrowserRouter>
  )
}

export default App
```

### File: `frontend/src/main.jsx`

**Optimize React rendering**:

```javascript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.error('SW registration failed:', err))
  })
}

// Use concurrent mode for better performance
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

### Testing Checklist
- [ ] Admin panel loads separately (check Network tab)
- [ ] Initial page load < 1s on Fast 3G (Chrome DevTools)
- [ ] Service worker registers successfully
- [ ] Loading fallback displays during lazy load
- [ ] No hydration errors in console

---

## Task 4: Image Optimization

### Goal
Eliminate unnecessary images, optimize remaining ones.

### Changes Required

1. **Remove schedule.webp from production** (reference only in docs)
2. **Use system fonts** (no web fonts)
3. **Replace any images with CSS/SVG**

### File: `frontend/index.html`

**Ensure minimal head, no external fonts**:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- Preload critical assets only -->
    <link rel="preload" href="/assets/index.css" as="style" />
    <link rel="preload" href="/assets/index.js" as="script" />

    <!-- PWA manifest -->
    <link rel="manifest" href="/manifest.json" />

    <!-- Theme color -->
    <meta name="theme-color" content="#1a1a2e" />

    <title>Concert Schedule</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

### File: `frontend/tailwind.config.js`

**Use system fonts only**:

```javascript
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'band-navy': '#1a1a2e',
        'band-purple': '#16213e',
        'band-orange': '#ff6b35'
      },
      fontFamily: {
        // System fonts only (no web fonts)
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
}
```

### Testing Checklist
- [ ] No images loaded on schedule view
- [ ] No web fonts loaded (check Network tab)
- [ ] Lighthouse score > 90 for Performance
- [ ] Total page weight < 100KB

---

## Task 5: Offline Enhancements

### Goal
Improve offline experience and add connection status indicator.

### File: `frontend/src/components/OfflineIndicator.jsx`

**Create new component**:

```javascript
import { useState, useEffect } from 'react'

export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 bg-yellow-500 text-black px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50">
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      <span className="font-medium">You're offline - using cached data</span>
    </div>
  )
}
```

### File: `frontend/src/App.jsx`

**Add offline indicator**:

```javascript
import OfflineIndicator from './components/OfflineIndicator'

function App() {
  return (
    <BrowserRouter>
      <OfflineIndicator />
      {/* ... rest of app */}
    </BrowserRouter>
  )
}
```

### Testing Checklist
- [ ] Indicator appears when offline (DevTools → Network → Offline)
- [ ] Indicator disappears when back online
- [ ] App functions normally while offline
- [ ] Schedule loads from cache when offline

---

## Task 6: Performance Monitoring

### Goal
Add basic performance tracking (privacy-preserving).

### File: `frontend/src/utils/performance.js`

**Create new file**:

```javascript
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
```

### File: `frontend/src/main.jsx`

**Enable performance monitoring**:

```javascript
import { measurePageLoad } from './utils/performance'

// Monitor performance (dev only for now)
if (import.meta.env.DEV) {
  measurePageLoad()
}
```

### Testing Checklist
- [ ] Performance metrics logged in console (dev mode)
- [ ] FCP < 1s on Fast 3G
- [ ] LCP < 2.5s on Fast 3G
- [ ] No performance monitoring in production yet

---

## Performance Budget

**Target metrics** (from FAN_FIRST_SPEC.md):

| Metric | Target | Measured |
|--------|--------|----------|
| HTML | 10 KB | ___ KB |
| CSS | 15 KB | ___ KB |
| JS | 60 KB | ___ KB |
| Data | 10 KB | ___ KB |
| Images | 0 KB | ___ KB |
| **Total** | **~100 KB** | **___ KB** |
| Render time (3G) | < 1s | ___ ms |

**Lighthouse targets**:
- Performance: > 90
- Accessibility: > 95
- Best Practices: > 90
- SEO: > 90

---

## Deployment Steps

1. **Install dependencies:**
   ```bash
   npm install --save-dev vite-bundle-visualizer
   ```

2. **Test offline mode:**
   ```bash
   npm run build
   npx wrangler pages dev frontend/dist --local
   # Open DevTools → Application → Service Workers
   # Open DevTools → Network → Offline
   ```

3. **Analyze bundle:**
   ```bash
   npm run analyze
   # Opens visual bundle analysis
   ```

4. **Lighthouse audit:**
   ```bash
   # Open Chrome DevTools → Lighthouse
   # Run audit on mobile + desktop
   # Target scores: 90+ all categories
   ```

5. **Deploy:**
   ```bash
   npx wrangler pages deploy frontend/dist
   ```

---

## Success Criteria

Sprint 2 complete when:
- ✅ Service worker caches all static assets
- ✅ App works offline after first visit
- ✅ Bundle size < 100KB total (gzipped)
- ✅ JavaScript bundle < 60KB (gzipped)
- ✅ Admin panel lazy loaded
- ✅ Lighthouse Performance > 90
- ✅ FCP < 1s on Fast 3G
- ✅ LCP < 2.5s on Fast 3G
- ✅ No web fonts loaded
- ✅ Offline indicator shows connection status
- ✅ All features work with poor signal

---

## SuperClaude Notes

**Framework alignment:**
- **Performance First** principle from FAN_FIRST_SPEC.md
- **Privacy Respecting** - no tracking, aggregate metrics only
- **Token Efficiency** - minimal comments, clear code structure
- **Evidence-Based** - Lighthouse scores, bundle analyzer, Network tab

**Tools used:**
- Vite for bundling
- Terser for minification
- Service Worker API for offline
- Performance API for monitoring
- Chrome DevTools for validation
