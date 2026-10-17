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
