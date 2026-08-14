import { useCallback, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { X } from 'lucide-react'
import PosterImage from '../PosterImage'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'

/**
 * ImageLightbox — full-viewport click-to-enlarge image viewer (#655).
 *
 * Standalone rather than built on <Modal> (components/ui/Modal.jsx): Modal
 * renders a card — header bar, padding, a bg-bg-darker background, and a
 * max-h-[90vh] + overflow-y-auto content well — which is the wrong shape for
 * a borderless image viewer. Here the image itself must float directly over
 * the dark scrim, scaled to fit the viewport with no chrome around it, and
 * the close button floats over the image rather than sitting in a header
 * row (it's `position: fixed` but rendered *inside* the `role="dialog"` div
 * below, so it stays reachable by the focus trap and by assistive tech,
 * which treats everything outside that element as inert under
 * aria-modal="true"). The focus-trap / ESC behavior below
 * mirrors the pattern duplicated in Modal.jsx and ConfirmDialog.jsx — there is
 * no shared focus-trap hook in this codebase to extend, so this follows the
 * same proven approach rather than introducing a third, different one. The
 * scroll lock is NOT part of that duplication: it goes through the shared
 * useBodyScrollLock() hook (#657) like Modal, so stacked overlays share one
 * refcount and the lock survives until the last overlay closes.
 *
 * The close button uses `text-white` deliberately — it sits over a fixed
 * dark scrim (bg-black/90), one of the documented theme-token exceptions
 * (CLAUDE.md "Theming"), not a public-surface violation.
 *
 * The image renders through `PosterImage` (#659) rather than a bare `<img>`,
 * so a full-viewport view requests a right-sized Cloudflare image-transform
 * derivative instead of the full-size original — `width` defaults to 1600,
 * chosen so a poster stays readable when someone opens it specifically to
 * read the lineup. Both current callers (the live event page and the
 * archived recap page) pass a poster URL on the same R2-backed host, so
 * baking the transform in here (rather than at each call site) keeps them
 * simple and automatically covers any future caller of this component.
 */
export default function ImageLightbox({ src, alt, isOpen, onClose, width = 1600 }) {
  const dialogRef = useRef(null)
  const previousActiveElement = useRef(null)

  const getFocusableElements = useCallback(() => {
    if (!dialogRef.current) return []
    const focusableSelectors = ['button:not([disabled])', 'a[href]', '[tabindex]:not([tabindex="-1"])'].join(', ')
    return Array.from(dialogRef.current.querySelectorAll(focusableSelectors))
  }, [])

  const handleKeyDown = useCallback(
    e => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      if (e.key !== 'Tab') return

      const focusableElements = getFocusableElements()
      if (focusableElements.length === 0) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault()
        lastElement.focus()
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault()
        firstElement.focus()
      }
    },
    [getFocusableElements, onClose]
  )

  // Save the triggering element and move focus in when the lightbox opens;
  // restore focus to it when the lightbox closes.
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement

      const focusableElements = getFocusableElements()
      if (focusableElements.length > 0) {
        window.requestAnimationFrame(() => {
          focusableElements[0].focus()
        })
      } else if (dialogRef.current) {
        dialogRef.current.focus()
      }
    } else if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
      previousActiveElement.current.focus()
    }
  }, [isOpen, getFocusableElements])

  // ESC + focus trap — only listen while open.
  useEffect(() => {
    if (!isOpen) return

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleKeyDown])

  // Lock body scroll while open. The shared hook refcounts across stacked
  // overlays (#657): the cleanup must not release the lock while a modal below
  // is still open, and unmounting while open must never leave the page stuck
  // unscrollable — both are properties of the refcount, not this component.
  useBodyScrollLock(isOpen)

  const handleBackdropClick = e => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 animate-fade-in"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="relative flex max-h-full max-w-full items-center justify-center"
        role="dialog"
        aria-modal="true"
        aria-label={alt || 'Enlarged image'}
        tabIndex={-1}
      >
        {/* Fixed to the viewport corner regardless of where the image ends up,
            but kept as a DOM child of the dialog above so it's inside the
            focus trap and inside what aria-modal="true" exposes to AT. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close poster"
          className="fixed right-4 top-4 z-10 rounded-full bg-black/70 p-2 text-white transition-colors hover:bg-black/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
        >
          <X size={22} aria-hidden="true" />
        </button>
        {/* Clicking the image itself must not close the lightbox — fans tap
            the image to look closer. No click handler is needed here: a
            click on the image bubbles up to the backdrop's onClick, but its
            e.target === e.currentTarget check only matches a click on the
            backdrop itself, so a click on this nested image never closes it. */}
        {/* The alt fallback mirrors the dialog's aria-label above. It is
            deliberately a real description rather than alt="" (decorative):
            the image IS the dialog's content, so someone navigating inside
            the dialog must be able to find it. That does mean the name is
            announced twice — once for the dialog, once for the image — which
            is the accepted trade for a lightbox; silence is the worse
            failure. Never let this render with no alt attribute at all:
            React omits the attribute entirely for `undefined`, and AT then
            falls back to announcing the URL. */}
        <PosterImage
          src={src}
          width={width}
          alt={alt || 'Enlarged image'}
          loading="eager"
          className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        />
      </div>
    </div>
  )
}

ImageLightbox.propTypes = {
  /** Image URL to display enlarged. Required — there is nothing to show without it. */
  src: PropTypes.string.isRequired,
  /** Alt text — also used as the dialog's accessible name. Optional: both the
      dialog label and the <img> alt fall back to a generic description. */
  alt: PropTypes.string,
  /** Whether the lightbox is open. */
  isOpen: PropTypes.bool.isRequired,
  /** Callback when the lightbox should close. */
  onClose: PropTypes.func.isRequired,
  /** Target render width in CSS pixels for the Cloudflare image transform (#659). Defaults to 1600 — full-viewport, so the poster stays readable. */
  width: PropTypes.number,
}
