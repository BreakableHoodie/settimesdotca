import PropTypes from 'prop-types'
import { RetryContext } from '../hooks/useRetryFocus'

/**
 * The stable container behind useRetryFocus (#1420): it holds the focus target
 * and a live region that is in the DOM in every state (a live region that
 * mounts together with its text is often not announced), so it must wrap the
 * loading, success, empty and error branches alike and never be unmounted by
 * the spinner.
 */
export default function RetryRegion({ retry, label, className = '', children }) {
  const { regionRef, statusText, retried } = retry
  return (
    <div
      ref={regionRef}
      tabIndex={-1}
      role="group"
      aria-label={label}
      className={`outline-hidden focus-visible:ring-2 focus-visible:ring-accent-500 ${className}`}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {statusText}
      </p>
      <RetryContext.Provider value={retried}>{children}</RetryContext.Provider>
    </div>
  )
}

RetryRegion.propTypes = {
  retry: PropTypes.shape({
    regionRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
    statusText: PropTypes.string.isRequired,
    retried: PropTypes.bool.isRequired,
  }).isRequired,
  label: PropTypes.string.isRequired,
  className: PropTypes.string,
  children: PropTypes.node,
}
