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
