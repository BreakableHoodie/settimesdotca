import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAdminAuthSession } from '../useAdminAuthSession'

const WARNING_LEAD_MS = 5 * 60 * 1000

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
    adminApiMocks.authApi.verifySession.mockResolvedValue({ status: 'unauthorized' })
    adminApiMocks.authApi.logout.mockResolvedValue(undefined)
  })

  it('bootstraps authenticated state from the verified server session', async () => {
    adminApiMocks.authApi.verifySession.mockResolvedValue({
      status: 'authenticated',
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
      status: 'authenticated',
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
      status: 'authenticated',
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

  it('logs out persisted auth state when verifySession reports unauthorized', async () => {
    adminApiMocks.authApi.getCurrentUser.mockReturnValue({
      email: 'admin@test',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
    })
    adminApiMocks.authApi.verifySession.mockResolvedValue({ status: 'unauthorized' })

    const { result } = renderHook(() => useAdminAuthSession())

    await waitFor(() => {
      expect(result.current.checking).toBe(false)
    })

    expect(adminApiMocks.authApi.logout).toHaveBeenCalledTimes(1)
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('preserves persisted auth state when verifySession fails transiently', async () => {
    adminApiMocks.authApi.getCurrentUser.mockReturnValue({
      email: 'admin@test',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
    })
    adminApiMocks.authApi.verifySession.mockResolvedValue({
      status: 'transient',
      error: new Error('Server temporarily unavailable'),
    })

    const { result } = renderHook(() => useAdminAuthSession())

    await waitFor(() => {
      expect(result.current.checking).toBe(false)
    })

    expect(adminApiMocks.authApi.logout).not.toHaveBeenCalled()
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.currentUser.email).toBe('admin@test')
  })

  describe('timer behavior', () => {
    beforeEach(() => {
      adminApiMocks.authApi.verifySession.mockResolvedValue({
        status: 'authenticated',
        user: { email: 'admin@test', firstName: 'Admin', lastName: 'User', role: 'admin' },
      })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('schedules the idle warning after timeRemaining minus WARNING_LEAD_MS elapses', async () => {
      const { result } = renderHook(() => useAdminAuthSession())
      await waitFor(() => expect(result.current.checking).toBe(false))

      vi.useFakeTimers({ now: Date.now() })

      act(() => {
        adminApiMocks.getSubscriber()?.onSessionTiming({
          absoluteRemainingSeconds: 600,
          idleRemainingSeconds: 600,
          timeRemainingSeconds: 600,
          warning: false,
        })
      })

      expect(result.current.showIdleWarning).toBe(false)

      act(() => {
        vi.advanceTimersByTime(600 * 1000 - WARNING_LEAD_MS)
      })

      expect(result.current.showIdleWarning).toBe(true)
      expect(result.current.idleCountdownSeconds).toBe(300)
    })

    it('auto-logs out when the session timer elapses', async () => {
      const { result } = renderHook(() => useAdminAuthSession())
      await waitFor(() => expect(result.current.checking).toBe(false))

      vi.useFakeTimers({ now: Date.now() })

      act(() => {
        adminApiMocks.getSubscriber()?.onSessionTiming({
          absoluteRemainingSeconds: 30,
          idleRemainingSeconds: 30,
          timeRemainingSeconds: 30,
          warning: false,
        })
      })

      await act(async () => {
        vi.advanceTimersByTime(30 * 1000)
      })

      expect(adminApiMocks.authApi.logout).toHaveBeenCalledTimes(1)
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('throttles verifySession calls within KEEP_ALIVE_MIN_INTERVAL_MS', async () => {
      renderHook(() => useAdminAuthSession())
      await waitFor(() => expect(adminApiMocks.authApi.verifySession).toHaveBeenCalledTimes(1))

      vi.useFakeTimers({ now: Date.now() })

      // rapid activity — both calls fall within the throttle window set during bootstrap
      act(() => {
        window.dispatchEvent(new Event('mousemove'))
        window.dispatchEvent(new Event('mousemove'))
      })
      await act(async () => {})

      expect(adminApiMocks.authApi.verifySession).toHaveBeenCalledTimes(1)

      // advance past the throttle window, then fire another event
      act(() => {
        vi.advanceTimersByTime(2 * 60 * 1000 + 1)
      })

      act(() => {
        window.dispatchEvent(new Event('mousemove'))
      })
      await act(async () => {})

      expect(adminApiMocks.authApi.verifySession).toHaveBeenCalledTimes(2)
    })
  })
})
