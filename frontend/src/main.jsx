import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App.jsx'
import EmbedPage from './pages/EmbedPage.jsx'
import SubscribePage from './pages/SubscribePage.jsx'
import { measurePageLoad } from './utils/performance'
import './index.css'

// Lazy load admin panel (not needed for fans)
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'))

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

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.error('SW registration failed:', err))
  })
}

// Monitor performance (dev only for now)
if (import.meta.env.DEV) {
  measurePageLoad()
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Fan experience: Load immediately */}
        <Route path="/" element={<App />} />
        <Route path="/embed/:slug" element={<EmbedPage />} />
        <Route path="/subscribe" element={<SubscribePage />} />

        {/* Admin panel: Lazy loaded */}
        <Route path="/admin/*" element={
          <Suspense fallback={<LoadingFallback />}>
            <AdminApp />
          </Suspense>
        } />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
