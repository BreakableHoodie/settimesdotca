import { fireEvent, render, screen, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { describe, expect, it, vi } from 'vitest'
import BulkActionBar from '../BulkActionBar'
import BulkPreviewModal from '../BulkPreviewModal'
import BottomNav from '../BottomNav'

expect.extend(toHaveNoViolations)

const VENUES = [
  { id: 1, name: 'Blue Room' },
  { id: 2, name: 'Room 47' },
]

const barProps = {
  count: 3,
  action: null,
  params: {},
  venues: VENUES,
  isLoading: false,
  isGlobalView: false,
  onActionChange: vi.fn(),
  onParamsChange: vi.fn(),
  onSubmit: vi.fn(),
  onCancelAction: vi.fn(),
  onCancelAll: vi.fn(),
}

const previewProps = {
  previewData: {
    changes: [{ band_id: 1, band_name: 'ALL', from_venue: 'Blue Room', to_venue: 'Room 47' }],
    conflicts: [],
  },
  isProcessing: false,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
}

describe('BulkActionBar accessible names', () => {
  // These controls mutate MANY records at once, so an unlabelled one is not a
  // nicety: a screen-reader user cannot tell which bulk action they are about
  // to apply. Querying by accessible name is what proves the name exists —
  // getByRole('combobox') alone would pass with no label at all.
  it('names the bulk-action selector', () => {
    render(<BulkActionBar {...barProps} />)
    expect(screen.getByRole('combobox', { name: /bulk action/i })).toBeInTheDocument()
  })

  it('names the venue selector when moving venues', () => {
    render(<BulkActionBar {...barProps} action="move_venue" />)
    expect(screen.getByRole('combobox', { name: /venue to move/i })).toBeInTheDocument()
  })

  it('names the start-time input when changing times', () => {
    render(<BulkActionBar {...barProps} action="change_time" />)
    expect(screen.getByLabelText(/new start time/i)).toBeInTheDocument()
  })

  it('has no axe violations in either action state', async () => {
    const { container, rerender } = render(<BulkActionBar {...barProps} />)
    expect(await axe(container)).toHaveNoViolations()
    rerender(<BulkActionBar {...barProps} action="move_venue" />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('BulkPreviewModal dialog semantics', () => {
  it('exposes a labelled dialog', () => {
    render(<BulkPreviewModal {...previewProps} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByText('Preview Changes')).toBeInTheDocument()
  })

  // Escape is the behaviour a hand-rolled overlay silently lacks: nothing
  // errors, the key simply does nothing and a keyboard user is stuck.
  it('closes on Escape', () => {
    const onCancel = vi.fn()
    render(<BulkPreviewModal {...previewProps} onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('does not close on Escape while a bulk write is in flight', () => {
    const onCancel = vi.fn()
    render(<BulkPreviewModal {...previewProps} isProcessing onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  // Modal's close button is enabled by default. With a no-op onClose during a
  // bulk write it would be a focusable control that does nothing — worse than
  // absent, because it invites the click that will not work.
  it('hides the close button while a bulk write is in flight', () => {
    const { rerender } = render(<BulkPreviewModal {...previewProps} />)
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()

    rerender(<BulkPreviewModal {...previewProps} isProcessing />)
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument()
  })

  // Modal restores focus in the else-branch of its isOpen effect, which a
  // consumer that UNMOUNTS never reaches. BulkPreviewModal hardcodes isOpen and
  // LineupTab drops it when the preview clears, so without an unmount cleanup
  // focus was left on a removed node or on document.body.
  it('returns focus to the trigger when it is unmounted rather than closed', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Preview Changes'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const { unmount } = render(<BulkPreviewModal {...previewProps} />)
    await new Promise(r => requestAnimationFrame(r))
    expect(document.activeElement).not.toBe(trigger)

    unmount()

    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('still renders the confirm and cancel actions', () => {
    render(<BulkPreviewModal {...previewProps} />)
    expect(screen.getByRole('button', { name: /apply changes/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
  })

  it('offers the override action when there are exact conflicts', () => {
    render(
      <BulkPreviewModal
        {...previewProps}
        previewData={{ ...previewProps.previewData, conflicts: [{ type: 'conflict', message: 'clash' }] }}
      />
    )
    expect(screen.getByRole('button', { name: /apply anyway/i })).toBeInTheDocument()
  })
})

describe('BottomNav', () => {
  const navProps = { activeTab: 'events', onTabChange: vi.fn(), showUsers: true, showPlatform: true }

  // Each button already gets its name from the visible label, so an exposed
  // icon is announced twice. aria-hidden is the only thing that suppresses it.
  // Asserted across EVERY icon rather than one, so a new nav item cannot slip
  // through unhidden.
  it('hides every decorative tab icon from assistive technology', () => {
    const { container } = render(<BottomNav {...navProps} />)
    const icons = [...container.querySelectorAll('nav button svg')]

    expect(icons.length).toBeGreaterThan(3)
    for (const icon of icons) {
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('still names each tab button from its label', () => {
    render(<BottomNav {...navProps} />)
    expect(screen.getByRole('button', { name: /events/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /venues/i })).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = render(<BottomNav {...navProps} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
