import { useContext } from 'react'
import PropTypes from 'prop-types'
import { RetryContext } from '../../hooks/useRetryFocus'

/**
 * Shown where a list would render when its fetch FAILED (#1323).
 *
 * A failed load must never fall through to a list's "No X yet" empty state:
 * that tells an admin the data is gone and invites them to recreate it. Each
 * view tracks a load error separately from "loaded and empty" and renders
 * this instead.
 *
 * Render it inside a <RetryRegion> and pass `() => retry.startRetry(load)` as
 * `onRetry` (#1420). It announces itself as an alert when it first appears; after
 * a retry the region's status message does that, so it goes quiet.
 */
export default function LoadError({ what, onRetry }) {
  const retried = useContext(RetryContext)
  return (
    <div role={retried ? undefined : 'alert'} className="p-8 text-center">
      <p className="text-white mb-4">{`Couldn't load ${what}.`}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-[44px] px-4 py-2 bg-accent-500 text-bg-navy rounded hover:bg-accent-600 transition"
      >
        Retry
      </button>
    </div>
  )
}

LoadError.propTypes = {
  what: PropTypes.string.isRequired,
  onRetry: PropTypes.func.isRequired,
}
