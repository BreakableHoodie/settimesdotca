import React, { forwardRef, useState } from 'react';
import styles from './Alert.module.css';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'success' | 'warning' | 'error' | 'info';
  title?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  (
    {
      variant = 'info',
      title,
      dismissible = false,
      onDismiss,
      icon,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const [isVisible, setIsVisible] = useState(true);

    const handleDismiss = () => {
      setIsVisible(false);
      onDismiss?.();
    };

    if (!isVisible) return null;

    const alertClasses = [
      styles.alert,
      styles[variant],
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const defaultIcons = {
      success: (
        <svg
          className={styles.icon}
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM8 15L3 10L4.41 8.59L8 12.17L15.59 4.58L17 6L8 15Z"
            fill="currentColor"
          />
        </svg>
      ),
      warning: (
        <svg
          className={styles.icon}
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM11 15H9V13H11V15ZM11 11H9V5H11V11Z"
            fill="currentColor"
          />
        </svg>
      ),
      error: (
        <svg
          className={styles.icon}
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM11 15H9V13H11V15ZM11 11H9V5H11V11Z"
            fill="currentColor"
          />
        </svg>
      ),
      info: (
        <svg
          className={styles.icon}
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM11 15H9V9H11V15ZM11 7H9V5H11V7Z"
            fill="currentColor"
          />
        </svg>
      ),
    };

    const displayIcon = icon !== undefined ? icon : defaultIcons[variant];

    return (
      <div
        ref={ref}
        className={alertClasses}
        role="alert"
        {...props}
      >
        {displayIcon && <div className={styles.iconWrapper}>{displayIcon}</div>}

        <div className={styles.content}>
          {title && <div className={styles.title}>{title}</div>}
          <div className={styles.message}>{children}</div>
        </div>

        {dismissible && (
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleDismiss}
            aria-label="Dismiss alert"
          >
            <svg
              className={styles.closeIcon}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 4L4 12M4 4L12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    );
  }
);

Alert.displayName = 'Alert';
