import { useCallback, useEffect, useRef, useState } from 'react'
import { trackEvent } from '../utils/metrics'

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

// Shown by every form that uses this hook, so the wording lives in one place.
export const TURNSTILE_VERIFYING_MESSAGE = "Checking you're human…"
export const TURNSTILE_ERROR_MESSAGE =
  "Verification couldn't load. Turn off content blockers for this page, or try another browser."

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
 * Returns `{ enabled, token, status, errorCode, containerRef, reset,
 * submitWhenReady }`:
 * - `enabled` — site key is configured (submit guards should be skipped when false)
 * - `token`   — current Turnstile token ('' until issued / after expiry)
 * - `status`  — `idle`, `pending`, `ready`, or `error`
 * - `errorCode` — the code from the second consecutive Turnstile error
 * - `containerRef` — attach to the div the widget renders into; the div only
 *   needs to exist once `active` is true
 * - `reset`   — clear the token and reset the widget; call after every submit
 *   attempt (tokens are single-use, so a retry needs a fresh challenge)
 * - `submitWhenReady` — queue one submit callback while verification is
 *   pending; it is discarded if verification errors or the form deactivates
 *
 * Contract: the container is expected to stay mounted for the lifetime of
 * `active === true`. If the consumer's form can unmount/remount while the
 * component survives (band-to-band navigation, a list emptying), the consumer
 * must flip `active` back to false when that happens — the widget dies with
 * its container DOM, and this hook only re-renders a widget on an
 * inactive→active transition.
 */
export function useTurnstile(active) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''
  const enabled = Boolean(siteKey)
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)
  const activeRef = useRef(active)
  const tokenRef = useRef('')
  const statusRef = useRef('idle')
  const queuedSubmitRef = useRef(null)
  const consecutiveErrorsRef = useRef(0)
  const [token, setToken] = useState('')
  const [status, setStatus] = useState('idle')
  const [errorCode, setErrorCode] = useState(null)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  const updateState = useCallback((nextToken, nextStatus, nextErrorCode = null) => {
    tokenRef.current = nextToken
    statusRef.current = nextStatus
    setToken(nextToken)
    setStatus(nextStatus)
    setErrorCode(nextErrorCode)
  }, [])

  useEffect(() => {
    if (!enabled || !active) {
      return undefined
    }

    updateState('', 'pending')
    consecutiveErrorsRef.current = 0

    let cancelled = false
    let scriptElement = document.querySelector('script[data-turnstile-script="true"]')
    let scriptAttempts = 0

    const failVerification = code => {
      updateState('', 'error', code)
      queuedSubmitRef.current = null
      trackEvent('turnstile_error', { error_code: code })
    }

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
        // Our error-callback owns the retry budget (one reset). Turnstile's
        // default 'auto' would keep retrying, and reporting, on its own.
        retry: 'never',
        callback: newToken => {
          consecutiveErrorsRef.current = 0
          updateState(newToken, 'ready')
        },
        'expired-callback': () => {
          updateState('', 'pending')
        },
        'error-callback': code => {
          updateState('', 'pending')
          consecutiveErrorsRef.current += 1
          if (consecutiveErrorsRef.current === 1) {
            try {
              window.turnstile.reset(widgetIdRef.current)
            } catch {
              // The widget may have been torn down between the callback and reset.
            }
            return
          }

          failVerification(code)
        },
      })
    }

    // A content blocker usually blocks this script outright. Then no widget
    // renders and error-callback never fires, so without handling the script's
    // own `error` event the form would wait on "Checking…" forever (#1224).
    // A failed <script> never fires again, so it is removed: a later activation
    // re-injects instead of waiting on a dead element.
    const injectScript = () => {
      scriptAttempts += 1
      const script = document.createElement('script')
      script.src = TURNSTILE_SCRIPT_SRC
      script.async = true
      script.defer = true
      script.setAttribute('data-turnstile-script', 'true')
      script.addEventListener('load', renderTurnstile)
      script.addEventListener('error', onScriptError)
      document.head.appendChild(script)
      scriptElement = script
    }

    function onScriptError() {
      if (scriptElement) {
        scriptElement.removeEventListener('load', renderTurnstile)
        scriptElement.removeEventListener('error', onScriptError)
        scriptElement.remove()
        scriptElement = null
      }
      if (cancelled) {
        return
      }
      if (scriptAttempts < 2) {
        injectScript()
        return
      }
      failVerification('script_load_failed')
    }

    if (window.turnstile) {
      renderTurnstile()
    } else if (scriptElement) {
      scriptElement.addEventListener('load', renderTurnstile)
      scriptElement.addEventListener('error', onScriptError)
    } else {
      injectScript()
    }

    return () => {
      cancelled = true
      if (scriptElement) {
        scriptElement.removeEventListener('load', renderTurnstile)
        scriptElement.removeEventListener('error', onScriptError)
      }
      if (window.turnstile && widgetIdRef.current !== null) {
        // try/catch: the widget's DOM may already be gone (container unmounted
        // before this cleanup ran, e.g. the consumer flipped `active` false
        // after its form left the tree) — remove() on a dead widget must not
        // take the whole component down.
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          // Widget already torn down with its container — nothing to release.
        }
        widgetIdRef.current = null
      }
      // Always, not only when a widget existed: deactivating while the script is
      // still loading must not leave status 'pending' for a form to wait on.
      updateState('', 'idle')
      queuedSubmitRef.current = null
    }
  }, [enabled, active, siteKey, updateState])

  const reset = useCallback(() => {
    consecutiveErrorsRef.current = 0
    updateState('', enabled && activeRef.current ? 'pending' : 'idle')
    if (window.turnstile && widgetIdRef.current !== null) {
      try {
        window.turnstile.reset(widgetIdRef.current)
      } catch {
        // Widget already torn down with its container — a fresh one renders on
        // the next activation.
      }
    }
  }, [enabled, updateState])

  const submitWhenReady = useCallback(
    submit => {
      if (!enabled || tokenRef.current) {
        submit(tokenRef.current)
        return true
      }
      if (statusRef.current === 'error' || !activeRef.current) {
        return false
      }
      queuedSubmitRef.current = submit
      return false
    },
    [enabled]
  )

  useEffect(() => {
    if (!token || status !== 'ready' || !queuedSubmitRef.current) {
      return
    }
    const submit = queuedSubmitRef.current
    queuedSubmitRef.current = null
    submit(token)
  }, [status, token])

  return { enabled, token, status, errorCode, containerRef, reset, submitWhenReady }
}
