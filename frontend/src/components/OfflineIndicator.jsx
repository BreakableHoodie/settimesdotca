import { useState, useEffect } from 'react'

const PRIVACY_BANNER_OFFSET = 'calc(1rem + var(--privacy-banner-height, 0px))'

export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div
      className="fixed left-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-warning-500 px-4 py-3 text-bg-navy shadow-lg"
      style={{ bottom: PRIVACY_BANNER_OFFSET }}
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
      <span className="font-medium">You&apos;re offline - using cached data</span>
    </div>
  )
}
