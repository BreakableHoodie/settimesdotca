import React, { forwardRef } from 'react';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  label?: string;
  helperText?: string;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      helperText,
      error,
      size = 'md',
      indeterminate = false,
      className,
      id,
      required,
      disabled,
      ...props
    },
    ref
  ) => {
    const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;
    const helperTextId = `${checkboxId}-helper`;
    const errorId = `${checkboxId}-error`;

    const containerClasses = [
      styles.container,
      error && styles.containerError,
      className
    ].filter(Boolean).join(' ');

    const checkboxClasses = [
      styles.checkbox,
      styles[size],
      error && styles.error
    ].filter(Boolean).join(' ');

    const hasHelperText = helperText || error;
    const ariaDescribedBy = hasHelperText
      ? error
        ? errorId
        : helperTextId
      : undefined;

    React.useEffect(() => {
      if (ref && typeof ref !== 'function' && ref.current) {
        ref.current.indeterminate = indeterminate;
      }
    }, [indeterminate, ref]);

    return (
      <div className={containerClasses}>
        <div className={styles.checkboxWrapper}>
          <input
            ref={ref}
            id={checkboxId}
            type="checkbox"
            className={checkboxClasses}
            disabled={disabled}
            required={required}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={ariaDescribedBy}
            {...props}
          />
          {label && (
            <label htmlFor={checkboxId} className={styles.label}>
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

Checkbox.displayName = 'Checkbox';
