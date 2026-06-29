import { beforeEach, describe, expect, it, vi } from 'vitest'

// Unit tests for the service worker (frontend/public/sw.js).
//
// The SW is a classic worker script that talks to the global `self`, `caches`,
// and `fetch`. We mock those globals, import the script so its event listeners
// register against our mock `self`, then drive the captured `fetch` handler with
// duck-typed request objects (a real Request can't be constructed with
// mode: "navigate", so we pass plain objects exposing the fields the SW reads).

const ORIGIN = 'https://example.test'
const API_CACHE_MAX_ENTRIES = 50

function cacheKey(req) {
  return typeof req === 'string' ? new URL(req, ORIGIN).toString() : req.url
}

// Minimal CacheStorage mock backed by Maps (one per cache name).
function makeCacheStorage() {
  const stores = new Map()
  const wrap = store => ({
    async match(req) {
      return store.get(cacheKey(req))
    },
    async put(req, res) {
      store.set(cacheKey(req), res)
    },
    async keys() {
      // Cache.keys() preserves insertion order; return Request-like stubs.
      return [...store.keys()].map(url => ({ url }))
    },
    async delete(req) {
      return store.delete(cacheKey(req))
    },
    async addAll(reqs) {
      for (const r of reqs) store.set(cacheKey(r), { ok: true })
    },
  })
  return {
    _stores: stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map())
      return wrap(stores.get(name))
    },
    async match(req) {
      for (const store of stores.values()) {
        const hit = store.get(cacheKey(req))
        if (hit) return hit
      }
      return undefined
    },
    async keys() {
      return [...stores.keys()]
    },
    async delete(name) {
      return stores.delete(name)
    },
  }
}

function makeResponse(tag, { contentType = 'text/html', ...extra } = {}) {
  return {
    ok: true,
    _tag: tag,
    headers: { get: n => (String(n).toLowerCase() === 'content-type' ? contentType : null) },
    clone() {
      return this
    },
    ...extra,
  }
}

let handlers

