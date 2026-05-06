import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import BulkPreviewModal from '../BulkPreviewModal'

const makePreview = ({ conflicts = [], changes = [] } = {}) => ({
  changes: changes.length
    ? changes
    : [{ band_id: 1, band_name: 'Test Band', action: 'move_venue', from_venue: 'Stage A', to_venue: 'Stage B' }],
  conflicts,
})

const defaultProps = {
  isProcessing: false,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
}

describe('BulkPreviewModal — overlap vs conflict UX', () => {
  it('shows "Apply Changes" primary button when there are no conflicts', () => {
    render(<BulkPreviewModal {...defaultProps} previewData={makePreview()} />)
    expect(screen.getByRole('button', { name: /apply changes/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /apply anyway/i })).not.toBeInTheDocument()
  })

  it('shows "Apply Changes" primary button when there are only overlaps (not exact conflicts)', () => {
    const preview = makePreview({
      conflicts: [{ type: 'overlap', message: 'Band A overlaps Band B by 30 minutes' }],
    })
    render(<BulkPreviewModal {...defaultProps} previewData={preview} />)
    // Overlaps are warnings — should still allow a normal "Apply Changes" path
    expect(screen.getByRole('button', { name: /apply changes/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /apply anyway/i })).not.toBeInTheDocument()
  })

  it('shows "Apply Anyway" danger button when there are exact conflicts', () => {
    const preview = makePreview({
      conflicts: [{ type: 'conflict', message: 'Band A has an exact time conflict with Band B' }],
    })
    render(<BulkPreviewModal {...defaultProps} previewData={preview} />)
    expect(screen.getByRole('button', { name: /apply anyway/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^apply changes$/i })).not.toBeInTheDocument()
  })

  it('shows "Apply Anyway" danger button when there are both overlaps and exact conflicts', () => {
    const preview = makePreview({
      conflicts: [
        { type: 'overlap', message: 'Band A overlaps Band B' },
        { type: 'conflict', message: 'Band C exact conflict with Band D' },
      ],
    })
    render(<BulkPreviewModal {...defaultProps} previewData={preview} />)
    expect(screen.getByRole('button', { name: /apply anyway/i })).toBeInTheDocument()
  })

  it('passes ignoreConflicts=false when "Apply Changes" clicked with only overlaps', () => {
    const onConfirm = vi.fn()
    const preview = makePreview({
      conflicts: [{ type: 'overlap', message: 'Overlap warning' }],
    })
    render(<BulkPreviewModal {...defaultProps} previewData={preview} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: /apply changes/i }))
    expect(onConfirm).toHaveBeenCalledWith(false)
  })

  it('passes ignoreConflicts=true when "Apply Anyway" clicked with exact conflicts', () => {
    const onConfirm = vi.fn()
    const preview = makePreview({
      conflicts: [{ type: 'conflict', message: 'Exact conflict' }],
    })
    render(<BulkPreviewModal {...defaultProps} previewData={preview} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: /apply anyway/i }))
    expect(onConfirm).toHaveBeenCalledWith(true)
  })
})
