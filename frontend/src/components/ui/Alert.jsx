import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import PropTypes from 'prop-types'

/**
 * Alert Component - Design System v1.0
 *
 * Notification banner for displaying important messages to users.
 * Supports multiple variants with icons and optional dismiss button.
 *
 * @example
 * <Alert variant="success" onClose={handleClose}>
 *   Event published successfully!
 * </Alert>
 */
export default function Alert({
  children,
  variant = 'info',
  dismissible = false,
  onClose,
  className = '',
  icon: customIcon,
  ...props
}) {
  const iconMap = {
    success: CircleCheck,
    warning: TriangleAlert,
    error: CircleAlert,
    info: Info,
  }

  const IconComponent = customIcon || iconMap[variant]

  // Base classes
  const baseClasses = 'flex items-start gap-3 p-4 rounded-lg border'

  // Variant styles
  const variantClasses = {
    success: 'bg-success-500/10 border-success-500/20 text-success-400',
    warning: 'bg-warning-500/10 border-warning-500/20 text-warning-400',
    error: 'bg-error-500/10 border-error-500/20 text-error-400',
    info: 'bg-info-500/10 border-info-500/20 text-info-400',
  }

  // Combined classes
  const classes = `
    ${baseClasses}
    ${variantClasses[variant] || variantClasses.info}
    ${className}
  `
    .trim()
    .replace(/\s+/g, ' ')

  return (
    <div className={classes} role="alert" aria-live={variant === 'error' ? 'assertive' : 'polite'} {...props}>
      {IconComponent && <IconComponent size={20} className="shrink-0 mt-0.5" aria-hidden="true" />}

      <div className="flex-1 text-text-primary">{children}</div>

      {dismissible && onClose && (
        <button
          onClick={onClose}
          className="shrink-0 p-1 hover:bg-white/10 rounded transition-colors"
          aria-label="Dismiss alert"
        >
          <X size={18} />
        </button>
      )}
    </div>
  )
}

Alert.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['success', 'warning', 'error', 'info']),
  dismissible: PropTypes.bool,
  onClose: PropTypes.func,
  className: PropTypes.string,
  icon: PropTypes.elementType,
}
