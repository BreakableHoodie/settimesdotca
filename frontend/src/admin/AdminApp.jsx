import { Routes, Route, Navigate } from 'react-router-dom'
import AdminLogin from './AdminLogin'
import AdminPanel from './AdminPanel'
import SignupPage from './SignupPage'
import { EventProvider } from '../contexts/EventContext'
import { ConfirmDialog } from '../components/ui'
import { useAdminAuthSession } from './hooks/useAdminAuthSession'

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
  const {
    checking,
    currentUser,
    idleCountdownSeconds,
    isAuthenticated,
    loginSucceeded,
    logout,
    showIdleWarning,
    staySignedIn,
  } = useAdminAuthSession()

  const handleLoginSuccess = async () => {
    await loginSucceeded()
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
                <AdminPanel currentUser={currentUser} onLogout={logout} />
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
          void staySignedIn()
        }}
        onCancel={() => {
          void logout({ markIdle: true })
        }}
        title="You’re about to be signed out"
        message={`You’ve been inactive. You’ll be signed out in ${idleCountdownSeconds} seconds.`}
        confirmText="Stay signed in"
        cancelText="Log out"
        variant="primary"
      />
    </>
  )
}
