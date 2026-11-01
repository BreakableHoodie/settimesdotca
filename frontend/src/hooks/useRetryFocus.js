import { createContext, useCallback, useEffect, useRef, useState } from 'react'

/**
 * True once the user has pressed Retry inside a <RetryRegion>. LoadError reads
 * it to stop announcing itself as an alert: after a retry the region's status
 * message speaks for it, and both would be a double announcement.
 */
export const RetryContext = createContext(false)

const capitalise = text => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Focus and announcements for a "Retry" on a failed load (#1420).
 *
 * Pressing Retry usually removes the focused button (the spinner replaces the
 * error), which drops keyboard focus to <body> (WCAG 2.4.3), and nothing says
 * that loading started or how it ended (WCAG 4.1.3). This hook pairs with
 * <RetryRegion>, a container that stays mounted through loading, success,
 * empty and error:
 *
 *   const retry = useRetryFocus({ what: 'venues', error: loadError })
 *   <RetryRegion retry={retry} label="Venues">
 *     {loadError ? <LoadError what="venues" onRetry={() => retry.startRetry(loadVenues)} /> : ...}
 *   </RetryRegion>
 *
 * `startRetry(fn)` awaits `fn` (so `fn` must return the load's promise), then
 * announces the outcome from the `error` the component holds by then and moves
 * focus to the region. Focus moves ONLY after a retry: stealing focus on first
 * load is its own failure. A `fn` that rejects counts as a failed load.
 */
export default function useRetryFocus({ what, error }) {
  const regionRef = useRef(null)
  const [statusText, setStatusText] = useState('')
  const [retried, setRetried] = useState(false)
  // 'idle' | 'settled' | 'threw'. A settled load is acted on in an effect, not
  // in startRetry, because `error` is read from the render that follows the
  // loader's own state updates, not from the render that started the retry.
  const [phase, setPhase] = useState('idle')
  // One retry at a time: the error view (and its button) stays mounted while a
  // retry runs on some surfaces, and two overlapping loads can land out of
  // order, a late failure overwriting a success.
  const inFlight = useRef(false)

  const startRetry = useCallback(
    async fn => {
      if (inFlight.current) return
      inFlight.current = true
      setRetried(true)
      setStatusText(`Loading ${what}…`)
      let threw = false
      try {
        await fn()
      } catch {
        threw = true
      }
      inFlight.current = false
      setPhase(threw ? 'threw' : 'settled')
    },
    [what]
  )

  useEffect(() => {
    if (phase === 'idle') return
    const failed = phase === 'threw' || Boolean(error)
    setStatusText(failed ? `Couldn't load ${what}.` : `${capitalise(what)} loaded.`)
    regionRef.current?.focus()
    // After a success, a later failure is a fresh one: LoadError must announce
    // it as an alert again, since no retry status will speak for it.
    if (!failed) setRetried(false)
    setPhase('idle')
  }, [phase, error, what])

  return { regionRef, statusText, startRetry, retried }
}
