import PropTypes from 'prop-types'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons'

/**
 * Select Component - Design System v2.0
 *
 * Accessible dropdown select with label, error states, and helper text.
 * Styled consistently with Input component for form uniformity.
 *
 * @example
 * <Select
 *   label="Venue"
 *   value={selectedVenue}
 *   onChange={(e) => setSelectedVenue(e.target.value)}
 *   options={[
 *     { value: 'venue-1', label: 'The Warehouse' },
 *     { value: 'venue-2', label: 'Club Nova' }
 *   ]}
 *   placeholder="Select a venue"
 *   required
 * />
 */
export default function Select({
  label,
  value,
  onChange,
  options = [],
  placeholder = 'Select an option',
  error = '',
  helperText = '',
  required = false,
  disabled = false,
  id,
  name,
  className = '',
  ...props
}) {
  const selectId = id || `select-${name || label?.toLowerCase().replace(/\s+/g, '-')}`
  const hasError = !!error

  const selectClasses = `
    w-full px-4 py-2.5 pr-10 min-h-[44px]
    bg-white/5 border rounded-lg
    text-text-primary
    transition-colors duration-base
    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-navy
    disabled:opacity-50 disabled:cursor-not-allowed
    appearance-none cursor-pointer
    ${
      hasError
        ? 'border-error-500 focus:border-error-500 focus:ring-error-500'
        : 'border-white/10 focus:border-primary-500 focus:ring-primary-500/50'
    }
    ${!value ? 'text-text-tertiary' : ''}
    ${className}
  `
    .trim()
    .replace(/\s+/g, ' ')

  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-text-secondary">
          {label}
          {required && (
            <span className="text-error-400 ml-1" aria-label="required">
              *
            </span>
          )}
        </label>
      )}

      <div className="relative">
        <select
          id={selectId}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined}
          className={selectClasses}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map(option => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Custom dropdown arrow */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none">
          <FontAwesomeIcon icon={faChevronDown} className="text-sm" />
        </div>
      </div>

      {error && (
        <p id={`${selectId}-error`} className="text-sm text-error-400" role="alert">
          {error}
        </p>
      )}

      {!error && helperText && (
        <p id={`${selectId}-helper`} className="text-sm text-text-tertiary">
          {helperText}
        </p>
      )}
    </div>
  )
}

Select.propTypes = {
  /** Label text displayed above select */
  label: PropTypes.string,
  /** Currently selected value */
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  /** Change handler */
  onChange: PropTypes.func.isRequired,
  /** Array of options: { value, label, disabled? } */
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      label: PropTypes.string.isRequired,
      disabled: PropTypes.bool,
    })
  ).isRequired,
  /** Placeholder text when no value selected */
  placeholder: PropTypes.string,
  /** Error message to display */
  error: PropTypes.string,
  /** Helper text displayed below select */
  helperText: PropTypes.string,
  /** Whether field is required */
  required: PropTypes.bool,
  /** Whether field is disabled */
  disabled: PropTypes.bool,
  /** Custom id attribute */
  id: PropTypes.string,
  /** Name attribute for form submission */
  name: PropTypes.string,
  /** Additional CSS classes */
  className: PropTypes.string,
}
