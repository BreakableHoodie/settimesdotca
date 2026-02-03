import { useEffect, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'

/**
 * Modal Component - Design System v2.0
 *
 * Accessible modal dialog with backdrop, close button, keyboard support,
 * and focus trap for WCAG 2.1 AA compliance.
 *
 * Features:
 * - Focus trap: Tab/Shift+Tab cycles within modal
 * - Focus restoration: Returns focus to trigger element on close
 * - Escape key: Closes modal
 * - Body scroll lock: Prevents background scrolling
 * - Backdrop click: Optional close on overlay click
 *
 * @example
 * <Modal
 *   isOpen={isOpen}
 *   onClose={handleClose}
 *   title="Create Event"
 *   size="lg"
 * >
 *   <p>Modal content goes here</p>
 * </Modal>
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  showCloseButton = true,
  closeOnBackdropClick = true,
  className = '',
}) {
  const modalRef = useRef(null)
  const previousActiveElement = useRef(null)

  // Get all focusable elements within the modal
  const getFocusableElements = useCallback(() => {
    if (!modalRef.current) return []
    const focusableSelectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ')
    return Array.from(modalRef.current.querySelectorAll(focusableSelectors))
  }, [])

  // Check if the active element is editable (input, textarea, or contenteditable)
  const isEditableElement = useCallback(element => {
    if (!element) return false
    const tagName = element.tagName?.toLowerCase()
    if (tagName === 'input' || tagName === 'textarea') return true
    if (element.isContentEditable) return true
    // Check if inside a contenteditable parent (for rich text editors like Quill)
    if (element.closest?.('[contenteditable="true"]')) return true
    // Safari: check if there's a selection inside a contenteditable
    const selection = window.getSelection()
    if (selection?.anchorNode) {
      const range = selection.anchorNode.parentElement || selection.anchorNode
      if (range?.closest?.('[contenteditable="true"]')) return true
    }
    return false
  }, [])

  // Handle focus trap
  const handleKeyDown = useCallback(
    e => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      // Allow Home/End keys to work normally in editable elements
      // Stop propagation to prevent modal scroll from interfering with cursor movement
      if ((e.key === 'Home' || e.key === 'End') && isEditableElement(document.activeElement)) {
        e.stopPropagation()
        return
      }

      if (e.key !== 'Tab') return

      const focusableElements = getFocusableElements()
      if (focusableElements.length === 0) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      // Shift+Tab on first element: move to last
      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault()
        lastElement.focus()
      }
      // Tab on last element: move to first
      else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault()
        firstElement.focus()
      }
    },
    [getFocusableElements, isEditableElement, onClose]
  )

  // Save previous focus and set initial focus when modal opens
  useEffect(() => {
    if (isOpen) {
      // Save currently focused element
      previousActiveElement.current = document.activeElement

      // Focus first focusable element or modal itself
      const focusableElements = getFocusableElements()
      if (focusableElements.length > 0) {
        // Small delay to ensure modal is rendered
        window.requestAnimationFrame(() => {
          focusableElements[0].focus()
        })
      } else if (modalRef.current) {
        modalRef.current.focus()
      }
    } else {
      // Restore focus when modal closes
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus()
      }
    }
  }, [isOpen, getFocusableElements])

  // Add keyboard event listener
  useEffect(() => {
    if (!isOpen) return

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleKeyDown])

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Handle backdrop click
  const handleBackdropClick = e => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!isOpen) return null

  // Size styles
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-[95vw]',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={modalRef}
        className={`
          w-full bg-bg-darker border border-white/10 rounded-xl shadow-xl
          max-h-[90vh] overflow-y-auto animate-scale-in
          ${sizeClasses[size] || sizeClasses.md}
          ${className}
        `
          .trim()
          .replace(/\s+/g, ' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        tabIndex={-1}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            {title && (
              <h2 id="modal-title" className="text-2xl font-bold text-text-primary">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Close modal"
              >
                <FontAwesomeIcon icon={faXmark} className="text-xl text-text-secondary" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-6">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 p-6 border-t border-white/10 bg-white/5">{footer}</div>
        )}
      </div>
    </div>
  )
}

Modal.propTypes = {
  /** Whether the modal is open */
  isOpen: PropTypes.bool.isRequired,
  /** Callback when modal should close */
  onClose: PropTypes.func.isRequired,
  /** Modal title displayed in header */
  title: PropTypes.string,
  /** Modal content */
  children: PropTypes.node.isRequired,
  /** Optional footer content (e.g., action buttons) */
  footer: PropTypes.node,
  /** Modal width size */
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl', 'full']),
  /** Whether clicking backdrop closes modal */
  closeOnBackdropClick: PropTypes.bool,
  /** Whether to show the close button */
  showCloseButton: PropTypes.bool,
  /** Additional CSS classes */
  className: PropTypes.string,
}
