import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserManagement from '../UserManagement'
import { usersApi } from '../../utils/adminApi'

vi.mock('../../utils/adminApi', () => ({
  usersApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    resetPassword: vi.fn(),
    resetMfa: vi.fn(),
  },
}))

const users = [
  { id: 1, email: 'dre@settimes.ca', name: 'Dre', role: 'admin', isActive: true },
  { id: 2, email: 'jay@settimes.ca', name: 'Jay', role: 'editor', isActive: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  usersApi.getAll.mockResolvedValue({ users })
  usersApi.resetMfa.mockResolvedValue({ success: true })
})

// #1253: an admin recovers a colleague's lost authenticator from this screen.
describe('UserManagement: reset 2FA', () => {
  it('resets 2FA for the chosen user only after confirmation', async () => {
    const showToast = vi.fn()
    render(<UserManagement showToast={showToast} />)

    fireEvent.click(await screen.findByLabelText('Reset two-factor authentication for jay@settimes.ca'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/sign(ed)? out everywhere/i)).toBeInTheDocument()
    expect(usersApi.resetMfa).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset 2FA' }))
    await waitFor(() => expect(usersApi.resetMfa).toHaveBeenCalledWith(2))
    expect(showToast).toHaveBeenCalledWith('Two-factor authentication reset for jay@settimes.ca', 'success')
  })

  it('does nothing when cancelled', async () => {
    render(<UserManagement showToast={vi.fn()} />)
    fireEvent.click(await screen.findByLabelText('Reset two-factor authentication for jay@settimes.ca'))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(usersApi.resetMfa).not.toHaveBeenCalled()
  })

  it("shows the server's refusal, e.g. resetting your own 2FA", async () => {
    usersApi.resetMfa.mockRejectedValue(new Error('Cannot reset your own two-factor authentication'))
    const showToast = vi.fn()
    render(<UserManagement showToast={showToast} />)
    fireEvent.click(await screen.findByLabelText('Reset two-factor authentication for dre@settimes.ca'))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reset 2FA' }))
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Cannot reset your own two-factor authentication', 'error')
    )
  })
})

// Invite lifecycle: a pending invitee can be revoked from the roster.
describe('UserManagement: invite states and revoke', () => {
  const roster = [
    { id: 1, email: 'dre@settimes.ca', name: 'Dre', role: 'admin', isActive: true, activatedAt: '2026-01-01' },
    {
      id: 3,
      email: 'pending@settimes.ca',
      name: 'Pending',
      role: 'viewer',
      isActive: false,
      activatedAt: null,
      deactivatedAt: null,
    },
    {
      id: 4,
      email: 'revoked@settimes.ca',
      name: 'Revoked',
      role: 'viewer',
      isActive: false,
      activatedAt: null,
      deactivatedAt: '2026-11-01 10:00:00',
    },
    {
      id: 5,
      email: 'gone@settimes.ca',
      name: 'Gone',
      role: 'editor',
      isActive: false,
      activatedAt: '2026-02-01',
      deactivatedAt: '2026-10-01 10:00:00',
    },
  ]
  const rowFor = email => screen.getAllByRole('row').find(r => within(r).queryByText(email))

  beforeEach(() => {
    usersApi.getAll.mockResolvedValue({ users: roster })
    usersApi.update.mockResolvedValue({ success: true })
  })

  it('labels each state and offers the right actions', async () => {
    render(<UserManagement showToast={vi.fn()} />)
    await screen.findAllByText('pending@settimes.ca')

    const pending = rowFor('pending@settimes.ca')
    expect(within(pending).getByText('Invited (pending)')).toBeInTheDocument()
    expect(within(pending).getByLabelText('Revoke invite for pending@settimes.ca')).toBeInTheDocument()
    expect(within(pending).getByLabelText('Activate pending@settimes.ca')).toBeInTheDocument()

    const revoked = rowFor('revoked@settimes.ca')
    expect(within(revoked).getByText('Invite revoked')).toBeInTheDocument()
    expect(within(revoked).queryByLabelText(/Revoke invite/)).toBeNull()
    expect(within(revoked).queryByLabelText(/Restore/)).toBeNull()

    const gone = rowFor('gone@settimes.ca')
    expect(within(gone).getByText('Inactive')).toBeInTheDocument()
    expect(within(gone).queryByLabelText(/Revoke invite/)).toBeNull()
    expect(within(gone).getByLabelText('Activate gone@settimes.ca')).toBeInTheDocument()

    const active = rowFor('dre@settimes.ca')
    expect(within(active).getByText('Active')).toBeInTheDocument()
    expect(within(active).queryByLabelText(/Revoke invite/)).toBeNull()
  })

  // The server sets activatedAt/deactivatedAt on a toggle; the row must show the
  // server's state, not a locally flipped isActive (CodeRabbit, #1506).
  it('reloads after a status toggle so the row shows the state the server recorded', async () => {
    render(<UserManagement showToast={vi.fn()} />)
    await screen.findAllByText('pending@settimes.ca')
    usersApi.getAll.mockResolvedValue({
      users: roster.map(u =>
        u.id === 3 ? { ...u, isActive: true, activatedAt: '2026-11-25 12:00:00', deactivatedAt: null } : u
      ),
    })

    fireEvent.click(within(rowFor('pending@settimes.ca')).getByLabelText('Activate pending@settimes.ca'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Activate' }))

    await waitFor(() => expect(within(rowFor('pending@settimes.ca')).getByText('Active')).toBeInTheDocument())
    expect(within(rowFor('pending@settimes.ca')).queryByLabelText(/Revoke invite/)).toBeNull()
    expect(usersApi.getAll.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('revokes only after confirmation, sending isActive: false', async () => {
    const showToast = vi.fn()
    render(<UserManagement showToast={showToast} />)
    await screen.findAllByText('pending@settimes.ca')

    fireEvent.click(within(rowFor('pending@settimes.ca')).getByLabelText('Revoke invite for pending@settimes.ca'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/invite link will stop working/i)).toBeInTheDocument()
    expect(usersApi.update).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke invite' }))
    await waitFor(() => expect(usersApi.update).toHaveBeenCalledWith(3, { isActive: false }))
    expect(showToast).toHaveBeenCalledWith('Invite revoked for pending@settimes.ca', 'success')
  })

  it('sends nothing when the revoke is cancelled', async () => {
    render(<UserManagement showToast={vi.fn()} />)
    await screen.findAllByText('pending@settimes.ca')
    fireEvent.click(within(rowFor('pending@settimes.ca')).getByLabelText('Revoke invite for pending@settimes.ca'))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(usersApi.update).not.toHaveBeenCalled()
  })
})
