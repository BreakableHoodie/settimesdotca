import { useState } from 'react'
import { Check, Share2 } from 'lucide-react'
import { copyToClipboard } from '../utils/clipboard'

/**
 * ShareButton — native share sheet (Web Share API) with a copy-link fallback.
 *
 * On devices that support `navigator.share` (most mobile browsers) this opens the
 * OS share sheet. Everywhere else it copies the URL to the clipboard and shows a
 * brief "Copied!" confirmation. Cancelling the native sheet is a no-op (we do not
 * fall back to copying, since the user explicitly dismissed it).
 */
export default function ShareButton({
  url,
  title,
  text,
  label = 'Share',
  className = 'inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-text-primary transition hover:bg-white/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400',
}) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '')

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url: shareUrl })
        return
      } catch (err) {
        // User dismissed the sheet — respect that, don't fall back to copying.
        if (err && err.name === 'AbortError') return
        // Any other failure falls through to the clipboard path.
      }
    }

    const ok = await copyToClipboard(shareUrl)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={className}
      aria-label={copied ? 'Link copied to clipboard' : `${label}${title ? ` ${title}` : ''}`}
    >
      {copied ? <Check size={16} aria-hidden="true" /> : <Share2 size={16} aria-hidden="true" />}
      <span>{copied ? 'Copied!' : label}</span>
    </button>
  )
}
