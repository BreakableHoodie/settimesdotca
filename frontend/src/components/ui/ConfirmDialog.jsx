import { useEffect, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import Button from './Button'
import { TriangleAlert } from 'lucide-react'

const FOCUSABLE_SELECTORS = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

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
  const dialogRef = useRef(null)
  const previousActiveElement = useRef(null)

  const getFocusableElements = useCallback(() => {
    if (!dialogRef.current) return []
    return Array.from(dialogRef.current.querySelectorAll(FOCUSABLE_SELECTORS))
  }, [])

  // Focus trap + ESC
  useEffect(() => {
    if (!isOpen) return

    previousActiveElement.current = document.activeElement

    const focusable = getFocusableElements()
    if (focusable.length > 0) {
      window.requestAnimationFrame(() => focusable[0].focus())
    } else if (dialogRef.current) {
      dialogRef.current.focus()
    }

    const handleKeyDown = e => {
      if (e.key === 'Escape') {
        onCancel()
        return
      }
      if (e.key !== 'Tab') return

      const elements = getFocusableElements()
      if (elements.length === 0) return

      const first = elements[0]
      const last = elements[elements.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousActiveElement.current?.focus) {
        previousActiveElement.current.focus()
      }
    }
  }, [isOpen, onCancel, getFocusableElements])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" role="presentation">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xs" aria-hidden="true" />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-bg-purple rounded-lg shadow-xl max-w-md w-full border border-border animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-6 border-b border-border">
          <TriangleAlert size={24} className={variant === 'danger' ? 'text-error-500' : 'text-accent-500'} />
          <h2 id="confirm-dialog-title" className="text-xl font-bold text-text-primary">
            {title}
          </h2>
        </div>

        {/* Message */}
        <div className="p-6">
          <p id="confirm-dialog-message" className="text-text-secondary leading-relaxed">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-bg-purple/50">
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
