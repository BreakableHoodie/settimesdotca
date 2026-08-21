import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchPublicJson, parsePublicApiResponse } from '../publicApi.js'

describe('parsePublicApiResponse', () => {
  it('returns parsed JSON for successful responses', async () => {
    const response = new globalThis.Response(JSON.stringify({ now: [], upcoming: [], past: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    await expect(parsePublicApiResponse(response)).resolves.toEqual({ now: [], upcoming: [], past: [] })
  })

  it('surfaces API error messages for publish-gated responses', async () => {
    const response = new globalThis.Response(
      JSON.stringify({
        error: 'Public data is not yet published',
        message: 'Event data will be available once publishing is enabled.',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    )

    await expect(parsePublicApiResponse(response, 'Failed to fetch events timeline')).rejects.toMatchObject({
      message: 'Event data will be available once publishing is enabled.',
      status: 503,
      details: {
        error: 'Public data is not yet published',
        message: 'Event data will be available once publishing is enabled.',
      },
    })
  })
})

describe('fetchPublicJson', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses the fetch response body', async () => {
    const fetchMock = global.fetch
    fetchMock.mockResolvedValue(
      new globalThis.Response(JSON.stringify({ id: 22, name: '$wamp A$$' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await expect(fetchPublicJson('/api/bands/stats/22')).resolves.toEqual({ id: 22, name: '$wamp A$$' })
    expect(fetchMock).toHaveBeenCalledWith('/api/bands/stats/22', {})
  })

  describe('transient failure retry', () => {
    const RETRY_DELAY_MS = 600

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('retries once and succeeds when a GET request first returns a 5xx', async () => {
      const fetchMock = global.fetch
      fetchMock
        .mockResolvedValueOnce(
          new globalThis.Response(JSON.stringify({ error: 'Database error', message: 'nope' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        )
        .mockResolvedValueOnce(
          new globalThis.Response(JSON.stringify({ now: [], upcoming: [], past: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )

      const promise = fetchPublicJson('/api/events/timeline')
      const expectation = expect(promise).resolves.toEqual({ now: [], upcoming: [], past: [] })
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)

      await expectation
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('retries once and succeeds when a GET request first throws a network error', async () => {
      const fetchMock = global.fetch
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(
        new globalThis.Response(JSON.stringify({ id: 22 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const promise = fetchPublicJson('/api/events/timeline')
      const expectation = expect(promise).resolves.toEqual({ id: 22 })
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)

      await expectation
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('does not retry a 4xx response', async () => {
      const fetchMock = global.fetch
      fetchMock.mockResolvedValueOnce(
        new globalThis.Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await expect(fetchPublicJson('/api/events/timeline')).rejects.toMatchObject({ status: 404 })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('does not retry a non-GET request even on a 5xx response', async () => {
      const fetchMock = global.fetch
      fetchMock.mockResolvedValueOnce(
        new globalThis.Response(JSON.stringify({ error: 'Database error', message: 'boom' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await expect(fetchPublicJson('/api/events/timeline', { method: 'POST' })).rejects.toMatchObject({
        status: 500,
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('propagates the error when both attempts return a 5xx', async () => {
      const fetchMock = global.fetch
      fetchMock.mockResolvedValue(
        new globalThis.Response(JSON.stringify({ error: 'Database error', message: 'still down' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const promise = fetchPublicJson('/api/events/timeline')
      const expectation = expect(promise).rejects.toMatchObject({ status: 500, message: 'still down' })
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)

      await expectation
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })
})

describe('fetchPublicJson — abort is not a transient failure', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does NOT retry an aborted request', async () => {
    // Before this guard: 2 fetch calls and a ~600ms delay. A component that
    // unmounted mid-flight fired a second request that could only fail again.
    // App.jsx's schedule load passes an AbortSignal, so this is the real path.
    let calls = 0
    vi.stubGlobal('fetch', async () => {
      calls++
      const error = new Error('The operation was aborted.')
      error.name = 'AbortError'
      throw error
    })
    const controller = new AbortController()
    controller.abort()

    await expect(fetchPublicJson('/api/x', { signal: controller.signal })).rejects.toThrow()
    expect(calls).toBe(1)
  })

  it('does NOT retry when the signal aborted without a named AbortError', async () => {
    // Some runtimes reject with a plain error when a signal aborts between
    // attempts, so the guard checks the signal as well as the name.
    let calls = 0
    const controller = new AbortController()
    vi.stubGlobal('fetch', async () => {
      calls++
      controller.abort()
      throw new TypeError('Failed to fetch')
    })

    await expect(fetchPublicJson('/api/x', { signal: controller.signal })).rejects.toThrow()
    expect(calls).toBe(1)
  })

  it('STILL retries a genuine network error — the guard must not disable retry', async () => {
    let calls = 0
    vi.stubGlobal('fetch', async () => {
      calls++
      throw new TypeError('Failed to fetch')
    })

    await expect(fetchPublicJson('/api/x')).rejects.toThrow()
    expect(calls).toBe(2)
  })

  it('STILL retries a 5xx', async () => {
    let calls = 0
    vi.stubGlobal('fetch', async () => {
      calls++
      // Plain stub rather than `new Response` — the frontend ESLint env does not
      // declare it, and only these four members are read.
      return {
        ok: false,
        status: 503,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      }
    })

    await expect(fetchPublicJson('/api/x')).rejects.toThrow()
    expect(calls).toBe(2)
  })

  it('never retries a mutation, aborted or not', async () => {
    // A retried POST can double a side effect. This was already true; asserting
    // it so the abort guard cannot be "simplified" into changing it.
    let calls = 0
    vi.stubGlobal('fetch', async () => {
      calls++
      throw new TypeError('Failed to fetch')
    })

    await expect(fetchPublicJson('/api/x', { method: 'POST' })).rejects.toThrow()
    expect(calls).toBe(1)
  })
})

describe('fetchPublicJson preserves the error TYPE its callers branch on', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rethrows a network failure as a TypeError, not a wrapped Error', async () => {
    // App.jsx decides between the branded offline card and the generic error
    // card with `err instanceof TypeError` (#595) — a fetch that never reached
    // the server surfaces as TypeError, an HTTP error does not. Wrapping the
    // network error here would silently turn every offline case into a generic
    // failure card.
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(fetchPublicJson('/api/schedule?event=current')).rejects.toBeInstanceOf(TypeError)
  })

  it('throws a plain Error (NOT a TypeError) for an HTTP failure', async () => {
    // The other half of the same branch: a 404 must not be mistaken for offline.
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 404,
      headers: { get: () => 'application/json' },
      json: async () => ({ message: 'Not found' }),
    }))

    const error = await fetchPublicJson('/api/schedule?event=nope').catch(e => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(TypeError)
    expect(error.status).toBe(404)
  })
})
