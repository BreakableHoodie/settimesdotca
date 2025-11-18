import PropTypes from 'prop-types'

/**
 * Badge Component - Design System v1.0
 *
 * Status indicator badge with semantic color variants.
 * Used for showing status, categories, or labels.
 *
 * @example
 * <Badge variant="success">Published</Badge>
 * <Badge variant="warning">Draft</Badge>
 * <Badge variant="error">Archived</Badge>
 */
export default function Badge({
  children,
  variant = 'default',
  size = 'md',
  className = '',
  ...props
}) {
  // Base classes
  const baseClasses =
    'inline-flex items-center font-medium rounded-full uppercase tracking-wide'

  // Variant styles
  const variantClasses = {
    default: 'bg-white/10 text-text-secondary',
    primary: 'bg-primary-500/20 text-primary-100',
    success: 'bg-success-500/20 text-success-400',
    warning: 'bg-warning-500/20 text-warning-400',
    error: 'bg-error-500/20 text-error-400',
    info: 'bg-info-500/20 text-info-400',
  }

  // Size styles
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-xs',
    lg: 'px-4 py-1.5 text-sm',
  }

  // Combined classes
  const classes = `
    ${baseClasses}
    ${variantClasses[variant] || variantClasses.default}
    ${sizeClasses[size] || sizeClasses.md}
    ${className}
  `.trim().replace(/\s+/g, ' ')

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  )
}

Badge.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['default', 'primary', 'success', 'warning', 'error', 'info']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  className: PropTypes.string,
}
