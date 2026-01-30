import React, { forwardRef } from 'react';
import styles from './Radio.module.css';

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  label?: string;
  helperText?: string;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
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
    const radioId = id || `radio-${Math.random().toString(36).substr(2, 9)}`;
    const helperTextId = `${radioId}-helper`;
    const errorId = `${radioId}-error`;

    const containerClasses = [
      styles.container,
      error && styles.containerError,
      className
    ].filter(Boolean).join(' ');

    const radioClasses = [
      styles.radio,
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
        <div className={styles.radioWrapper}>
          <input
            ref={ref}
            id={radioId}
            type="radio"
            className={radioClasses}
            disabled={disabled}
            required={required}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={ariaDescribedBy}
            {...props}
          />
          {label && (
            <label htmlFor={radioId} className={styles.label}>
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

Radio.displayName = 'Radio';
