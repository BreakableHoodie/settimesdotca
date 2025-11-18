const CACHE_VERSION = 'v2'
const CACHE_NAME = `schedule-${CACHE_VERSION}`

// Assets to cache immediately on install
const STATIC_ASSETS = ['/', '/index.html', '/assets/index.css', '/assets/index.js', '/manifest.json']

// Install: cache static assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker', CACHE_VERSION)

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching static assets')
      return cache.addAll(STATIC_ASSETS)
    })
  )

  // Force activation immediately
  self.skipWaiting()
})

// Activate: clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker', CACHE_VERSION)

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('schedule-') && name !== CACHE_NAME)
          .map(name => {
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
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Only cache same-origin requests
  if (url.origin !== self.location.origin) {
    return
  }

  // SECURITY: Never cache admin API requests (sensitive data)
  if (url.pathname.startsWith('/api/admin/')) {
    event.respondWith(fetch(request)) // Network only, no caching
    return
  }

  // Public API requests: Network-first with cache fallback
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
      statusText: 'Service Unavailable',
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
