import React, { forwardRef } from 'react';
import styles from './Badge.module.css';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  pill?: boolean;
  dot?: boolean;
  removable?: boolean;
  onRemove?: () => void;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = 'neutral',
      size = 'md',
      pill = false,
      dot = false,
      removable = false,
      onRemove,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const badgeClasses = [
      styles.badge,
      styles[variant],
      styles[size],
      pill && styles.pill,
      dot && styles.dot,
      removable && styles.removable,
      className
    ].filter(Boolean).join(' ');

    const handleRemove = (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove?.();
    };

    return (
      <span ref={ref} className={badgeClasses} {...props}>
        {dot && <span className={styles.dotIndicator} aria-hidden="true" />}
        <span className={styles.content}>{children}</span>
        {removable && (
          <button
            type="button"
            className={styles.removeButton}
            onClick={handleRemove}
            aria-label="Remove badge"
          >
            <svg
              className={styles.removeIcon}
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
