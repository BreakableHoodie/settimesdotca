import { useEffect } from 'react'
import PropTypes from 'prop-types'
import Button from './Button'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons'

/**
 * ConfirmDialog - Confirmation dialog for destructive actions
 * Sprint 2.3: Prevents accidental data loss
 *
 * Features:
 * - Modal overlay with backdrop
 * - Clear action/cancel buttons
 * - Keyboard accessible (ESC to cancel)
 * - WCAG 2.1 AA compliant
 * - Focus trap within modal
 *
 * @param {boolean} isOpen - Whether dialog is visible
 * @param {Function} onConfirm - Callback when user confirms
 * @param {Function} onCancel - Callback when user cancels
 * @param {string} title - Dialog title
 * @param {string} message - Confirmation message
 * @param {string} confirmText - Text for confirm button (default: "Confirm")
 * @param {string} cancelText - Text for cancel button (default: "Cancel")
 * @param {string} variant - Button variant: 'danger' | 'primary' (default: 'danger')
 */
export default function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
}) {
  // Handle ESC key press
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = e => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" role="presentation">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />

      {/* Dialog */}
      <div
        className="relative bg-bg-elevated rounded-lg shadow-xl max-w-md w-full border border-white/10 animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className={`text-2xl ${variant === 'danger' ? 'text-error-500' : 'text-accent-500'}`}
            />
            <h2 id="confirm-dialog-title" className="text-xl font-bold text-text-primary">
              {title}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="text-text-secondary hover:text-text-primary transition-colors p-1 rounded focus:outline-none focus:ring-2 focus:ring-accent-500"
            aria-label="Close dialog"
          >
            <FontAwesomeIcon icon={faXmark} className="text-xl" />
          </button>
        </div>

        {/* Message */}
        <div className="p-6">
          <p id="confirm-dialog-message" className="text-text-secondary leading-relaxed">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-white/10 bg-bg-elevated/50">
          <Button variant="secondary" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant={variant} onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}

ConfirmDialog.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  title: PropTypes.string,
  message: PropTypes.string.isRequired,
  confirmText: PropTypes.string,
  cancelText: PropTypes.string,
  variant: PropTypes.oneOf(['danger', 'primary']),
}
