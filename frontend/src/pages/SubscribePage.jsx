import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCalendarDays, faRss } from '@fortawesome/free-solid-svg-icons'

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export default function SubscribePage() {
  const turnstileContainerRef = useRef(null)
  const turnstileWidgetIdRef = useRef(null)
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''
  const turnstileEnabled = Boolean(turnstileSiteKey)

  const [formData, setFormData] = useState({
    email: '',
    city: 'kitchener',
    genre: 'all',
    frequency: 'weekly',
  })
  const [turnstileToken, setTurnstileToken] = useState('')
  const [status, setStatus] = useState('idle') // idle, submitting, success, error
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!turnstileEnabled) {
      return undefined
    }

    let cancelled = false
    let scriptElement = document.querySelector('script[data-turnstile-script="true"]')

    const renderTurnstile = () => {
      if (cancelled || !window.turnstile || !turnstileContainerRef.current) {
        return
      }
      if (turnstileWidgetIdRef.current !== null) {
        return
      }

      turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: turnstileSiteKey,
        callback: token => {
          setTurnstileToken(token)
        },
        'expired-callback': () => {
          setTurnstileToken('')
        },
        'error-callback': () => {
          setTurnstileToken('')
        },
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
      if (scriptElement) {
        scriptElement.removeEventListener('load', renderTurnstile)
      }
      if (window.turnstile && turnstileWidgetIdRef.current !== null) {
        window.turnstile.remove(turnstileWidgetIdRef.current)
        turnstileWidgetIdRef.current = null
      }
    }
  }, [turnstileEnabled, turnstileSiteKey])

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
        setTurnstileToken('')
        if (turnstileEnabled && window.turnstile && turnstileWidgetIdRef.current !== null) {
          window.turnstile.reset(turnstileWidgetIdRef.current)
        }
      } else {
        setStatus('error')
        setMessage(data.error || 'Subscription failed. Please try again.')
      }
    } catch {
      setStatus('error')
      setMessage('Network error. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-navy to-bg-purple p-4">
      <div className="max-w-2xl mx-auto pt-20">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Never Miss a Show</h1>
          <p className="text-xl text-gray-300">
            Get weekly emails about concerts in your city. No algorithm, no ads, just shows.
          </p>
        </div>

        {/* Form */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-white font-medium mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                required
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:border-accent-500 focus:outline-none placeholder-gray-400"
                placeholder="you@example.com"
              />
            </div>

            {/* City */}
            <div>
              <label htmlFor="city" className="block text-white font-medium mb-2">
                City
              </label>
              <select
                id="city"
                value={formData.city}
                onChange={e => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:border-accent-500 focus:outline-none"
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
              <label htmlFor="genre" className="block text-white font-medium mb-2">
                Genre Preference
              </label>
              <select
                id="genre"
                value={formData.genre}
                onChange={e => setFormData({ ...formData, genre: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:border-accent-500 focus:outline-none"
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
              <label htmlFor="frequency" className="block text-white font-medium mb-2">
                Email Frequency
              </label>
              <select
                id="frequency"
                value={formData.frequency}
                onChange={e => setFormData({ ...formData, frequency: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:border-accent-500 focus:outline-none"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            {/* Submit */}
            {turnstileEnabled && <div ref={turnstileContainerRef} className="min-h-[65px]" />}
            <button
              type="submit"
              disabled={status === 'submitting'}
              className="w-full bg-accent-500 hover:bg-accent-600 text-white font-bold py-3 px-6 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'submitting' ? 'Subscribing...' : 'Subscribe'}
            </button>

            {/* Status message */}
            {message && (
              <div
                className={`p-4 rounded-lg ${
                  status === 'success' ? 'bg-green-500/20 text-green-200' : 'bg-red-500/20 text-red-200'
                }`}
              >
                {message}
              </div>
            )}
          </form>

          {/* Privacy note */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <p className="text-sm text-gray-400 text-center">
              We respect your privacy. No tracking, no ads, no selling your data.
              <br />
              Unsubscribe anytime with one click.
            </p>
          </div>
        </div>

        {/* Alternative feeds */}
        <div className="mt-12 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Prefer RSS or Calendar Sync?</h2>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="/api/feeds/ical?city=portland&genre=all"
              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 transition"
            >
              <FontAwesomeIcon icon={faCalendarDays} className="mr-2" aria-hidden="true" />
              Subscribe to Calendar
            </a>
            <a
              href="/api/events/public?city=portland&genre=all"
              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 transition"
            >
              <FontAwesomeIcon icon={faRss} className="mr-2" aria-hidden="true" />
              JSON Feed
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
