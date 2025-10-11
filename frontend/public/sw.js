// Service Worker for offline support
// IMPORTANT: Increment version number with each deployment to force cache refresh
const CACHE_NAME = 'bandcrawl-v7'
// Only cache static assets, NOT HTML files (to preserve CSP headers)
const urlsToCache = [
  '/manifest.json',
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

// Fetch event - NEVER cache HTML, always fetch from network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // NEVER cache HTML files - always fetch from network to preserve CSP headers
  if (event.request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/') {
    console.log('[SW] Fetching HTML from network:', url.pathname)
    event.respondWith(
      fetch(event.request).catch(() => {
        // Only use cache as last resort for offline support
        return caches.match(event.request)
      })
    )
    return
  }

  // NEVER cache data files - always fetch fresh
  if (url.pathname.includes('bands.json')) {
    console.log('[SW] Fetching data from network:', url.pathname)
    event.respondWith(fetch(event.request))
    return
  }

  // Cache-first ONLY for static assets (JS, CSS, fonts, images)
  if (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    event.respondWith(
      caches.match(event.request).then(response => {
        if (response) {
          console.log('[SW] Serving from cache:', url.pathname)
          return response
        }

        console.log('[SW] Fetching and caching:', url.pathname)
        return fetch(event.request).then(response => {
          // Only cache successful responses
          if (response && response.status === 200) {
            const responseToCache = response.clone()
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache)
            })
          }
          return response
        })
      })
    )
    return
  }

  // For everything else, just fetch from network
  event.respondWith(fetch(event.request))
})
