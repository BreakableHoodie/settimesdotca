import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import Modal from '../Modal'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Sheet">
        <button type="button">Inside</button>
      </Modal>
    </>
  )
}

describe('Modal focus restore', () => {
  // Safari does not focus a button on a mouse click, so activeElement is still
  // <body> when the modal opens. Reproduced here by pressing without focusing.
  it('returns focus to the pressed trigger when the click never focused it', () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    expect(document.activeElement).toBe(document.body)

    fireEvent.pointerDown(trigger)
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })

  it('still restores to the focused element when there is one (keyboard open)', () => {
    render(
      <>
        <button type="button">Elsewhere</button>
        <Harness />
      </>
    )
    const trigger = screen.getByRole('button', { name: 'Open' })
    // A pointer press on ANOTHER control must not override real focus.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }))
    trigger.focus()
    fireEvent.click(trigger)
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(document.activeElement).toBe(trigger)
  })
  it('ignores a press older than a second (e.g. the start of a scroll)', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      render(
        <>
          <button type="button">Old press</button>
          <Harness />
        </>
      )
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Old press' }))
      vi.setSystemTime(Date.now() + 5000)
      // Opened without a pointer and without focus, as an effect-driven modal is.
      fireEvent.click(screen.getByRole('button', { name: 'Open' }))
      act(() => {
        fireEvent.keyDown(document, { key: 'Escape' })
      })
      expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Old press' }))
    } finally {
      vi.useRealTimers()
    }
  })
})
