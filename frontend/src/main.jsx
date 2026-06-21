import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { ThemeProvider } from './components/ThemeProvider.jsx'
import App from './App.jsx'
import EventsPage from './pages/EventsPage.jsx'
import EmbedPage from './pages/EmbedPage.jsx'
import SubscribePage from './pages/SubscribePage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'
import ActivatePage from './pages/ActivatePage.jsx'
import PrivacyPage from './pages/PrivacyPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { measurePageLoad } from './utils/performance'
import './index.css'

// Lazy load admin panel and band profiles (not needed for initial page load)
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'))
const BandProfilePage = lazy(() => import('./pages/BandProfilePage.jsx'))
const EventRecapPage = lazy(() => import('./pages/EventRecapPage.jsx'))
const SharePreviewPage = lazy(() => import('./pages/SharePreviewPage.jsx'))
const ArtistsPage = lazy(() => import('./pages/ArtistsPage.jsx'))

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

const BUILD_ID = '2026-01-30-1605'
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  // Helps confirm which build is running in production.
  window.__SETTIMES_BUILD_ID__ = BUILD_ID
}

function LoadingFallback() {
  return (
    <div
      className="flex items-center justify-center min-h-screen bg-linear-to-br from-bg-navy to-bg-purple"
      role="status"
      aria-live="polite"
    >
      <div className="text-white text-xl">Loading...</div>
    </div>
  )
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW registration failed:', err))
  })
}

// Monitor performance (dev only for now)
if (import.meta.env.DEV) {
  measurePageLoad()
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <HelmetProvider>
          <BrowserRouter>
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-9999 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded focus:text-sm focus:font-medium"
            >
              Skip to main content
            </a>
            <Routes>
              {/* Fan experience: Load immediately */}
              <Route path="/" element={<EventsPage />} />
              <Route path="/event/:slug" element={<App />} />
              <Route path="/embed/:slug" element={<EmbedPage />} />
              <Route path="/subscribe" element={<SubscribePage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/activate" element={<ActivatePage />} />
              <Route path="/privacy" element={<PrivacyPage />} />

              {/* Event recap: Lazy loaded */}
              <Route
                path="/events/:slug/recap"
                element={
                  <ErrorBoundary title="Event Recap Error" message="Unable to load event recap. Please try again.">
                    <Suspense fallback={<LoadingFallback />}>
                      <EventRecapPage />
                    </Suspense>
                  </ErrorBoundary>
                }
              />

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

              {/* Artist directory: Lazy loaded */}
              <Route
                path="/artists"
                element={
                  <ErrorBoundary title="Artists Error" message="Unable to load the artist directory. Please try again.">
                    <Suspense fallback={<LoadingFallback />}>
                      <ArtistsPage />
                    </Suspense>
                  </ErrorBoundary>
                }
              />

              {/* Share preview: Lazy loaded */}
              <Route
                path="/s/:slug"
                element={
                  <ErrorBoundary title="Share Preview Error" message="Unable to load this shared route.">
                    <Suspense fallback={<LoadingFallback />}>
                      <SharePreviewPage />
                    </Suspense>
                  </ErrorBoundary>
                }
              />

              {/* Admin panel: Lazy loaded */}
              <Route
                path="/admin/*"
                element={
                  <ErrorBoundary
                    title="Admin Panel Error"
                    message="An error occurred in the admin panel. Please refresh."
                  >
                    <Suspense fallback={<LoadingFallback />}>
                      <AdminApp />
                    </Suspense>
                  </ErrorBoundary>
                }
              />
              {/* 404 catch-all */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </BrowserRouter>
        </HelmetProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
