import React, { forwardRef } from 'react';
import styles from './Toggle.module.css';

export interface ToggleProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  label?: string;
  helperText?: string;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  (
    {
      label,
      helperText,
      error,
      size = 'md',
      className,
      id,
      required,
      disabled,
      ...props
    },
    ref
  ) => {
    const toggleId = id || `toggle-${Math.random().toString(36).substr(2, 9)}`;
    const helperTextId = `${toggleId}-helper`;
    const errorId = `${toggleId}-error`;

    const containerClasses = [
      styles.container,
      error && styles.containerError,
      className
    ].filter(Boolean).join(' ');

    const toggleClasses = [
      styles.toggle,
      styles[size],
      error && styles.error
    ].filter(Boolean).join(' ');

    const hasHelperText = helperText || error;
    const ariaDescribedBy = hasHelperText
      ? error
        ? errorId
        : helperTextId
      : undefined;

    return (
      <div className={containerClasses}>
        <div className={styles.toggleWrapper}>
          <input
            ref={ref}
            id={toggleId}
            type="checkbox"
            role="switch"
            className={toggleClasses}
            disabled={disabled}
            required={required}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={ariaDescribedBy}
            {...props}
          />
          <span className={styles.slider}></span>
          {label && (
            <label htmlFor={toggleId} className={styles.label}>
              {label}
              {required && <span className={styles.required} aria-label="required">*</span>}
            </label>
          )}
        </div>
        {error && (
          <span id={errorId} className={styles.errorText} role="alert">
            {error}
          </span>
        )}
        {helperText && !error && (
          <span id={helperTextId} className={styles.helperText}>
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Toggle.displayName = 'Toggle';
