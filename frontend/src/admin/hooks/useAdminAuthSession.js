import { useCallback, useEffect, useRef, useState } from 'react'
import { authApi, subscribeAdminAuthState } from '../../utils/adminApi'

const WARNING_LEAD_MS = 5 * 60 * 1000
const KEEP_ALIVE_MIN_INTERVAL_MS = 2 * 60 * 1000

function clearTimeoutRef(ref) {
  if (ref.current) {
    clearTimeout(ref.current)
    ref.current = null
  }
}

function clearIntervalRef(ref) {
  if (ref.current) {
    clearInterval(ref.current)
    ref.current = null
  }
}

export function useAdminAuthSession() {
  const [currentUser, setCurrentUser] = useState(() => authApi.getCurrentUser())
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(currentUser))
  const [checking, setChecking] = useState(true)
  const [showIdleWarning, setShowIdleWarning] = useState(false)
  const [idleCountdownSeconds, setIdleCountdownSeconds] = useState(0)
  const [sessionTiming, setSessionTiming] = useState(null)

  const warningTimeoutRef = useRef(null)
  const logoutTimeoutRef = useRef(null)
  const countdownIntervalRef = useRef(null)
  const lastKeepAliveRef = useRef(0)
  const logoutInFlightRef = useRef(false)

  const clearSessionTimers = useCallback(() => {
    clearTimeoutRef(warningTimeoutRef)
    clearTimeoutRef(logoutTimeoutRef)
    clearIntervalRef(countdownIntervalRef)
  }, [])

  const logout = useCallback(
    async ({ markIdle = false } = {}) => {
      if (logoutInFlightRef.current) return

      logoutInFlightRef.current = true
      clearSessionTimers()
      setShowIdleWarning(false)
      setIdleCountdownSeconds(0)
      setSessionTiming(null)

      if (markIdle) {
        window.sessionStorage.setItem('idleLogout', '1')
      }

      try {
        await authApi.logout()
        setCurrentUser(null)
        setIsAuthenticated(false)
      } finally {
        logoutInFlightRef.current = false
      }
    },
    [clearSessionTimers]
  )

  const refreshSession = useCallback(
    async ({ force = false } = {}) => {
      const now = Date.now()
      if (!force && now - lastKeepAliveRef.current < KEEP_ALIVE_MIN_INTERVAL_MS) {
        return null
      }

      lastKeepAliveRef.current = now
      const sessionData = await authApi.verifySession()

      if (sessionData?.user) {
        setCurrentUser(sessionData.user)
        setIsAuthenticated(true)
        return sessionData
      }

      if (authApi.getCurrentUser()) {
        await logout()
        return null
      }

      setCurrentUser(null)
      setIsAuthenticated(false)
      setSessionTiming(null)
      clearSessionTimers()
      return null
    },
    [clearSessionTimers, logout]
  )

  const loginSucceeded = useCallback(async () => {
    const persistedUser = authApi.getCurrentUser()
    setCurrentUser(persistedUser)
    setIsAuthenticated(Boolean(persistedUser))
    await refreshSession({ force: true })
  }, [refreshSession])

  const staySignedIn = useCallback(async () => {
    setShowIdleWarning(false)
    await refreshSession({ force: true })
  }, [refreshSession])

  useEffect(() => {
    const unsubscribe = subscribeAdminAuthState({
      onUnauthorized: () => {
        void logout()
      },
      onSessionTiming: timing => {
        setSessionTiming(timing)
      },
    })

    return unsubscribe
  }, [logout])

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      const persistedUser = authApi.getCurrentUser()
      if (persistedUser) {
        setCurrentUser(persistedUser)
        setIsAuthenticated(true)
      }

      await refreshSession({ force: true })

      if (!cancelled) {
        setChecking(false)
      }
    }

    bootstrap()

    return () => {
      cancelled = true
      clearSessionTimers()
    }
  }, [clearSessionTimers, refreshSession])

  useEffect(() => {
    clearSessionTimers()

    if (!isAuthenticated || !sessionTiming) {
      setShowIdleWarning(false)
      setIdleCountdownSeconds(0)
      return undefined
    }

    const timeRemainingMs = Math.max(0, sessionTiming.timeRemainingSeconds * 1000)
    if (timeRemainingMs <= 0) {
      void logout({ markIdle: true })
      return undefined
    }

    if (timeRemainingMs <= WARNING_LEAD_MS || sessionTiming.warning) {
      setShowIdleWarning(true)
      setIdleCountdownSeconds(Math.ceil(timeRemainingMs / 1000))
    } else {
      setShowIdleWarning(false)
      warningTimeoutRef.current = setTimeout(() => {
        setShowIdleWarning(true)
        setIdleCountdownSeconds(Math.ceil(WARNING_LEAD_MS / 1000))
      }, timeRemainingMs - WARNING_LEAD_MS)
    }

    logoutTimeoutRef.current = setTimeout(() => {
      void logout({ markIdle: true })
    }, timeRemainingMs)

    return () => {
      clearSessionTimers()
    }
  }, [clearSessionTimers, isAuthenticated, logout, sessionTiming])

  useEffect(() => {
    clearIntervalRef(countdownIntervalRef)

    if (!showIdleWarning) {
      return undefined
    }

    countdownIntervalRef.current = setInterval(() => {
      setIdleCountdownSeconds(prev => (prev > 0 ? prev - 1 : 0))
    }, 1000)

    return () => {
      clearIntervalRef(countdownIntervalRef)
    }
  }, [showIdleWarning])

  useEffect(() => {
    if (!isAuthenticated) {
      clearSessionTimers()
      return undefined
    }

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    const handleActivity = () => {
      if (showIdleWarning) return
      void refreshSession()
    }

    activityEvents.forEach(event => window.addEventListener(event, handleActivity))

    return () => {
      activityEvents.forEach(event => window.removeEventListener(event, handleActivity))
    }
  }, [isAuthenticated, showIdleWarning, refreshSession, clearSessionTimers])

  return {
    checking,
    currentUser,
    idleCountdownSeconds,
    isAuthenticated,
    loginSucceeded,
    logout,
    showIdleWarning,
    staySignedIn,
  }
}
