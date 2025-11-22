import PropTypes from 'prop-types'

/**
 * Button Component - Design System v1.0
 *
 * Accessible, themeable button component with multiple variants and sizes.
 * Meets WCAG 2.1 AA standards with 44x44px touch targets on mobile.
 *
 * @example
 * <Button variant="primary" size="md" onClick={handleClick}>
 *   Create Event
 * </Button>
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  loading = false,
  icon = null,
  iconPosition = 'left',
  type = 'button',
  className = '',
  ...props
}) {
  // Base classes - always applied
  const baseClasses =
    'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-base focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-navy disabled:opacity-50 disabled:cursor-not-allowed'

  // Variant styles
  const variantClasses = {
    primary:
      'bg-accent-500 text-white hover:bg-accent-600 focus:ring-accent-500 shadow-sm hover:shadow-md active:scale-95',
    secondary: 'border-2 border-text-secondary text-text-primary hover:bg-white/10 focus:ring-primary-500',
    danger: 'bg-error-500 text-white hover:bg-error-600 focus:ring-error-500 shadow-sm hover:shadow-md active:scale-95',
    ghost: 'text-text-primary hover:bg-white/5 focus:ring-primary-500',
    success: 'bg-success-500 text-white hover:bg-success-600 focus:ring-success-500 shadow-sm hover:shadow-md',
    warning: 'bg-warning-500 text-white hover:bg-warning-600 focus:ring-warning-500 shadow-sm hover:shadow-md',
  }

  // Size styles
  const sizeClasses = {
    sm: 'px-4 py-2 text-sm min-h-[36px]',
    md: 'px-6 py-3 text-base min-h-[44px]', // 44px minimum touch target
    lg: 'px-8 py-4 text-lg min-h-[52px]',
  }

  // Combined classes
  const classes = `
    ${baseClasses}
    ${variantClasses[variant] || variantClasses.primary}
    ${sizeClasses[size] || sizeClasses.md}
    ${fullWidth ? 'w-full' : ''}
    ${loading ? 'cursor-wait' : ''}
    ${className}
  `
    .trim()
    .replace(/\s+/g, ' ')

  return (
    <button type={type} className={classes} disabled={disabled || loading} {...props}>
      {loading && (
        <svg
          className="animate-spin -ml-1 mr-3 h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      )}
      {icon && iconPosition === 'left' && !loading && (
        <span className="mr-2" aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{children}</span>
      {icon && iconPosition === 'right' && !loading && (
        <span className="ml-2" aria-hidden="true">
          {icon}
        </span>
      )}
    </button>
  )
}

Button.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['primary', 'secondary', 'danger', 'ghost', 'success', 'warning']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  fullWidth: PropTypes.bool,
  disabled: PropTypes.bool,
  loading: PropTypes.bool,
  icon: PropTypes.node,
  iconPosition: PropTypes.oneOf(['left', 'right']),
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  className: PropTypes.string,
  onClick: PropTypes.func,
}
