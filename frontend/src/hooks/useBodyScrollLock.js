import { useEffect } from 'react'

// Module-level refcount shared by EVERY overlay in the app (Modal,
// ImageLightbox, …). Overlays stack: a lightbox can open over a modal, and a
// later drawer over both. Before #657 each component wrote
// document.body.style.overflow directly and each cleanup restored it
// unconditionally — closing the TOP overlay released the lock while the one
// below was still open, and the page scrolled again behind a live modal.
//
// The count lives at module scope rather than in component state so that
// independent consumers share it; the FIRST lock captures the pre-existing
// overflow value and the LAST unlock restores exactly that value — not an
// assumed '' — so a future global style survives an overlay cycle.
let lockCount = 0
let previousOverflow = null

export function useBodyScrollLock(isLocked) {
  useEffect(() => {
    if (!isLocked) return

    if (lockCount === 0) {
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    lockCount += 1

    return () => {
      lockCount -= 1
      if (lockCount === 0) {
        document.body.style.overflow = previousOverflow
        previousOverflow = null
      }
    }
  }, [isLocked])
}
