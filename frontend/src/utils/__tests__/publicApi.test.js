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
