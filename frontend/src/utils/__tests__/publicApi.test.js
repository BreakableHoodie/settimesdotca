import { describe, expect, it, vi } from 'vitest'

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
  it('parses the fetch response body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new globalThis.Response(JSON.stringify({ id: 22, name: '$wamp A$$' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPublicJson('/api/bands/stats/22')).resolves.toEqual({ id: 22, name: '$wamp A$$' })
    expect(fetchMock).toHaveBeenCalledWith('/api/bands/stats/22', {})

    vi.unstubAllGlobals()
  })
})
