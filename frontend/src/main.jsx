import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import AdminApp from './admin/AdminApp.jsx'
import './index.css'

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

// TEMPORARILY DISABLED: Unregister any existing service workers to troubleshoot FA icon issue
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(registration => {
        registration.unregister().then(success => {
          if (success) {
            console.warn('[App] Service worker unregistered:', registration.scope)
          }
        })
      })
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<App />} />
        <Route path='/admin' element={<AdminApp />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
