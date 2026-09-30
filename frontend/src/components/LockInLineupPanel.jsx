import { Bell, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { TURNSTILE_ERROR_MESSAGE, TURNSTILE_VERIFYING_MESSAGE, useTurnstile } from '../hooks/useTurnstile'

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
  const [followStatus, setFollowStatus] = useState('idle') // 'idle' | 'verifying' | 'loading' | 'success' | 'error'
  const [followError, setFollowError] = useState('')
  // Turnstile stays dormant until the visitor engages with the email field.
  // Engagement is only possible when the form is mounted, which also covers
  // the old hasPerformances gating (the component returns null without any
  // performances, so the field can never be focused).
  const [followEngaged, setFollowEngaged] = useState(false)
  const {
    enabled: turnstileEnabled,
    token: turnstileToken,
    status: turnstileStatus,
    containerRef: turnstileContainerRef,
    reset: resetTurnstile,
    submitWhenReady,
  } = useTurnstile(followEngaged)

  // A follow queued while Turnstile was still checking is dropped if the check
  // then fails; without this the form would say "Checking…" forever (#1224).
  useEffect(() => {
    if (followStatus === 'verifying' && turnstileStatus === 'error') {
      setFollowStatus('error')
      setFollowError(TURNSTILE_ERROR_MESSAGE)
    } else if (followStatus === 'verifying' && turnstileStatus === 'idle') {
      // Deactivated mid-check (the lineup emptied, or the band changed): the
      // queued follow is gone, so stop saying "Checking…".
      setFollowStatus('idle')
      setFollowError('')
    }
  }, [followStatus, turnstileStatus])
  const hasPerformances = Array.isArray(performanceIds) && performanceIds.length > 0

  // If the route empties (fan removes every band), the form — and the Turnstile
  // widget's container — unmounts while this component instance survives.
  // Reset engagement so the next focus re-activates a fresh widget.
  useEffect(() => {
    if (!hasPerformances) {
      setFollowEngaged(false)
    }
  }, [hasPerformances])

  // Early return after hooks (React rules of hooks: no conditional hook calls)
  if (!hasPerformances) return null

  const n = bandCount ?? performanceIds.length

  const submitFollowRequest = async token => {
    setFollowStatus('loading')
    setFollowError('')
    try {
      const res = await fetch('/api/bands/follow-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: followEmail.trim(),
          performance_ids: performanceIds,
          turnstileToken: token,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Something went wrong — please try again.')
      }
      setFollowStatus('success')
      resetTurnstile()
    } catch (err) {
      setFollowStatus('error')
      setFollowError(err.message)
      resetTurnstile()
    }
  }

  const handleSubmit = e => {
    e.preventDefault()
    if (!followEmail.trim()) return
    if (turnstileEnabled && !turnstileToken) {
      const queued = submitWhenReady(submitFollowRequest)
      if (!queued) {
        const failed = turnstileStatus === 'error'
        setFollowStatus(failed ? 'error' : 'verifying')
        setFollowError(failed ? TURNSTILE_ERROR_MESSAGE : TURNSTILE_VERIFYING_MESSAGE)
      }
      return
    }
    submitWhenReady(submitFollowRequest)
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
                onFocus={() => setFollowEngaged(true)}
                onChange={e => {
                  setFollowEngaged(true)
                  setFollowEmail(e.target.value)
                }}
                placeholder="your@email.com"
                required
                disabled={followStatus === 'loading'}
                className="min-w-0 flex-1 rounded border border-text-primary/20 bg-bg-navy px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:border-accent-500 focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={followStatus === 'loading'}
                className="shrink-0 min-h-[44px] rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-bg-navy transition-all hover:bg-accent-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500"
              >
                {followStatus === 'loading' ? 'Saving…' : 'Notify me'}
              </button>
            </div>
            {turnstileEnabled && followEngaged && <div ref={turnstileContainerRef} className="mt-2" />}
          </form>
        )}
      </div>

      {followStatus === 'verifying' && (
        <p className="mt-2 text-xs text-text-tertiary" role="status">
          {followError}
        </p>
      )}
      {followStatus === 'error' && (
        <p className="mt-2 text-xs text-error-400" role="alert">
          {followError}
        </p>
      )}
    </div>
  )
}
