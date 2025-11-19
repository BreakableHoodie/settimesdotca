import { memo } from 'react'
import PropTypes from 'prop-types'

/**
 * Loading Component - Design System v1.0
 *
 * Loading spinner with size variants and optional text.
 * Used to indicate loading states throughout the application.
 * Memoized for performance optimization.
 *
 * @example
 * <Loading size="lg" text="Loading events..." />
 */
const Loading = memo(function Loading({
  size = 'md',
  text = '',
  className = '',
  fullScreen = false,
}) {
  // Size styles
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  }

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
  }

  const spinner = (
    <svg
      className={`animate-spin ${sizeClasses[size] || sizeClasses.md}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  )

  const content = (
    <div className={`flex flex-col items-center justify-center gap-4 text-text-secondary ${className}`}>
      {spinner}
      {text && (
        <p className={`${textSizeClasses[size] || textSizeClasses.md} font-medium`}>
          {text}
        </p>
      )}
    </div>
  )

  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-bg-navy/90 backdrop-blur-sm"
        role="status"
        aria-live="polite"
        aria-label={text || 'Loading'}
      >
        {content}
      </div>
    )
  }

  return (
    <div
      className="flex items-center justify-center py-8"
      role="status"
      aria-live="polite"
      aria-label={text || 'Loading'}
    >
      {content}
    </div>
  )
})

Loading.propTypes = {
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl']),
  text: PropTypes.string,
  className: PropTypes.string,
  fullScreen: PropTypes.bool,
}

export default Loading
