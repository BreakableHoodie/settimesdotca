import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import ImageLightbox from '../ImageLightbox'

function Harness({ initialIsOpen = true }) {
  const [isOpen, setIsOpen] = useState(initialIsOpen)
  return (
    <div>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open trigger
      </button>
      <ImageLightbox
        src="https://example.test/poster.jpg"
        alt="Test Event poster"
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </div>
  )
}

describe('ImageLightbox', () => {
  it('renders nothing when closed', () => {
    const onClose = vi.fn()
    const { container } = render(
      <ImageLightbox src="https://example.test/poster.jpg" alt="Test poster" isOpen={false} onClose={onClose} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('opens with the dialog role, an accessible name, and the image visible', () => {
    const onClose = vi.fn()
    render(
      <ImageLightbox src="https://example.test/poster.jpg" alt="Test Event poster" isOpen={true} onClose={onClose} />
    )

    const dialog = screen.getByRole('dialog', { name: 'Test Event poster' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('img', { name: 'Test Event poster' })).toHaveAttribute(
      'src',
      'https://example.test/poster.jpg'
    )
  })

  it('has a close button with a real accessible name', () => {
    const onClose = vi.fn()
    render(
      <ImageLightbox src="https://example.test/poster.jpg" alt="Test Event poster" isOpen={true} onClose={onClose} />
    )
    expect(screen.getByRole('button', { name: 'Close poster' })).toBeInTheDocument()
  })

  // Regression guard for #655 review: the close button must be a DOM child
  // of the role="dialog" element, or getFocusableElements() (which queries
  // dialogRef.current) finds nothing — silently breaking the focus trap,
  // initial focus, and aria-modal's exposure of the button to AT all at once.
  it('is a descendant of the dialog element (focus trap requires this)', () => {
    const onClose = vi.fn()
    render(
      <ImageLightbox src="https://example.test/poster.jpg" alt="Test Event poster" isOpen={true} onClose={onClose} />
    )
    const dialog = screen.getByRole('dialog')
    const closeButton = screen.getByRole('button', { name: 'Close poster' })
    expect(dialog).toContainElement(closeButton)
  })

  it('moves focus to the close button on open', async () => {
    const onClose = vi.fn()
    render(
      <ImageLightbox src="https://example.test/poster.jpg" alt="Test Event poster" isOpen={true} onClose={onClose} />
    )
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Close poster' })).toHaveFocus()
    })
  })

  it('keeps Tab from leaving the dialog (the close button is the only focusable element)', async () => {
    const onClose = vi.fn()
    render(
      <ImageLightbox src="https://example.test/poster.jpg" alt="Test Event poster" isOpen={true} onClose={onClose} />
    )
    const closeButton = screen.getByRole('button', { name: 'Close poster' })
    await waitFor(() => expect(closeButton).toHaveFocus())

    fireEvent.keyDown(document, { key: 'Tab' })
    expect(closeButton).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(closeButton).toHaveFocus()
  })

  it('closes on ESC key', () => {
    const onClose = vi.fn()
    render(
      <ImageLightbox src="https://example.test/poster.jpg" alt="Test Event poster" isOpen={true} onClose={onClose} />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on backdrop click', () => {
    const onClose = vi.fn()
    const { container } = render(
      <ImageLightbox src="https://example.test/poster.jpg" alt="Test Event poster" isOpen={true} onClose={onClose} />
    )
    // The outer presentation element is the backdrop itself — query directly
    // rather than by role, since role="presentation" strips it from the
    // accessibility tree that getByRole queries against.
    const backdrop = container.querySelector('[role="presentation"]')
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT close when the image itself is clicked', () => {
    const onClose = vi.fn()
    render(
      <ImageLightbox src="https://example.test/poster.jpg" alt="Test Event poster" isOpen={true} onClose={onClose} />
    )
    const image = screen.getByRole('img', { name: 'Test Event poster' })
    fireEvent.click(image)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes when the close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <ImageLightbox src="https://example.test/poster.jpg" alt="Test Event poster" isOpen={true} onClose={onClose} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close poster' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('locks body scroll while open and restores it on close', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <ImageLightbox src="https://example.test/poster.jpg" alt="Test Event poster" isOpen={true} onClose={onClose} />
    )
    expect(document.body.style.overflow).toBe('hidden')

    rerender(
      <ImageLightbox src="https://example.test/poster.jpg" alt="Test Event poster" isOpen={false} onClose={onClose} />
    )
    expect(document.body.style.overflow).toBe('')
  })

  it('restores body scroll if unmounted while still open', () => {
    const onClose = vi.fn()
    const { unmount } = render(
      <ImageLightbox src="https://example.test/poster.jpg" alt="Test Event poster" isOpen={true} onClose={onClose} />
    )
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('restores focus to the triggering element on close', async () => {
    render(<Harness initialIsOpen={false} />)

    const trigger = screen.getByRole('button', { name: 'Open trigger' })
    trigger.focus()
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    // Let the open-focus rAF land on the close button first, so the
    // subsequent close is the only thing moving focus afterward — otherwise
    // a still-pending "focus in" rAF from the open transition can race with
    // and clobber the "focus restore" assertion below.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Close poster' })).toHaveFocus()
    })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger).toHaveFocus()
  })

  // React omits the attribute entirely when alt is undefined, and assistive
  // tech then falls back to announcing the image URL. Guarantee an alt is
  // always present, even though both current callers pass one.
  it('always renders an alt attribute, falling back when alt is omitted', () => {
    render(<ImageLightbox src="https://example.test/poster.jpg" isOpen={true} onClose={vi.fn()} />)

    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Enlarged image')
  })

  it('prefers the supplied alt over the fallback', () => {
    render(
      <ImageLightbox src="https://example.test/poster.jpg" alt="Test Event poster" isOpen={true} onClose={vi.fn()} />
    )

    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Test Event poster')
  })
})
