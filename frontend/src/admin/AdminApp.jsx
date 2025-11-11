import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AdminLogin from './AdminLogin'
import SignupPage from './SignupPage'
import AdminPanel from './AdminPanel'
import { authApi } from '../utils/adminApi'
import { EventProvider } from '../contexts/EventContext'

/**
 * AdminApp - Root component for the admin interface
 *
 * Manages authentication state and renders either the login screen
 * or the main admin panel based on authentication status.
 *
 * Usage:
 * - Import this component and render it at your /admin/* route
 * - Authentication state persists via sessionStorage
 * - Automatically checks for existing session on mount
 * - Wraps AdminPanel with EventProvider for event context management
 */
export default function AdminApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = () => {
      const currentUser = authApi.getCurrentUser()
      if (currentUser) {
        setIsAuthenticated(true)
      }
      setChecking(false)
    }

    checkSession()
  }, [])

  const handleLoginSuccess = () => {
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    authApi.logout()
    setIsAuthenticated(false)
  }

  // Show loading state while checking session
  if (checking) {
    return (
      <div className="min-h-screen bg-band-navy flex items-center justify-center">
        <div className="text-band-orange text-lg">Loading...</div>
      </div>
    )
  }

  return (
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
  )
}
