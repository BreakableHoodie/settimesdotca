import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserFormModal from '../UserFormModal'
import { copyToClipboard } from '../../../utils/clipboard'

vi.mock('../../../utils/clipboard', () => ({ copyToClipboard: vi.fn() }))

const props = {
  isOpen: true,
  onClose: vi.fn(),
  user: null,
  onSave: vi.fn(),
  loading: false,
  inviteUrl: 'https://settimes.ca/admin/signup?code=abc123',
}

const clickCopy = () => fireEvent.click(screen.getByRole('button', { name: /copy link/i }))

describe('UserFormModal invite-link copy', () => {
  beforeEach(() => vi.clearAllMocks())

  it('copies through the shared helper rather than the raw clipboard API', () => {
    render(<UserFormModal {...props} />)
    clickCopy()
    expect(copyToClipboard).toHaveBeenCalledWith(props.inviteUrl)
  })

  it('announces success when the copy works', async () => {
    copyToClipboard.mockResolvedValue(true)
    render(<UserFormModal {...props} />)
    clickCopy()
    expect(await screen.findByText(/invite link copied/i)).toBeInTheDocument()
  })

  // The invite link is the only way a new user can activate, so an admin who
  // believes it is on the clipboard when it is not sends nothing and never finds
  // out. Before this fix the click was fire-and-forget with no feedback at all.
  it('announces failure instead of staying silent when the copy fails', async () => {
    copyToClipboard.mockResolvedValue(false)
    render(<UserFormModal {...props} />)
    clickCopy()
    expect(await screen.findByText(/could not copy/i)).toBeInTheDocument()
  })

  it('announces failure when the helper rejects outright', async () => {
    copyToClipboard.mockRejectedValue(new Error('denied'))
    render(<UserFormModal {...props} />)
    clickCopy()
    expect(await screen.findByText(/could not copy/i)).toBeInTheDocument()
  })
})
