const CACHE_VERSION = 'v4'
const STATIC_CACHE = `schedule-${CACHE_VERSION}`
const API_CACHE = `api-${CACHE_VERSION}`

// Public API responses are only an offline fallback (navigations and API calls
// are network-first), so this cache is bounded to keep storage from growing
// without limit across every /api/schedule, /s/*, timeline call.
const API_CACHE_MAX_ENTRIES = 50

const CURRENT_CACHES = [STATIC_CACHE, API_CACHE]

// Only cache stable, non-hashed assets on install.
// Vite hashes JS/CSS filenames (e.g. assets/index-a3f9c.js) so those
// cannot be precached by name — they are picked up by runtime caching instead.
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/offline.html']

// Install: cache static assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker', CACHE_VERSION)

  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Caching static assets')
      // Don't let one missing optional asset (e.g. offline.html) abort install.
      return Promise.allSettled(STATIC_ASSETS.map(asset => cache.add(asset)))
    })
  )

  // Force activation immediately
  self.skipWaiting()
})

// Activate: clean up old caches (both the static and api families)
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker', CACHE_VERSION)

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(
            name =>
              (name.startsWith('schedule-') || name.startsWith('api-')) &&
              !CURRENT_CACHES.includes(name)
          )
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

// Fetch routing
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return
  }

  // SECURITY: Never cache admin API requests (sensitive data)
  if (url.pathname.startsWith('/api/admin/')) {
    event.respondWith(fetch(request)) // Network only, no caching
    return
  }

  // Public API requests: network-first with a bounded cache fallback.
  // Must come before the navigate check so that navigations to /api/ URLs
  // (e.g. /api/bands/:name/confirm-follow, /api/feeds/ical) are handled here
  // instead of navigationStrategy — preventing non-shell content from being
  // written to the /index.html cache slot.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request))
    return
  }

  // Navigations (the HTML document): network-first so a deploy's fresh shell —
  // which references the current hashed chunks — is always used when online.
  // Serving a cached shell here pinned stale HTML and caused ChunkLoadError /
  // blank screens after a deploy until the cache version was bumped.
  // /api/ paths are already handled above — only true SPA routes reach here.
  if (request.mode === 'navigate') {
    event.respondWith(navigationStrategy(request))
    return
  }

  // Static assets (hashed JS/CSS/images, manifest): cache-first. These are
  // content-hashed and immutable, so a cached copy is never stale.
  event.respondWith(cacheFirstStrategy(request))
})

// Network-first navigation strategy. Refreshes the cached shell on success and
// falls back to it (then the offline page) when the network is unavailable.
async function navigationStrategy(request) {
  try {
    const response = await fetch(request)

    const contentType = response.headers?.get?.('content-type') || ''
    if (response.ok && contentType.includes('text/html')) {
      const cache = await caches.open(STATIC_CACHE)
      // Best-effort shell refresh; swallow rejections so a failed put never
      // surfaces as an unhandled rejection (the response is returned regardless).
      cache.put('/index.html', response.clone()).catch(() => {})
    }

    return response
  } catch (error) {
    const cachedShell =
      (await caches.match('/index.html')) || (await caches.match('/'))
    if (cachedShell) return cachedShell

    const offlinePage = await caches.match('/offline.html')
    if (offlinePage) return offlinePage

    return new Response('Offline - content not cached', {
      status: 503,
      statusText: 'Service Unavailable',
    })
  }
}

// Cache-first strategy (for immutable, content-hashed static assets)
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request)

  if (cached) {
    // Return cached version immediately; refresh in the background.
    updateCache(request)
    return cached
  }

  // Not in cache, fetch from network
  try {
    const response = await fetch(request)

    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(request, response.clone())
    }

    return response
  } catch (error) {
    console.error('[SW] Fetch failed:', error)

    const offlinePage = await caches.match('/offline.html')
    if (offlinePage) return offlinePage

    return new Response('Offline - content not cached', {
      status: 503,
      statusText: 'Service Unavailable',
    })
  }
}

// Network-first strategy (for public API requests) with a bounded fallback cache
async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request)

    // Cache successful GETs as an offline fallback, capping the cache size.
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(API_CACHE)
      await cache.put(request, response.clone())
      await trimCache(cache, API_CACHE_MAX_ENTRIES)
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

// Evict oldest entries (Cache.keys() preserves insertion order → FIFO) until the
// cache holds at most maxEntries.
async function trimCache(cache, maxEntries) {
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - maxEntries; i++) {
    await cache.delete(keys[i])
  }
}

// Update the static cache in the background (best-effort)
async function updateCache(request) {
  try {
    const response = await fetch(request)

    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE)
      await cache.put(request, response)
    }
  } catch (error) {
    // Silent fail for background updates
  }
}
