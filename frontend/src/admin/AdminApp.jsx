import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AdminLogin from './AdminLogin'
import AdminPanel from './AdminPanel'
import SignupPage from './SignupPage'
import { authApi } from '../utils/adminApi'
import { EventProvider } from '../contexts/EventContext'
import { ConfirmDialog } from '../components/ui'

/**
 * AdminApp - Root component for the admin interface
 *
 * Manages authentication state and renders either the login screen
 * or the main admin panel based on authentication status.
 *
 * Usage:
 * - Import this component and render it at your /admin/* route
 * - Authentication state persists via HTTPOnly cookie + localStorage user info
 * - Automatically checks for existing session on mount
 * - Wraps AdminPanel with EventProvider for event context management
 */
export default function AdminApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)
  const [showIdleWarning, setShowIdleWarning] = useState(false)
  const [idleCountdownSeconds, setIdleCountdownSeconds] = useState(0)

  const idleWarningTimeoutRef = useRef(null)
  const idleLogoutTimeoutRef = useRef(null)
  const idleCountdownIntervalRef = useRef(null)
  const lastActivityRef = useRef(Date.now())
  const lastKeepAliveRef = useRef(0)

  const IDLE_TIMEOUT_MS = 30 * 60 * 1000
  const IDLE_WARNING_MS = 5 * 60 * 1000
  const KEEP_ALIVE_MIN_INTERVAL_MS = 2 * 60 * 1000

  const clearIdleTimers = () => {
    if (idleWarningTimeoutRef.current) {
      clearTimeout(idleWarningTimeoutRef.current)
      idleWarningTimeoutRef.current = null
    }
    if (idleLogoutTimeoutRef.current) {
      clearTimeout(idleLogoutTimeoutRef.current)
      idleLogoutTimeoutRef.current = null
    }
    if (idleCountdownIntervalRef.current) {
      clearInterval(idleCountdownIntervalRef.current)
      idleCountdownIntervalRef.current = null
    }
  }

  const handleIdleLogout = () => {
    clearIdleTimers()
    setShowIdleWarning(false)
    window.sessionStorage.setItem('idleLogout', '1')
    authApi.logout()
    setIsAuthenticated(false)
  }

  const refreshSession = async () => {
    const now = Date.now()
    if (now - lastKeepAliveRef.current < KEEP_ALIVE_MIN_INTERVAL_MS) {
      return
    }
    lastKeepAliveRef.current = now
    const sessionData = await authApi.verifySession()
    if (!sessionData?.user) {
      handleIdleLogout()
    }
  }

  const scheduleIdleTimers = () => {
    clearIdleTimers()
    const warningDelay = Math.max(IDLE_TIMEOUT_MS - IDLE_WARNING_MS, 1000)

    idleWarningTimeoutRef.current = setTimeout(() => {
      setShowIdleWarning(true)
      setIdleCountdownSeconds(Math.ceil(IDLE_WARNING_MS / 1000))
      idleCountdownIntervalRef.current = setInterval(() => {
        setIdleCountdownSeconds(prev => {
          if (prev <= 1) {
            clearIdleTimers()
            handleIdleLogout()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }, warningDelay)

    idleLogoutTimeoutRef.current = setTimeout(() => {
      handleIdleLogout()
    }, IDLE_TIMEOUT_MS)
  }

  const registerActivity = () => {
    lastActivityRef.current = Date.now()
    if (showIdleWarning) {
      setShowIdleWarning(false)
    }
    scheduleIdleTimers()
    refreshSession()
  }

  const handleLogout = () => {
    authApi.logout()
    setIsAuthenticated(false)
  }

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      // First check if we have local data to show UI immediately (optimistic)
      const localUser = authApi.getCurrentUser()
      if (localUser) {
        setIsAuthenticated(true)
      }

      // Then verify with backend to ensure session is actually valid
      try {
        const sessionData = await authApi.verifySession()
        if (sessionData?.user) {
          setIsAuthenticated(true)
        } else {
          // If verification fails, logout (clears local storage and state)
          if (localUser) {
            console.warn('Session verification failed, logging out...')
            authApi.logout()
            setIsAuthenticated(false)
          }
        }
      } catch (error) {
        console.error('Session check failed:', error)
        if (localUser) {
          authApi.logout()
          setIsAuthenticated(false)
        }
      } finally {
        setChecking(false)
      }
    }

    checkSession()
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      clearIdleTimers()
      return
    }

    scheduleIdleTimers()
    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    activityEvents.forEach(event => window.addEventListener(event, registerActivity))

    return () => {
      activityEvents.forEach(event => window.removeEventListener(event, registerActivity))
      clearIdleTimers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, showIdleWarning])

  // Listen for unauthorized events (401) from API
  useEffect(() => {
    const handleUnauthorized = () => {
      console.error('AdminApp received auth:unauthorized event, logging out...')
      handleLogout()
    }

    window.addEventListener('auth:unauthorized', handleUnauthorized)
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized)
    }
  }, [])

  const handleLoginSuccess = () => {
    setIsAuthenticated(true)
  }

  // Show loading state while checking session
  if (checking) {
    return (
      <div className="min-h-screen bg-bg-navy flex items-center justify-center">
        <div className="text-accent-400 text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <>
      <Routes>
        <Route
          path="login"
          element={
            isAuthenticated ? <Navigate to="/admin" replace /> : <AdminLogin onLoginSuccess={handleLoginSuccess} />
          }
        />
        <Route path="signup" element={isAuthenticated ? <Navigate to="/admin" replace /> : <SignupPage />} />
        <Route
          path="*"
          element={
            isAuthenticated ? (
              <EventProvider>
                <AdminPanel onLogout={handleLogout} />
              </EventProvider>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
      </Routes>

      <ConfirmDialog
        isOpen={showIdleWarning}
        onConfirm={() => {
          setShowIdleWarning(false)
          registerActivity()
        }}
        onCancel={handleIdleLogout}
        title="You’re about to be signed out"
        message={`You’ve been inactive. You’ll be signed out in ${idleCountdownSeconds} seconds.`}
        confirmText="Stay signed in"
        cancelText="Log out"
        variant="primary"
      />
    </>
  )
}
