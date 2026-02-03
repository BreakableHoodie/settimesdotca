import React, { forwardRef, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  children: React.ReactNode;
}

export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      isOpen,
      onClose,
      title,
      size = 'md',
      closeOnOverlayClick = true,
      closeOnEscape = true,
      showCloseButton = true,
      children,
    },
    ref
  ) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const previousActiveElement = useRef<HTMLElement | null>(null);

    // Handle escape key
    useEffect(() => {
      if (!isOpen || !closeOnEscape) return;

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };

      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, closeOnEscape, onClose]);

    // Focus management and focus trap
    useEffect(() => {
      if (isOpen) {
        // Store currently focused element
        previousActiveElement.current = document.activeElement as HTMLElement;

        // Focus modal
        modalRef.current?.focus();

        // Prevent body scroll
        document.body.style.overflow = 'hidden';

        // Check if the active element is editable
        const isEditableElement = (element: Element | null): boolean => {
          if (!element) return false;
          const tagName = element.tagName?.toLowerCase();
          if (tagName === 'input' || tagName === 'textarea') return true;
          if ((element as HTMLElement).isContentEditable) return true;
          return element.closest?.('[contenteditable="true"]') !== null;
        };

        // Focus trap: handle Tab key to cycle focus within modal
        // Also handle Home/End to allow proper behavior in editable elements
        const handleTab = (e: KeyboardEvent) => {
          // Allow Home/End keys to work normally in editable elements
          if ((e.key === 'Home' || e.key === 'End') && isEditableElement(document.activeElement)) {
            e.stopPropagation();
            return;
          }

          if (e.key !== 'Tab' || !modalRef.current) return;

          const focusableElements = modalRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          const focusableArray = Array.from(focusableElements) as HTMLElement[];

          if (focusableArray.length === 0) return;

          const firstElement = focusableArray[0];
          const lastElement = focusableArray[focusableArray.length - 1];

          if (e.shiftKey) {
            // Shift + Tab: if on first element, wrap to last
            if (document.activeElement === firstElement) {
              e.preventDefault();
              lastElement.focus();
            }
          } else {
            // Tab: if on last element, wrap to first
            if (document.activeElement === lastElement) {
              e.preventDefault();
              firstElement.focus();
            }
          }
        };

        document.addEventListener('keydown', handleTab);

        return () => {
          document.removeEventListener('keydown', handleTab);
          document.body.style.overflow = '';
        };
      } else {
        // Restore focus
        previousActiveElement.current?.focus();

        // Restore body scroll
        document.body.style.overflow = '';
      }

      return () => {
        document.body.style.overflow = '';
      };
    }, [isOpen]);

    // Handle overlay click
    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (closeOnOverlayClick && e.target === e.currentTarget) {
        onClose();
      }
    };

    if (!isOpen) return null;

    const modal = (
      <div className={styles.overlay} onClick={handleOverlayClick}>
        <div
          ref={modalRef}
          className={`${styles.modal} ${styles[size]}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
          tabIndex={-1}
        >
          {(title || showCloseButton) && (
            <div className={styles.header}>
              {title && (
                <h2 id="modal-title" className={styles.title}>
                  {title}
                </h2>
              )}
              {showCloseButton && (
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={onClose}
                  aria-label="Close modal"
                >
                  <svg
                    className={styles.closeIcon}
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M18 6L6 18M6 6L18 18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>
          )}
          <div className={styles.content}>{children}</div>
        </div>
      </div>
    );

    return createPortal(modal, document.body);
  }
);

Modal.displayName = 'Modal';

export interface ModalHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export const ModalHeader = forwardRef<HTMLDivElement, ModalHeaderProps>(
  ({ className, children, ...props }, ref) => {
    const headerClasses = [styles.modalHeader, className]
      .filter(Boolean)
      .join(' ');

    return (
      <div ref={ref} className={headerClasses} {...props}>
        {children}
      </div>
    );
  }
);

ModalHeader.displayName = 'ModalHeader';

export interface ModalBodyProps extends React.HTMLAttributes<HTMLDivElement> {}

export const ModalBody = forwardRef<HTMLDivElement, ModalBodyProps>(
  ({ className, children, ...props }, ref) => {
    const bodyClasses = [styles.modalBody, className].filter(Boolean).join(' ');

    return (
      <div ref={ref} className={bodyClasses} {...props}>
        {children}
      </div>
    );
  }
);

ModalBody.displayName = 'ModalBody';

export interface ModalFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export const ModalFooter = forwardRef<HTMLDivElement, ModalFooterProps>(
  ({ className, children, ...props }, ref) => {
    const footerClasses = [styles.modalFooter, className]
      .filter(Boolean)
      .join(' ');

    return (
      <div ref={ref} className={footerClasses} {...props}>
        {children}
      </div>
    );
  }
);

ModalFooter.displayName = 'ModalFooter';
