import { CalendarDays, Rss } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { trackPageView } from '../utils/metrics'
import { TURNSTILE_ERROR_MESSAGE, TURNSTILE_VERIFYING_MESSAGE, useTurnstile } from '../hooks/useTurnstile'

const PAGE_TITLE = 'Subscribe — Never Miss a Show | SetTimes'

export default function SubscribePage() {
  // Turnstile stays fully dormant (no script, no iframe, no layout space)
  // until the visitor engages with the email field.
  const [formEngaged, setFormEngaged] = useState(false)
  const {
    enabled: turnstileEnabled,
    token: turnstileToken,
    status: turnstileStatus,
    containerRef: turnstileContainerRef,
    reset: resetTurnstile,
    submitWhenReady,
  } = useTurnstile(formEngaged)

  const [formData, setFormData] = useState({
    email: '',
  })
  const [status, setStatus] = useState('idle') // idle, verifying, submitting, success, error
  const [message, setMessage] = useState('')

  // A submit queued while Turnstile was still checking is dropped if the check
  // then fails; without this the form would say "Checking…" forever (#1224).
  useEffect(() => {
    if (status === 'verifying' && turnstileStatus === 'error') {
      setStatus('error')
      setMessage(TURNSTILE_ERROR_MESSAGE)
    } else if (status === 'verifying' && turnstileStatus === 'idle') {
      // Deactivated mid-check: the queued submit is gone, so stop saying "Checking…".
      setStatus('idle')
      setMessage('')
    }
  }, [status, turnstileStatus])

  // react-helmet-async does not reliably set document.title in React 19 — set it
  // directly to match the <Helmet> title below. See BandProfilePage.jsx.
  useEffect(() => {
    document.title = PAGE_TITLE
    trackPageView('/subscribe')
  }, [])

  // The confirmation link (GET /api/subscriptions/verify) redirects here with
  // ?verified=true. Show that it worked, then drop the parameter so a reload
  // after submitting a DIFFERENT address cannot claim that one is confirmed.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('verified') === 'true') {
      setStatus('success')
      setMessage("You're subscribed. Your email address is confirmed.")
      url.searchParams.delete('verified')
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }, [])

  const submitSubscription = async token => {
    setStatus('submitting')
    setMessage('')
    try {
      const response = await fetch('/api/subscriptions/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          turnstileToken: token,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setStatus('success')
        setMessage('Check your email to confirm your subscription!')
        setFormData({ email: '' })
        resetTurnstile()
      } else {
        setStatus('error')
        setMessage(data.error || 'Subscription failed. Please try again.')
        // Tokens are single-use: without a reset here, a failed submit leaves a
        // dead token in state and every retry 403s until a full page reload.
        resetTurnstile()
      }
    } catch {
      setStatus('error')
      setMessage('Network error. Please try again.')
      resetTurnstile()
    }
  }

  const handleSubmit = e => {
    e.preventDefault()
    if (turnstileEnabled && !turnstileToken) {
      const queued = submitWhenReady(submitSubscription)
      if (!queued) {
        const failed = turnstileStatus === 'error'
        setStatus(failed ? 'error' : 'verifying')
        setMessage(failed ? TURNSTILE_ERROR_MESSAGE : TURNSTILE_VERIFYING_MESSAGE)
      }
      return
    }
    submitWhenReady(submitSubscription)
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple p-4">
      {/* Identity meta (canonical/og:* /twitter:* /description) is SSR-owned for
          this route -- functions/utils/staticPageMeta.js's
          STATIC_PAGES["/subscribe"] entry injects it server-side (with
          twitter:card="summary_large_image" + a real twitter:image, not this
          component's old imageless "summary" — the more complete value wins
          now that there's only one). Declaring those tags here too would
          duplicate them on mount instead of replacing them. */}
      <Helmet>
        <title>{PAGE_TITLE}</title>
      </Helmet>
      <div className="max-w-2xl mx-auto pt-20">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-text-primary mb-4">Never Miss a Show</h1>
          <p className="text-xl text-text-secondary">
            Get an email when a lineup or set times are announced. No algorithm, no ads, just shows.
          </p>
        </div>

        {/* Form */}
        <div className="bg-surface backdrop-blur-lg rounded-2xl p-8 border border-border">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-text-primary font-medium mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                required
                value={formData.email}
                onFocus={() => setFormEngaged(true)}
                onChange={e => {
                  setFormEngaged(true)
                  setFormData({ ...formData, email: e.target.value })
                }}
                className="w-full px-4 py-3 rounded-lg bg-surface text-text-primary border border-border focus:border-accent-500 focus:outline-hidden placeholder-text-tertiary"
                placeholder="you@example.com"
              />
            </div>

            {/* Submit */}
            {turnstileEnabled && formEngaged && <div ref={turnstileContainerRef} />}
            <button
              type="submit"
              disabled={status === 'submitting'}
              className="w-full bg-accent-500 hover:bg-accent-600 text-bg-navy font-bold py-3 px-6 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'submitting' ? 'Subscribing...' : 'Subscribe'}
            </button>

            {/* Status message */}
            {message && (
              <div
                role="status"
                className={`p-4 rounded-lg ${
                  status === 'success'
                    ? 'bg-success-500/20 text-text-primary'
                    : status === 'verifying'
                      ? 'bg-surface text-text-secondary'
                      : 'bg-error-500/20 text-text-primary'
                }`}
              >
                {message}
              </div>
            )}
          </form>

          {/* Privacy note */}
          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-sm text-text-tertiary text-center">
              We respect your privacy: no ads, no third-party trackers, and we never sell your data. We only count
              anonymous, aggregate page visits (see our{' '}
              <Link to="/privacy" className="underline hover:text-accent-400 transition-colors">
                Privacy Policy
              </Link>
              ).
              <br />
              Unsubscribe anytime with one click.
            </p>
          </div>
        </div>

        {/* Alternative feeds */}
        <div className="mt-12 text-center">
          <h2 className="text-2xl font-bold text-text-primary mb-4">Prefer RSS or Calendar Sync?</h2>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="/api/feeds/ical?city=waterloo&genre=all"
              className="px-6 py-3 bg-surface hover:bg-surface-hover text-text-primary rounded-lg border border-border transition"
            >
              <CalendarDays size={16} className="mr-2 inline" aria-hidden="true" />
              Subscribe to Calendar
            </a>
            <a
              href="/api/events/public?city=waterloo&genre=all"
              className="px-6 py-3 bg-surface hover:bg-surface-hover text-text-primary rounded-lg border border-border transition"
            >
              <Rss size={16} className="mr-2 inline" aria-hidden="true" />
              JSON Feed
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
