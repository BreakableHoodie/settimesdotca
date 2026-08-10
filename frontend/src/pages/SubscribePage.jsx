import { CalendarDays, Rss } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useTurnstile } from '../hooks/useTurnstile'

const PAGE_TITLE = 'Subscribe — Never Miss a Show | SetTimes'

export default function SubscribePage() {
  // Turnstile stays fully dormant (no script, no iframe, no layout space)
  // until the visitor engages with the email field.
  const [formEngaged, setFormEngaged] = useState(false)
  const {
    enabled: turnstileEnabled,
    token: turnstileToken,
    containerRef: turnstileContainerRef,
    reset: resetTurnstile,
  } = useTurnstile(formEngaged)

  const [formData, setFormData] = useState({
    email: '',
    city: 'kitchener',
    genre: 'all',
    frequency: 'weekly',
  })
  const [status, setStatus] = useState('idle') // idle, submitting, success, error
  const [message, setMessage] = useState('')

  // react-helmet-async does not reliably set document.title in React 19 — set it
  // directly to match the <Helmet> title below. See BandProfilePage.jsx.
  useEffect(() => {
    document.title = PAGE_TITLE
  }, [])

  const handleSubmit = async e => {
    e.preventDefault()
    setStatus('submitting')
    setMessage('')

    if (turnstileEnabled && !turnstileToken) {
      setStatus('error')
      setMessage('Please complete the bot verification challenge.')
      return
    }

    try {
      const response = await fetch('/api/subscriptions/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          turnstileToken,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setStatus('success')
        setMessage('Check your email to confirm your subscription!')
        setFormData({ email: '', city: 'kitchener', genre: 'all', frequency: 'weekly' })
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
            Get weekly emails about concerts in your city. No algorithm, no ads, just shows.
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

            {/* City */}
            <div>
              <label htmlFor="city" className="block text-text-primary font-medium mb-2">
                City
              </label>
              <select
                id="city"
                value={formData.city}
                onChange={e => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-surface text-text-primary border border-border focus:border-accent-500 focus:outline-hidden"
              >
                <option value="kitchener">Kitchener</option>
                <option value="waterloo">Waterloo</option>
                <option value="cambridge">Cambridge</option>
                <option value="guelph">Guelph</option>
                <option value="all">All Cities</option>
              </select>
            </div>

            {/* Genre */}
            <div>
              <label htmlFor="genre" className="block text-text-primary font-medium mb-2">
                Genre Preference
              </label>
              <select
                id="genre"
                value={formData.genre}
                onChange={e => setFormData({ ...formData, genre: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-surface text-text-primary border border-border focus:border-accent-500 focus:outline-hidden"
              >
                <option value="all">All Genres</option>
                <option value="punk">Punk</option>
                <option value="indie">Indie</option>
                <option value="rock">Rock</option>
                <option value="metal">Metal</option>
                <option value="electronic">Electronic</option>
              </select>
            </div>

            {/* Frequency */}
            <div>
              <label htmlFor="frequency" className="block text-text-primary font-medium mb-2">
                Email Frequency
              </label>
              <select
                id="frequency"
                value={formData.frequency}
                onChange={e => setFormData({ ...formData, frequency: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-surface text-text-primary border border-border focus:border-accent-500 focus:outline-hidden"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
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
                className={`p-4 rounded-lg ${
                  status === 'success' ? 'bg-success-500/20 text-text-primary' : 'bg-error-500/20 text-text-primary'
                }`}
              >
                {message}
              </div>
            )}
          </form>

          {/* Privacy note */}
          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-sm text-text-tertiary text-center">
              We respect your privacy. No tracking, no ads, no selling your data.
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
