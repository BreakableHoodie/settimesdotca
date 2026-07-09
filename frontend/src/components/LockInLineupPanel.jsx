import { Bell, Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/**
 * LockInLineupPanel — Batch follow CTA for "My Route" and shared-route import.
 *
 * One submit → POST /api/bands/follow-batch → one combined double-opt-in
 * confirmation email for all N bands. The backend inserts each row as
 * verified=0 (double opt-in invariant preserved) and sends exactly one email
 * so one Turnstile solve can't fan-out to N separate emails.
 *
 * Props:
 *   performanceIds  — array of numeric performance IDs (the bands to follow)
 *   bandCount       — number shown in CTA copy (usually performanceIds.length,
 *                     but let the caller decide if they want a different label)
 */
export default function LockInLineupPanel({ performanceIds, bandCount }) {
  const [followEmail, setFollowEmail] = useState('')
  const [followStatus, setFollowStatus] = useState('idle') // 'idle' | 'loading' | 'success' | 'error'
  const [followError, setFollowError] = useState('')
  const turnstileContainerRef = useRef(null)
  const turnstileWidgetIdRef = useRef(null)
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''
  const turnstileEnabled = Boolean(turnstileSiteKey)
  const [turnstileToken, setTurnstileToken] = useState('')
  const hasPerformances = Array.isArray(performanceIds) && performanceIds.length > 0

  // Mirror the Turnstile setup from BandProfilePage — explicit render, interaction-only
  // appearance (invisible unless a human challenge fires), cleanup on unmount/re-run.
  // Gate on hasPerformances so we don't try to render into a null container ref when
  // the component returns null early.
  useEffect(() => {
    if (!turnstileEnabled || !hasPerformances) return undefined

    let cancelled = false
    let scriptElement = document.querySelector('script[data-turnstile-script="true"]')

    const renderTurnstile = () => {
      if (cancelled || !window.turnstile || !turnstileContainerRef.current) return
      if (turnstileWidgetIdRef.current !== null) return

      turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: turnstileSiteKey,
        appearance: 'interaction-only',
        callback: token => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      })
    }

    if (scriptElement) {
      if (window.turnstile) {
        renderTurnstile()
      } else {
        scriptElement.addEventListener('load', renderTurnstile)
      }
    } else {
      const script = document.createElement('script')
      script.src = TURNSTILE_SCRIPT_SRC
      script.async = true
      script.defer = true
      script.setAttribute('data-turnstile-script', 'true')
      script.addEventListener('load', renderTurnstile)
      document.head.appendChild(script)
      scriptElement = script
    }

    return () => {
      cancelled = true
      if (scriptElement) scriptElement.removeEventListener('load', renderTurnstile)
      if (window.turnstile && turnstileWidgetIdRef.current !== null) {
        window.turnstile.remove(turnstileWidgetIdRef.current)
        turnstileWidgetIdRef.current = null
      }
    }
  }, [turnstileEnabled, turnstileSiteKey, hasPerformances])

  // Early return after hooks (React rules of hooks: no conditional hook calls)
  if (!hasPerformances) return null

  const n = bandCount ?? performanceIds.length

  const handleSubmit = async e => {
    e.preventDefault()
    if (!followEmail.trim()) return
    if (turnstileEnabled && !turnstileToken) {
      setFollowStatus('error')
      setFollowError('Please complete the bot verification challenge.')
      return
    }
    setFollowStatus('loading')
    setFollowError('')
    try {
      const res = await fetch('/api/bands/follow-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: followEmail.trim(),
          performance_ids: performanceIds,
          turnstileToken,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Something went wrong — please try again.')
      }
      setFollowStatus('success')
      setTurnstileToken('')
      if (turnstileEnabled && window.turnstile && turnstileWidgetIdRef.current !== null) {
        window.turnstile.reset(turnstileWidgetIdRef.current)
      }
    } catch (err) {
      setFollowStatus('error')
      setFollowError(err.message)
      setTurnstileToken('')
      if (turnstileEnabled && window.turnstile && turnstileWidgetIdRef.current !== null) {
        window.turnstile.reset(turnstileWidgetIdRef.current)
      }
    }
  }

  return (
    <div className="rounded-xl border border-accent-500/30 bg-surface/50 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="sm:flex-1">
          <div className="mb-1 flex items-center gap-2">
            <Bell size={16} className="shrink-0 text-accent-400" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-text-primary">Lock in your lineup</h2>
          </div>
          <p className="text-xs text-text-secondary">
            Get an email the moment set times drop, plus a heads-up before each of your{' '}
            <span className="font-semibold text-text-primary">{n}</span> {n === 1 ? 'band' : 'bands'} plays. One click
            confirms {n === 1 ? 'it' : 'all of them'}.
          </p>
        </div>

        {followStatus === 'success' ? (
          <p className="inline-flex items-start gap-1.5 text-sm text-success-400 sm:max-w-xs">
            <Check size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            Check your email to confirm — one click locks in all {n} {n === 1 ? 'band' : 'bands'}.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="w-full sm:w-auto">
            <label htmlFor="lineup-follow-email" className="sr-only">
              Your email address
            </label>
            <div className="flex gap-2 sm:w-80">
              <input
                id="lineup-follow-email"
                type="email"
                value={followEmail}
                onChange={e => setFollowEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={followStatus === 'loading'}
                className="min-w-0 flex-1 rounded border border-text-primary/20 bg-bg-navy px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:border-accent-500 focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={followStatus === 'loading' || (turnstileEnabled && !turnstileToken)}
                className="shrink-0 min-h-[44px] rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-bg-navy transition-all hover:bg-accent-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500"
              >
                {followStatus === 'loading' ? 'Saving…' : 'Notify me'}
              </button>
            </div>
            {turnstileEnabled && <div ref={turnstileContainerRef} className="mt-2" />}
          </form>
        )}
      </div>

      {followStatus === 'error' && (
        <p className="mt-2 text-xs text-error-400" role="alert">
          {followError}
        </p>
      )}
    </div>
  )
}
