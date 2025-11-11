import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App.jsx'
import EmbedPage from './pages/EmbedPage.jsx'
import SubscribePage from './pages/SubscribePage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { measurePageLoad } from './utils/performance'
import './index.css'

// Lazy load admin panel and band profiles (not needed for initial page load)
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'))
const BandProfilePage = lazy(() => import('./pages/BandProfilePage.jsx'))

const hostname = typeof window !== 'undefined' ? window.location.hostname || '' : ''
const isPreviewBuild = hostname.startsWith('dev.') || hostname.endsWith('.pages.dev')
const robotsMeta = typeof document !== 'undefined' ? document.querySelector("meta[name='robots']") : null
if (robotsMeta) {
  robotsMeta.setAttribute('content', isPreviewBuild ? 'noindex, nofollow' : 'index,follow')
} else if (typeof document !== 'undefined') {
  const meta = document.createElement('meta')
  meta.name = 'robots'
  meta.content = isPreviewBuild ? 'noindex, nofollow' : 'index,follow'
  document.head.appendChild(meta)
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-band-navy to-band-purple">
      <div className="text-white text-xl">Loading...</div>
    </div>
  )
}

// Service worker: TEMPORARILY DISABLED to fix caching issues during development
// Re-enable for production by uncommenting the registration code below
// if ('serviceWorker' in navigator) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker
//       .register('/sw.js')
//       .then(reg => console.log('SW registered:', reg.scope))
//       .catch(err => console.error('SW registration failed:', err))
//   })
// }

// Unregister any existing service workers to clear stale cache (dev only)
if ('serviceWorker' in navigator && import.meta.env.DEV) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    if (registrations.length > 0) {
      console.warn('Unregistering', registrations.length, 'service worker(s)...')
      registrations.forEach(registration => {
        registration.unregister().then(() => {
          console.warn('Service worker unregistered - Please refresh the page to see latest changes')
        })
      })
    }
  })
}

// Monitor performance (dev only for now)
if (import.meta.env.DEV) {
  measurePageLoad()
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Fan experience: Load immediately */}
          <Route path="/" element={<App />} />
          <Route path="/embed/:slug" element={<EmbedPage />} />
          <Route path="/subscribe" element={<SubscribePage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Band profiles: Lazy loaded */}
          <Route
            path="/band/:id"
            element={
              <ErrorBoundary title="Band Profile Error" message="Unable to load band profile. Please try again.">
                <Suspense fallback={<LoadingFallback />}>
                  <BandProfilePage />
                </Suspense>
              </ErrorBoundary>
            }
          />

          {/* Admin panel: Lazy loaded */}
          <Route
            path="/admin/*"
            element={
              <ErrorBoundary title="Admin Panel Error" message="An error occurred in the admin panel. Please refresh.">
                <Suspense fallback={<LoadingFallback />}>
                  <AdminApp />
                </Suspense>
              </ErrorBoundary>
            }
          />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
