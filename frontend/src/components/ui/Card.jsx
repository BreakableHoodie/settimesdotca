import PropTypes from 'prop-types'

/**
 * Card Component - Design System v1.0
 *
 * Container component for grouping related content with consistent styling.
 * Supports hover states, padding variants, and custom styling.
 *
 * @example
 * <Card hoverable onClick={handleClick}>
 *   <h3 className="text-xl font-bold">Event Title</h3>
 *   <p className="text-text-secondary">Event description</p>
 * </Card>
 */
export default function Card({
  children,
  variant = 'default',
  padding = 'md',
  hoverable = false,
  className = '',
  as: Component = 'div',
  ...props
}) {
  // Base classes
  const baseClasses = 'bg-bg-dark border border-white/10 rounded-xl shadow-base transition-all duration-base'

  // Variant styles
  const variantClasses = {
    default: '',
    elevated: 'shadow-md',
    outlined: 'bg-transparent',
    flat: 'shadow-none',
    gradient: 'bg-gradient-card backdrop-blur-sm',
    glow: 'bg-gradient-card shadow-glow-accent',
  }

  // Padding styles
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  }

  // Hover styles
  const hoverClasses = hoverable ? 'hover:shadow-lg hover:-translate-y-0.5 cursor-pointer' : ''

  // Combined classes
  const classes = `
    ${baseClasses}
    ${variantClasses[variant] || ''}
    ${paddingClasses[padding] || paddingClasses.md}
    ${hoverClasses}
    ${className}
  `
    .trim()
    .replace(/\s+/g, ' ')

  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  )
}

Card.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['default', 'elevated', 'outlined', 'flat', 'gradient', 'glow']),
  padding: PropTypes.oneOf(['none', 'sm', 'md', 'lg']),
  hoverable: PropTypes.bool,
  className: PropTypes.string,
  as: PropTypes.elementType,
}
