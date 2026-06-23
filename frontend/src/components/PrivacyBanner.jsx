import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const STORAGE_KEY = 'privacy-acknowledged'
const PRIVACY_BANNER_HEIGHT_VAR = '--privacy-banner-height'

export default function PrivacyBanner() {
  const [dismissed, setDismissed] = useState(true)
  const bannerRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(STORAGE_KEY)
    setDismissed(stored === 'true')
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined
    }

    const rootStyle = document.documentElement.style

    if (dismissed) {
      rootStyle.removeProperty(PRIVACY_BANNER_HEIGHT_VAR)
      return undefined
    }

    const updateHeight = () => {
      const height = bannerRef.current?.offsetHeight ?? 0
      rootStyle.setProperty(PRIVACY_BANNER_HEIGHT_VAR, `${height}px`)
    }

    updateHeight()
    const resizeObserverCtor = typeof window !== 'undefined' ? window.ResizeObserver : undefined

    if (typeof resizeObserverCtor !== 'undefined' && bannerRef.current) {
      const resizeObserver = new resizeObserverCtor(() => {
        updateHeight()
      })
      resizeObserver.observe(bannerRef.current)

      return () => {
        resizeObserver.disconnect()
        rootStyle.removeProperty(PRIVACY_BANNER_HEIGHT_VAR)
      }
    }

    window.addEventListener('resize', updateHeight)

    return () => {
      window.removeEventListener('resize', updateHeight)
      rootStyle.removeProperty(PRIVACY_BANNER_HEIGHT_VAR)
    }
  }, [dismissed])

  if (dismissed) return null

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, 'true')
    }
    setDismissed(true)
  }

  return (
    <div
      ref={bannerRef}
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-bg-navy/95 px-4 py-3 text-sm text-text-secondary backdrop-blur-sm"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>
          We collect anonymous usage data to improve artist profiles. No personal data is stored.{' '}
          <Link to="/privacy" className="underline hover:text-text-primary transition-colors">
            Privacy Policy
          </Link>
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-full border border-accent-500/60 px-4 py-1 text-accent-300 transition hover:border-accent-400 hover:text-text-primary"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
