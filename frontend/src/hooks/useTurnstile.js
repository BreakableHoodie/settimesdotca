import { useCallback, useEffect, useRef, useState } from 'react'

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/**
 * Shared Cloudflare Turnstile widget lifecycle (script injection, explicit
 * render, token state, cleanup) for the public email-input forms.
 *
 * `active` defers EVERYTHING until the visitor actually engages with the form
 * (first focus/change on the email field): no Turnstile script, no iframe, no
 * reserved layout space, and no challenge ambushing people who never touch
 * the form. Cloudflare still challenges on its own schedule once rendered —
 * `appearance: 'interaction-only'` keeps the widget invisible unless a human
 * check is genuinely required.
 *
 * Returns `{ enabled, token, containerRef, reset }`:
 * - `enabled` — site key is configured (submit guards should be skipped when false)
 * - `token`   — current Turnstile token ('' until issued / after expiry)
 * - `containerRef` — attach to the div the widget renders into; the div only
 *   needs to exist once `active` is true
 * - `reset`   — clear the token and reset the widget; call after every submit
 *   attempt (tokens are single-use, so a retry needs a fresh challenge)
 */
export function useTurnstile(active) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''
  const enabled = Boolean(siteKey)
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)
  const [token, setToken] = useState('')

  useEffect(() => {
    if (!enabled || !active) {
      return undefined
    }

    let cancelled = false
    let scriptElement = document.querySelector('script[data-turnstile-script="true"]')

    const renderTurnstile = () => {
      if (cancelled || !window.turnstile || !containerRef.current) {
        return
      }
      if (widgetIdRef.current !== null) {
        return
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        // Invisible unless Turnstile actually needs a human challenge — keeps
        // the form uncluttered for legit visitors while preserving bot
        // protection.
        appearance: 'interaction-only',
        callback: newToken => {
          setToken(newToken)
        },
        'expired-callback': () => {
          setToken('')
        },
        'error-callback': () => {
          setToken('')
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
      if (window.turnstile && widgetIdRef.current !== null) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [enabled, active, siteKey])

  const reset = useCallback(() => {
    setToken('')
    if (window.turnstile && widgetIdRef.current !== null) {
      window.turnstile.reset(widgetIdRef.current)
    }
  }, [])

  return { enabled, token, containerRef, reset }
}
