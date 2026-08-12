import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('authApi.verifySession', () => {
  beforeEach(() => {
    vi.resetModules()
    window.localStorage.clear()
    document.cookie = 'csrf_token=test-csrf-token; path=/'
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })

  it('returns unauthorized without notifying auth subscribers on 401', async () => {
    const fetchMock = global.fetch
    fetchMock.mockResolvedValue(
      new globalThis.Response(JSON.stringify({ error: 'Unauthorized', message: 'Valid session required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { authApi, subscribeAdminAuthState } = await import('../adminApi.js')
    const onUnauthorized = vi.fn()
    const unsubscribe = subscribeAdminAuthState({ onUnauthorized })

    const result = await authApi.verifySession()

    expect(result).toEqual({ status: 'unauthorized' })
    expect(onUnauthorized).not.toHaveBeenCalled()

    unsubscribe()
  })

  it('returns a transient failure result and preserves persisted user data on server errors', async () => {
    const fetchMock = global.fetch
    fetchMock.mockResolvedValue(
      new globalThis.Response('<!DOCTYPE html><html>cloudflare</html>', {
        status: 503,
        headers: { 'Content-Type': 'text/html' },
      })
    )

    window.localStorage.setItem('userEmail', 'admin@test')
    window.localStorage.setItem('userName', 'Admin User')

    const { authApi } = await import('../adminApi.js')
    const result = await authApi.verifySession()

    expect(result.status).toBe('transient')
    expect(result.error).toBeInstanceOf(Error)
    expect(window.localStorage.getItem('userEmail')).toBe('admin@test')
  })
})

describe('eventsApi.setPublishState', () => {
  beforeEach(() => {
    vi.resetModules()
    document.cookie = 'csrf_token=test-csrf-token; path=/'
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })

  it('omits allowEmptyLineup from the request body when not passed', async () => {
    const fetchMock = global.fetch
    fetchMock.mockResolvedValue(
      new globalThis.Response(JSON.stringify({ success: true, event: { id: 1, status: 'published' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { eventsApi } = await import('../adminApi.js')
    await eventsApi.setPublishState(1, true)

    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(options.body)).toEqual({ publish: true })
  })

  it('omits allowEmptyLineup from the request body when explicitly false', async () => {
    const fetchMock = global.fetch
    fetchMock.mockResolvedValue(
      new globalThis.Response(JSON.stringify({ success: true, event: { id: 1, status: 'draft' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { eventsApi } = await import('../adminApi.js')
    await eventsApi.setPublishState(1, false, { allowEmptyLineup: false })

    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(options.body)).toEqual({ publish: false })
  })

  it('includes allowEmptyLineup: true in the request body when passed', async () => {
    const fetchMock = global.fetch
    fetchMock.mockResolvedValue(
      new globalThis.Response(JSON.stringify({ success: true, event: { id: 1, status: 'published' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { eventsApi } = await import('../adminApi.js')
    await eventsApi.setPublishState(1, true, { allowEmptyLineup: true })

    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(options.body)).toEqual({ publish: true, allowEmptyLineup: true })
  })

  // A truthy non-boolean must not reach the wire as `true`. The server rejects
  // non-booleans, but it never sees this one: coercing here would hand it a
  // literal `true` and open the empty-lineup guard on input written to be
  // refused. Throwing before the request keeps the client from laundering an
  // invalid value into a valid one.
  it.each([['yes'], [1], [{}], [[]]])('rejects a truthy non-boolean allowEmptyLineup (%p)', async value => {
    const fetchMock = global.fetch
    fetchMock.mockResolvedValue(
      new globalThis.Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { eventsApi } = await import('../adminApi.js')
    await expect(eventsApi.setPublishState(1, true, { allowEmptyLineup: value })).rejects.toThrow(TypeError)

    // The assertion that matters: no request was ever made, so the server had
    // no chance to be handed a laundered `true`.
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
