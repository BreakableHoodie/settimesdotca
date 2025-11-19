import { useState } from 'prop-types'
import PropTypes from 'prop-types'

/**
 * Tooltip - Contextual help text component
 * Sprint 2.3: Provides helpful hints and tooltips
 *
 * Features:
 * - Positioned above trigger element
 * - Shows on hover or focus
 * - Keyboard accessible
 * - WCAG 2.1 AA compliant
 *
 * @param {React.Node} children - Trigger element to show tooltip on
 * @param {string} content - Tooltip text content
 * @param {string} position - Tooltip position: 'top' | 'bottom' | 'left' | 'right'
 */
export default function Tooltip({ children, content, position = 'top' }) {
  const [isVisible, setIsVisible] = useState(false)

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-bg-elevated',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-bg-elevated',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-bg-elevated',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-bg-elevated',
  }

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}

      {isVisible && content && (
        <div
          role="tooltip"
          className={`absolute z-50 ${positionClasses[position]} animate-fade-in`}
        >
          <div className="bg-bg-elevated text-text-primary text-sm px-3 py-2 rounded-lg shadow-lg border border-white/10 max-w-xs whitespace-normal">
            {content}
          </div>
          {/* Arrow */}
          <div
            className={`absolute w-0 h-0 border-4 ${arrowClasses[position]}`}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  )
}

Tooltip.propTypes = {
  children: PropTypes.node.isRequired,
  content: PropTypes.string.isRequired,
  position: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
}
