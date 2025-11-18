import PropTypes from 'prop-types'

/**
 * Input Component - Design System v1.0
 *
 * Accessible form input with label, error states, and helper text.
 * Supports text, email, password, number, and other input types.
 *
 * @example
 * <Input
 *   label="Event Name"
 *   type="text"
 *   value={eventName}
 *   onChange={(e) => setEventName(e.target.value)}
 *   placeholder="Long Weekend Band Crawl Vol. 6"
 *   error={errors.eventName}
 *   required
 * />
 */
export default function Input({
  label,
  type = 'text',
  value,
  onChange,
  placeholder = '',
  error = '',
  helperText = '',
  required = false,
  disabled = false,
  id,
  name,
  className = '',
  icon = null,
  iconPosition = 'left',
  ...props
}) {
  const inputId = id || `input-${name || label?.toLowerCase().replace(/\s+/g, '-')}`
  const hasError = !!error

  const inputClasses = `
    w-full px-4 py-2.5 min-h-[44px]
    bg-white/5 border rounded-lg
    text-text-primary placeholder-text-tertiary
    transition-colors duration-base
    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-navy
    disabled:opacity-50 disabled:cursor-not-allowed
    ${hasError
      ? 'border-error-500 focus:border-error-500 focus:ring-error-500'
      : 'border-white/10 focus:border-primary-500 focus:ring-primary-500/50'
    }
    ${icon && iconPosition === 'left' ? 'pl-10' : ''}
    ${icon && iconPosition === 'right' ? 'pr-10' : ''}
    ${className}
  `.trim().replace(/\s+/g, ' ')

  return (
    <div className="space-y-2">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-text-secondary"
        >
          {label}
          {required && <span className="text-error-400 ml-1" aria-label="required">*</span>}
        </label>
      )}

      <div className="relative">
        {icon && iconPosition === 'left' && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none">
            {icon}
          </div>
        )}

        <input
          id={inputId}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={
            hasError
              ? `${inputId}-error`
              : helperText
                ? `${inputId}-helper`
                : undefined
          }
          className={inputClasses}
          {...props}
        />

        {icon && iconPosition === 'right' && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none">
            {icon}
          </div>
        )}
      </div>

      {error && (
        <p
          id={`${inputId}-error`}
          className="text-sm text-error-400"
          role="alert"
        >
          {error}
        </p>
      )}

      {!error && helperText && (
        <p
          id={`${inputId}-helper`}
          className="text-sm text-text-tertiary"
        >
          {helperText}
        </p>
      )}
    </div>
  )
}

Input.propTypes = {
  label: PropTypes.string,
  type: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  error: PropTypes.string,
  helperText: PropTypes.string,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  id: PropTypes.string,
  name: PropTypes.string,
  className: PropTypes.string,
  icon: PropTypes.node,
  iconPosition: PropTypes.oneOf(['left', 'right']),
}
