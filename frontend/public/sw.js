// Service Worker for offline support
// IMPORTANT: Increment version number with each deployment to force cache refresh
const CACHE_NAME = 'bandcrawl-v4'
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/bands.json',
  '/favicon.svg'
]

// Install event - cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    }).then(() => self.clients.claim())
  )
})

// Fetch event - network-first for bands.json, cache-first for everything else
self.addEventListener('fetch', event => {
  // Network-first strategy for bands.json to always get fresh data
  if (event.request.url.includes('bands.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clone and cache the fresh response
          const responseToCache = response.clone()
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache)
          })
          return response
        })
        .catch(() => {
          // If network fails, fallback to cache
          return caches.match(event.request)
        })
    )
    return
  }

  // Cache-first strategy for other assets
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response
        }
        // Clone the request
        const fetchRequest = event.request.clone()

        return fetch(fetchRequest).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response
          }

          // Clone the response
          const responseToCache = response.clone()

          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache)
          })

          return response
        })
      })
  )
})
