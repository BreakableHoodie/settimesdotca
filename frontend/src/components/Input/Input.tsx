import React, { forwardRef } from 'react';
import styles from './Input.module.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  success?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      success = false,
      size = 'md',
      className,
      id,
      required,
      disabled,
      type = 'text',
      ...props
    },
    ref
  ) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
    const helperTextId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;

    const inputClasses = [
      styles.input,
      styles[size],
      error && styles.error,
      success && !error && styles.success,
      className
    ].filter(Boolean).join(' ');

    const hasHelperText = helperText || error;
    const ariaDescribedBy = hasHelperText
      ? error
        ? errorId
        : helperTextId
      : undefined;

    return (
      <div className={styles.container}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
            {required && <span className={styles.required} aria-label="required">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={inputClasses}
          disabled={disabled}
          required={required}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={ariaDescribedBy}
          {...props}
        />
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

Input.displayName = 'Input';
