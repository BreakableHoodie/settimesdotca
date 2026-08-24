import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import BulkActionBar from '../components/BulkActionBar'

const venues = [
  { id: 1, name: 'Stage A' },
  { id: 2, name: 'Stage B' },
]

const defaultProps = {
  count: 3,
  action: null,
  params: {},
  venues,
  onActionChange: vi.fn(),
  onParamsChange: vi.fn(),
  onSubmit: vi.fn(),
  onCancelAction: vi.fn(),
  onCancelAll: vi.fn(),
  isGlobalView: false,
  isLoading: false,
}

describe('BulkActionBar — Bug 2: bulk action flow', () => {
  it('shows selection count using "performances" terminology', () => {
    render(<BulkActionBar {...defaultProps} count={5} />)
    expect(screen.getByText('5 performances selected')).toBeInTheDocument()
  })

  it('shows More actions dropdown and Cancel button when no action selected', () => {
    render(<BulkActionBar {...defaultProps} action={null} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('calls onCancelAll when Cancel is clicked (no action)', () => {
    const onCancelAll = vi.fn()
    render(<BulkActionBar {...defaultProps} action={null} onCancelAll={onCancelAll} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancelAll).toHaveBeenCalled()
  })

  it('calls onActionChange when a dropdown option is selected', () => {
    const onActionChange = vi.fn()
    render(<BulkActionBar {...defaultProps} onActionChange={onActionChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'move_venue' } })
    expect(onActionChange).toHaveBeenCalledWith('move_venue')
  })

  it('shows venue select when action is move_venue', () => {
    render(<BulkActionBar {...defaultProps} action="move_venue" />)
    const selects = screen.getAllByRole('combobox')
    // The venue select should be present
    expect(selects.some(s => s.textContent.includes('Stage A'))).toBe(true)
  })

  it('shows Preview Changes button when move_venue and venue selected', () => {
    render(<BulkActionBar {...defaultProps} action="move_venue" params={{ venue_id: 1 }} />)
    expect(screen.getByRole('button', { name: /preview changes/i })).toBeInTheDocument()
  })

  it('disables Preview Changes button when move_venue but no venue chosen', () => {
    render(<BulkActionBar {...defaultProps} action="move_venue" params={{}} />)
    const previewBtn = screen.getByRole('button', { name: /preview changes/i })
    expect(previewBtn).toBeDisabled()
  })

  it('enables Preview Changes button when venue is selected', () => {
    render(<BulkActionBar {...defaultProps} action="move_venue" params={{ venue_id: 1 }} />)
    const previewBtn = screen.getByRole('button', { name: /preview changes/i })
    expect(previewBtn).not.toBeDisabled()
  })

  it('calls onSubmit when Preview Changes is clicked', () => {
    const onSubmit = vi.fn()
    render(<BulkActionBar {...defaultProps} action="move_venue" params={{ venue_id: 1 }} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /preview changes/i }))
    expect(onSubmit).toHaveBeenCalled()
  })

  it('onParamsChange is called with venue_id shape when a venue is selected (T9)', () => {
    const onParamsChange = vi.fn()
    render(<BulkActionBar {...defaultProps} action="move_venue" params={{}} onParamsChange={onParamsChange} />)
    const venueSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(venueSelect, { target: { value: '1' } })
    expect(onParamsChange).toHaveBeenCalledWith(expect.objectContaining({ venue_id: expect.anything() }))
  })

  it('shows delete warning using "performances" terminology (T9/P3-Q7)', () => {
    render(<BulkActionBar {...defaultProps} action="delete" count={2} />)
    expect(screen.getByText(/permanently delete 2 performances/i)).toBeInTheDocument()
  })

  it('shows Back button when action is active (not Cancel)', () => {
    render(<BulkActionBar {...defaultProps} action="move_venue" />)
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^cancel$/i })).not.toBeInTheDocument()
  })

  it('calls onCancelAction when Back is clicked', () => {
    const onCancelAction = vi.fn()
    render(<BulkActionBar {...defaultProps} action="move_venue" onCancelAction={onCancelAction} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onCancelAction).toHaveBeenCalled()
  })

  it('shows time input when action is change_time', () => {
    render(<BulkActionBar {...defaultProps} action="change_time" />)
    expect(screen.getByRole('button', { name: /preview changes/i })).toBeInTheDocument()
    expect(document.querySelector('input[type="time"]')).toBeInTheDocument()
  })

  it('disables buttons and shows Loading when isLoading=true', () => {
    render(<BulkActionBar {...defaultProps} action="move_venue" params={{ venue_id: 1 }} isLoading={true} />)
    expect(screen.getByRole('button', { name: /loading/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled()
  })

  it('shows delete warning when action is delete', () => {
    render(<BulkActionBar {...defaultProps} action="delete" />)
    expect(screen.getByText(/permanently delete/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument()
  })
})
