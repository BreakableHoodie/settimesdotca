import { act, fireEvent, render, screen } from '@testing-library/react'
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

  // The failure message was sr-only once, so a SIGHTED admin got no feedback at
  // all — the exact silence this fix exists to remove. getByText finds sr-only
  // nodes and Tailwind's sr-only (1px + clip) still reads as visible to jsdom,
  // so neither queries nor toBeVisible catch a regression here. Asserting the
  // class is absent is the only check that goes red if it is re-hidden.
  it('shows the failure to sighted users, not only to screen readers', async () => {
    copyToClipboard.mockResolvedValue(false)
    render(<UserFormModal {...props} />)
    clickCopy()

    const status = (await screen.findByText(/could not copy/i)).closest('p')
    expect(status).not.toHaveClass('sr-only')
    expect(status).toHaveAttribute('aria-live', 'polite')
  })

  // The parent renders this modal unconditionally, so closing it does not
  // unmount and state persists. Without a reset the previous invite's result is
  // still on screen when the next one opens.
  it('clears the previous result when a new invite arrives', async () => {
    copyToClipboard.mockResolvedValue(true)
    const { rerender } = render(<UserFormModal {...props} />)
    clickCopy()
    expect(await screen.findByText(/invite link copied/i)).toBeInTheDocument()

    rerender(<UserFormModal {...props} inviteUrl="https://settimes.ca/admin/signup?code=different" />)

    expect(screen.queryByText(/invite link copied/i)).not.toBeInTheDocument()
  })

  it('clears the previous result when the modal is closed and reopened', async () => {
    copyToClipboard.mockResolvedValue(true)
    const { rerender } = render(<UserFormModal {...props} />)
    clickCopy()
    expect(await screen.findByText(/invite link copied/i)).toBeInTheDocument()

    rerender(<UserFormModal {...props} isOpen={false} />)
    rerender(<UserFormModal {...props} isOpen={true} />)

    expect(screen.queryByText(/invite link copied/i)).not.toBeInTheDocument()
  })

  // The reset effect alone does not close this: copyToClipboard is async, so a
  // copy still in flight when the invite changes settles AFTERWARDS and would
  // write its result over the reset — attributing the old link's success to the
  // new one. The attempt token is what makes a superseded result inert.
  it('ignores an in-flight copy that settles after the invite changed', async () => {
    let settle
    copyToClipboard.mockReturnValue(
      new Promise(resolve => {
        settle = resolve
      })
    )

    const { rerender } = render(<UserFormModal {...props} />)
    clickCopy()

    // The invite changes while the copy is still pending.
    rerender(<UserFormModal {...props} inviteUrl="https://settimes.ca/admin/signup?code=newer" />)

    // Now the OLD copy succeeds.
    await act(async () => {
      settle(true)
    })

    expect(screen.queryByText(/invite link copied/i)).not.toBeInTheDocument()
  })

  it('announces failure when the helper rejects outright', async () => {
    copyToClipboard.mockRejectedValue(new Error('denied'))
    render(<UserFormModal {...props} />)
    clickCopy()
    expect(await screen.findByText(/could not copy/i)).toBeInTheDocument()
  })
})
