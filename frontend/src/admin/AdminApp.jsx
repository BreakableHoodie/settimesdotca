import { useState, useEffect } from 'react'
import AdminLogin from './AdminLogin'
import AdminPanel from './AdminPanel'

/**
 * AdminApp - Root component for the admin interface
 *
 * Manages authentication state and renders either the login screen
 * or the main admin panel based on authentication status.
 *
 * Usage:
 * - Import this component and render it at your /admin route
 * - Authentication state persists via sessionStorage
 * - Automatically checks for existing session on mount
 */
export default function AdminApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = () => {
      const adminPassword = window.sessionStorage.getItem('adminPassword')
      if (adminPassword) {
        // Could optionally verify the password with the backend here
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
    setIsAuthenticated(false)
  }

  // Show loading state while checking session
  if (checking) {
    return (
      <div className='min-h-screen bg-band-navy flex items-center justify-center'>
        <div className='text-band-orange text-lg'>Loading...</div>
      </div>
    )
  }

  // Show login or admin panel based on auth state
  if (!isAuthenticated) {
    return <AdminLogin onLoginSuccess={handleLoginSuccess} />
  }

  return <AdminPanel onLogout={handleLogout} />
}
