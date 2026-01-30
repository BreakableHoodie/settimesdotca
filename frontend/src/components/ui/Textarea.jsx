import PropTypes from 'prop-types'

/**
 * Textarea Component - Design System v2.0
 *
 * Accessible multi-line text input with label, error states, and helper text.
 * Styled consistently with Input component for form uniformity.
 * Supports auto-resize and character counting.
 *
 * @example
 * <Textarea
 *   label="Band Bio"
 *   value={bio}
 *   onChange={(e) => setBio(e.target.value)}
 *   placeholder="Tell us about the band..."
 *   rows={4}
 *   maxLength={500}
 *   showCount
 * />
 */
export default function Textarea({
  label,
  value,
  onChange,
  placeholder = '',
  error = '',
  helperText = '',
  required = false,
  disabled = false,
  id,
  name,
  rows = 4,
  maxLength,
  showCount = false,
  resize = 'vertical',
  className = '',
  ...props
}) {
  const textareaId = id || `textarea-${name || label?.toLowerCase().replace(/\s+/g, '-')}`
  const hasError = !!error
  const characterCount = value?.length || 0

  const resizeClasses = {
    none: 'resize-none',
    vertical: 'resize-y',
    horizontal: 'resize-x',
    both: 'resize',
  }

  const textareaClasses = `
    w-full px-4 py-3
    bg-white/5 border rounded-lg
    text-text-primary placeholder-text-tertiary
    transition-colors duration-base
    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-navy
    disabled:opacity-50 disabled:cursor-not-allowed
    ${resizeClasses[resize] || resizeClasses.vertical}
    ${
      hasError
        ? 'border-error-500 focus:border-error-500 focus:ring-error-500'
        : 'border-white/10 focus:border-primary-500 focus:ring-primary-500/50'
    }
    ${className}
  `
    .trim()
    .replace(/\s+/g, ' ')

  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={textareaId} className="block text-sm font-medium text-text-secondary">
          {label}
          {required && (
            <span className="text-error-400 ml-1" aria-label="required">
              *
            </span>
          )}
        </label>
      )}

      <textarea
        id={textareaId}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        rows={rows}
        maxLength={maxLength}
        aria-invalid={hasError}
        aria-describedby={hasError ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined}
        className={textareaClasses}
        {...props}
      />

      <div className="flex justify-between items-start gap-2">
        <div className="flex-1">
          {error && (
            <p id={`${textareaId}-error`} className="text-sm text-error-400" role="alert">
              {error}
            </p>
          )}

          {!error && helperText && (
            <p id={`${textareaId}-helper`} className="text-sm text-text-tertiary">
              {helperText}
            </p>
          )}
        </div>

        {showCount && maxLength && (
          <span
            className={`text-xs flex-shrink-0 ${
              characterCount > maxLength * 0.9 ? 'text-warning-400' : 'text-text-tertiary'
            } ${characterCount >= maxLength ? 'text-error-400' : ''}`}
          >
            {characterCount}/{maxLength}
          </span>
        )}
      </div>
    </div>
  )
}

Textarea.propTypes = {
  /** Label text displayed above textarea */
  label: PropTypes.string,
  /** Current value */
  value: PropTypes.string,
  /** Change handler */
  onChange: PropTypes.func.isRequired,
  /** Placeholder text */
  placeholder: PropTypes.string,
  /** Error message to display */
  error: PropTypes.string,
  /** Helper text displayed below textarea */
  helperText: PropTypes.string,
  /** Whether field is required */
  required: PropTypes.bool,
  /** Whether field is disabled */
  disabled: PropTypes.bool,
  /** Custom id attribute */
  id: PropTypes.string,
  /** Name attribute for form submission */
  name: PropTypes.string,
  /** Number of visible rows */
  rows: PropTypes.number,
  /** Maximum character length */
  maxLength: PropTypes.number,
  /** Whether to show character count */
  showCount: PropTypes.bool,
  /** Resize behavior: 'none' | 'vertical' | 'horizontal' | 'both' */
  resize: PropTypes.oneOf(['none', 'vertical', 'horizontal', 'both']),
  /** Additional CSS classes */
  className: PropTypes.string,
}
