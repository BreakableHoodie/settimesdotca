import { useEffect, useState } from 'react'

const STORAGE_KEY = 'privacy-acknowledged'

export default function PrivacyBanner() {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(STORAGE_KEY)
    setDismissed(stored === 'true')
  }, [])

  if (dismissed) return null

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, 'true')
    }
    setDismissed(true)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-bg-navy/95 px-4 py-3 text-sm text-gray-300 backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>We collect anonymous usage data to improve artist profiles. No personal data is stored.</p>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-full border border-accent-500/60 px-4 py-1 text-accent-300 transition hover:border-accent-400 hover:text-white"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
