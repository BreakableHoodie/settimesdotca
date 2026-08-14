import { act, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useBodyScrollLock } from '../useBodyScrollLock'

// Regression suite for #657. The defect class: Modal.jsx and ImageLightbox.jsx
// each wrote document.body.style.overflow directly, and each cleanup reset it
// unconditionally — so with two overlays stacked, closing the TOP one released
// the lock while the one below was still open. A shared refcount can only be
// proven by nesting, which is why every test here drives TWO consumers (as the
// real components do when a lightbox opens over a modal).
function Harness({ locked }) {
  useBodyScrollLock(locked)
  return null
}

function mountLocked() {
  return render(<Harness locked={true} />)
}

describe('useBodyScrollLock', () => {
  it('locks body scroll while locked and restores it when unlocked', () => {
    const first = mountLocked()
    expect(document.body.style.overflow).toBe('hidden')

    act(() => first.rerender(<Harness locked={false} />))
    expect(document.body.style.overflow).toBe('')
  })

  it('does not touch body scroll when never locked', () => {
    render(<Harness locked={false} />)
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps the lock until the LAST overlay closes, regardless of close order', () => {
    // The modal opens first, the lightbox opens on top of it.
    const modal = mountLocked()
    const lightbox = mountLocked()
    expect(document.body.style.overflow).toBe('hidden')

    // Topmost overlay closes — the modal below is STILL open, so the page must
    // stay locked. This is the exact #657 failure: the lightbox's old cleanup
    // reset overflow to '' here while the modal was still open.
    act(() => lightbox.rerender(<Harness locked={false} />))
    expect(document.body.style.overflow).toBe('hidden')

    // The last overlay closes — only now does the lock release.
    act(() => modal.rerender(<Harness locked={false} />))
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps the lock when the CLOSER releases, regardless of which overlay closes first', () => {
    const modal = mountLocked()
    const lightbox = mountLocked()

    act(() => modal.rerender(<Harness locked={false} />))
    expect(document.body.style.overflow).toBe('hidden')

    act(() => lightbox.rerender(<Harness locked={false} />))
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps the lock if the top overlay unmounts while open, until the other closes', () => {
    const modal = mountLocked()
    const lightbox = mountLocked()

    act(() => lightbox.unmount())
    expect(document.body.style.overflow).toBe('hidden')

    act(() => modal.unmount())
    expect(document.body.style.overflow).toBe('')
  })

  it('preserves a pre-existing overflow value rather than assuming empty', () => {
    // A future global style could set something else; the hook must restore
    // the exact prior value (issue note).
    document.body.style.overflow = 'scroll'
    const overlay = mountLocked()
    expect(document.body.style.overflow).toBe('hidden')

    act(() => overlay.unmount())
    expect(document.body.style.overflow).toBe('scroll')
    document.body.style.overflow = ''
  })

  it('re-locks cleanly after a full lock/unlock cycle', () => {
    const overlay = mountLocked()
    act(() => overlay.rerender(<Harness locked={false} />))
    expect(document.body.style.overflow).toBe('')

    act(() => overlay.rerender(<Harness locked={true} />))
    expect(document.body.style.overflow).toBe('hidden')
  })
})
