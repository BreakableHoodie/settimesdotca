import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AdminLogin from './AdminLogin'
import { EventProvider } from '../contexts/EventContext'
import { ConfirmDialog } from '../components/ui'
import { useAdminAuthSession } from './hooks/useAdminAuthSession'

// Lazy-load heavy admin routes so the /admin/login path ships a minimal chunk.
// Quill + DOMPurify (pulled in by AdminPanel's RichTextEditor) stay out of the
// login bundle and are fetched only after the user authenticates.
const AdminPanel = lazy(() => import('./AdminPanel'))
const SignupPage = lazy(() => import('./SignupPage'))

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
      <div data-theme="midnight-ember" className="min-h-screen bg-bg-navy flex items-center justify-center">
        <div className="text-accent-400 text-lg">Loading...</div>
      </div>
    )
  }

  // Suspense fallback shown while the AdminPanel / SignupPage lazy chunk loads.
  // Admin is dark-pinned, so text-white is correct here (not a theme violation).
  const adminFallback = (
    <div className="min-h-screen bg-bg-navy flex items-center justify-center">
      <div className="text-white/60 text-lg">Loading…</div>
    </div>
  )

  return (
    // Admin is pinned to the dark theme — it should not follow the visitor's
    // public theme pick (it is a tool, not a vibe). display:contents keeps this
    // wrapper layout-transparent while providing the data-theme token context.
    <div data-theme="midnight-ember" className="contents">
      <Suspense fallback={adminFallback}>
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
      </Suspense>

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
    </div>
  )
}