async function loadServiceWorker() {
  handlers = {}
  globalThis.self = {
    addEventListener: (type, fn) => {
      handlers[type] = fn
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    location: { origin: ORIGIN },
  }
  globalThis.caches = makeCacheStorage()
  vi.resetModules()
  await import('../../public/sw.js')
}

// Invoke the captured fetch handler with a duck-typed request and resolve the
// promise passed to event.respondWith (undefined if the SW passed the request
// through without responding).
async function handleFetch(request) {
  let responded
  handlers.fetch({
    request,
    respondWith: p => {
      responded = p
    },
  })
  return responded ? await responded : undefined
}

function allCachedEntries() {
  return [...globalThis.caches._stores.values()].reduce((n, s) => n + s.size, 0)
}

describe('service worker fetch routing', () => {
  beforeEach(async () => {
    await loadServiceWorker()
  })

  it('serves navigations network-first — returns the fresh shell even when this exact URL is cached', async () => {
    // Pre-seed a STALE copy of the very URL being navigated to, so a cache-first
    // strategy would return it. Network-first must return the fresh network copy.
    const seeded = await globalThis.caches.open('seed')
    await seeded.put(`${ORIGIN}/event/some-route`, makeResponse('STALE'))

    globalThis.fetch = vi.fn(async () => makeResponse('FRESH'))

    const res = await handleFetch({
      url: `${ORIGIN}/event/some-route`,
      method: 'GET',
      mode: 'navigate',
    })

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(res._tag).toBe('FRESH')
  })

  it('falls back to the cached shell for a navigation when the network is offline', async () => {
    const cache = await globalThis.caches.open('static')
    await cache.put(`${ORIGIN}/index.html`, makeResponse('SHELL'))

    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline')
    })

    const res = await handleFetch({
      url: `${ORIGIN}/event/some-route`,
      method: 'GET',
      mode: 'navigate',
    })

    expect(res._tag).toBe('SHELL')
  })

  it('bounds the public API cache to a fixed number of entries (evicts oldest)', async () => {
    globalThis.fetch = vi.fn(async req => makeResponse('api', { _url: req.url }))

    for (let i = 0; i < API_CACHE_MAX_ENTRIES + 5; i++) {
      await handleFetch({
        url: `${ORIGIN}/api/schedule?e=${i}`,
        method: 'GET',
        mode: 'cors',
      })
    }

    const largestCache = Math.max(...[...globalThis.caches._stores.values()].map(s => s.size))
    expect(largestCache).toBeLessThanOrEqual(API_CACHE_MAX_ENTRIES)
  })

  it('never caches admin API responses', async () => {
    globalThis.fetch = vi.fn(async () => makeResponse('admin'))

    await handleFetch({
      url: `${ORIGIN}/api/admin/users`,
      method: 'GET',
      mode: 'cors',
    })

    expect(allCachedEntries()).toBe(0)
  })

  it('networkFirstStrategy: serves cache when offline, re-throws when cache is empty', async () => {
    // Part A — warm cache: a successful fetch populates the API cache; a
    // subsequent fetch that throws (offline) must return the cached response.
    globalThis.fetch = vi.fn(async () => makeResponse('FIRST'))
    await handleFetch({
      url: `${ORIGIN}/api/schedule?e=warm`,
      method: 'GET',
      mode: 'cors',
    })

    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline')
    })

    const res = await handleFetch({
      url: `${ORIGIN}/api/schedule?e=warm`,
      method: 'GET',
      mode: 'cors',
    })
    expect(res._tag).toBe('FIRST')

    // Part B — cold cache: network throws and nothing is cached → must re-throw.
    await expect(
      handleFetch({
        url: `${ORIGIN}/api/schedule?e=cold`,
        method: 'GET',
        mode: 'cors',
      })
    ).rejects.toThrow()
  })

  it('navigation to an /api/ URL does not poison the /index.html shell (reorder guard)', async () => {
    // Regression: before the routing reorder, a navigate-mode request to any
    // /api/ path flowed into navigationStrategy and overwrote /index.html.
    globalThis.fetch = vi.fn(async () => makeResponse('ICS', { contentType: 'text/calendar' }))

    await handleFetch({
      url: `${ORIGIN}/api/feeds/ical`,
      method: 'GET',
      mode: 'navigate',
    })

    // After the fix this is routed to networkFirstStrategy (api-v4), not
    // navigationStrategy, so the static cache must stay empty.
    expect(await globalThis.caches.match('/index.html')).toBeUndefined()
    // The response should be cached under its own URL in the API cache.
    const apiStore = globalThis.caches._stores.get('api-v4')
    expect(apiStore?.has(`${ORIGIN}/api/feeds/ical`)).toBe(true)
  })

  it('navigation to /api/…/confirm-follow (text/html) does not overwrite /index.html', async () => {
    // The confirm-follow and unfollow endpoints return a friendly HTML page.
    // Without the reorder fix a content-type guard alone would not save us
    // because navigationStrategy would still be invoked.
    globalThis.fetch = vi.fn(async () => makeResponse('CONFIRM'))

    await handleFetch({
      url: `${ORIGIN}/api/bands/test/confirm-follow`,
      method: 'GET',
      mode: 'navigate',
    })

    expect(await globalThis.caches.match('/index.html')).toBeUndefined()
  })

  it('navigation to a non-HTML non-API resource does not overwrite /index.html (content-type guard)', async () => {
    // /sitemap.xml is a navigation (user opens it in a tab) but returns XML.
    // The content-type guard in navigationStrategy must suppress the shell write.
    globalThis.fetch = vi.fn(async () => makeResponse('SITEMAP', { contentType: 'application/xml' }))

    await handleFetch({
      url: `${ORIGIN}/sitemap.xml`,
      method: 'GET',
      mode: 'navigate',
    })

    expect(await globalThis.caches.match('/index.html')).toBeUndefined()
  })

  it('FIFO eviction: oldest entries are evicted first, newest entry is retained', async () => {
    globalThis.fetch = vi.fn(async req => makeResponse('api', { _url: req.url }))

    for (let i = 0; i < API_CACHE_MAX_ENTRIES + 3; i++) {
      await handleFetch({
        url: `${ORIGIN}/api/schedule?e=${i}`,
        method: 'GET',
        mode: 'cors',
      })
    }

    // The API cache is the largest store after these fetches.
    const largestStore = [...globalThis.caches._stores.values()].reduce(
      (max, s) => (s.size > max.size ? s : max),
      new Map()
    )

    // Oldest 3 entries (e=0, e=1, e=2) must have been evicted.
    expect(largestStore.has(`${ORIGIN}/api/schedule?e=0`)).toBe(false)
    expect(largestStore.has(`${ORIGIN}/api/schedule?e=1`)).toBe(false)
    expect(largestStore.has(`${ORIGIN}/api/schedule?e=2`)).toBe(false)
    // Newest entry (e=52) must still be present.
    expect(largestStore.has(`${ORIGIN}/api/schedule?e=${API_CACHE_MAX_ENTRIES + 2}`)).toBe(true)
    expect(largestStore.size).toBe(API_CACHE_MAX_ENTRIES)
  })
})

describe('service worker activate', () => {
  beforeEach(async () => {
    await loadServiceWorker()
  })

  it('activate deletes old-version caches and leaves current and unrelated caches intact', async () => {
    // Pre-populate old and current versioned caches, plus an unrelated one.
    await globalThis.caches.open('schedule-v3')
    await globalThis.caches.open('api-v3')
    await globalThis.caches.open('schedule-v4')
    await globalThis.caches.open('api-v4')
    await globalThis.caches.open('some-other-cache')

    const promises = []
    handlers.activate({ waitUntil: p => promises.push(p) })
    await Promise.all(promises)

    // Old-version schedule-/api- families must be gone.
    expect(globalThis.caches._stores.has('schedule-v3')).toBe(false)
    expect(globalThis.caches._stores.has('api-v3')).toBe(false)
    // Current-version caches and unrelated cache must survive.
    expect(globalThis.caches._stores.has('schedule-v4')).toBe(true)
    expect(globalThis.caches._stores.has('api-v4')).toBe(true)
    expect(globalThis.caches._stores.has('some-other-cache')).toBe(true)
  })
})
