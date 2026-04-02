import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAdminAuthSession } from '../useAdminAuthSession'

const adminApiMocks = vi.hoisted(() => {
  const authApi = {
    getCurrentUser: vi.fn(),
    logout: vi.fn(),
    verifySession: vi.fn(),
  }

  let subscriber = null

  return {
    authApi,
    getSubscriber: () => subscriber,
    subscribeAdminAuthState: vi.fn(handler => {
      subscriber = handler
      return () => {
        if (subscriber === handler) {
          subscriber = null
        }
      }
    }),
  }
})

vi.mock('../../../utils/adminApi', () => ({
  authApi: adminApiMocks.authApi,
  subscribeAdminAuthState: adminApiMocks.subscribeAdminAuthState,
}))

describe('useAdminAuthSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    adminApiMocks.authApi.getCurrentUser.mockReturnValue(null)
    adminApiMocks.authApi.verifySession.mockResolvedValue(null)
    adminApiMocks.authApi.logout.mockResolvedValue(undefined)
  })

  it('bootstraps authenticated state from the verified server session', async () => {
    adminApiMocks.authApi.verifySession.mockResolvedValue({
      user: { email: 'admin@test', firstName: 'Admin', lastName: 'User', role: 'admin' },
    })

    const { result } = renderHook(() => useAdminAuthSession())

    await waitFor(() => {
      expect(result.current.checking).toBe(false)
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.currentUser.email).toBe('admin@test')
  })

  it('shows the warning state from server timing headers', async () => {
    adminApiMocks.authApi.verifySession.mockResolvedValue({
      user: { email: 'admin@test', firstName: 'Admin', lastName: 'User', role: 'admin' },
    })

    const { result } = renderHook(() => useAdminAuthSession())

    await waitFor(() => {
      expect(result.current.checking).toBe(false)
    })

    act(() => {
      adminApiMocks.getSubscriber()?.onSessionTiming({
        absoluteRemainingSeconds: 600,
        idleRemainingSeconds: 240,
        timeRemainingSeconds: 240,
        warning: true,
      })
    })

    expect(result.current.showIdleWarning).toBe(true)
    expect(result.current.idleCountdownSeconds).toBe(240)
  })

  it('logs out through the centralized handler on unauthorized responses', async () => {
    adminApiMocks.authApi.verifySession.mockResolvedValue({
      user: { email: 'admin@test', firstName: 'Admin', lastName: 'User', role: 'admin' },
    })

    const { result } = renderHook(() => useAdminAuthSession())

    await waitFor(() => {
      expect(result.current.checking).toBe(false)
    })

    await act(async () => {
      await adminApiMocks.getSubscriber()?.onUnauthorized()
    })

    expect(adminApiMocks.authApi.logout).toHaveBeenCalledTimes(1)
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.currentUser).toBeNull()
  })
})
