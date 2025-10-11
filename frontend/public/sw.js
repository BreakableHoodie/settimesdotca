// Service Worker for offline support
// IMPORTANT: Increment version number with each deployment to force cache refresh
const CACHE_NAME = 'bandcrawl-v5'
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/bands.json',
  '/favicon.svg'
]

// Install event - cache assets and take control immediately
self.addEventListener('install', event => {
  console.log('[SW] Installing version', CACHE_NAME)
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => {
        console.log('[SW] Skip waiting')
        return self.skipWaiting()
      })
  )
})

// Activate event - clean up old caches aggressively
self.addEventListener('activate', event => {
  console.log('[SW] Activating version', CACHE_NAME)
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    }).then(() => {
      console.log('[SW] Claiming clients')
      return self.clients.claim()
    }).then(() => {
      // Force reload all clients to ensure they get the new version
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'CACHE_UPDATED' })
        })
      })
    })
  )
})

// Fetch event - network-first for HTML and data, cache-first for assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Always use network-first for HTML files (Safari caching fix)
  if (event.request.destination === 'document' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const responseToCache = response.clone()
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache)
          })
          return response
        })
        .catch(() => caches.match(event.request))
    )
    return
  }

  // Network-first strategy for bands.json to always get fresh data
  if (url.pathname.includes('bands.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const responseToCache = response.clone()
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache)
          })
          return response
        })
        .catch(() => caches.match(event.request))
    )
    return
  }

  // Cache-first strategy for static assets
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response
        }

        return fetch(event.request).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response
          }

          const responseToCache = response.clone()
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache)
          })

          return response
        })
      })
  )
})
