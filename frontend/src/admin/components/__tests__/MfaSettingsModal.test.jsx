import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MfaSettingsModal from '../MfaSettingsModal'
import { mfaApi } from '../../../utils/adminApi'

vi.mock('../../../utils/adminApi', () => ({
  mfaApi: { status: vi.fn(), setup: vi.fn(), enable: vi.fn(), disable: vi.fn(), regenerateBackupCodes: vi.fn() },
}))

// #1253: in required mode the modal cannot be dismissed, so it must always
// offer a way out.
describe('MfaSettingsModal required mode', () => {
  it('offers Log out even while the status request never returns', () => {
    mfaApi.status.mockReturnValue(new Promise(() => {}))
    const onLogout = vi.fn()
    render(<MfaSettingsModal isOpen required canDisable={false} onClose={vi.fn()} onLogout={onLogout} />)
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument()
  })

  it('does not offer Log out outside required mode', () => {
    mfaApi.status.mockReturnValue(new Promise(() => {}))
    render(<MfaSettingsModal isOpen onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
  })

  it('hides the disable control when the role cannot disable', async () => {
    mfaApi.status.mockResolvedValue({ totpEnabled: true })
    render(<MfaSettingsModal isOpen canDisable={false} onClose={vi.fn()} />)
    expect(await screen.findByText('Admins and editors keep two-factor authentication on.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Disable MFA' })).not.toBeInTheDocument()
  })

  // A wrong code is a 400 now (a 401 would sign the user out); the modal must
  // still show the server's message (#1324).
  it('shows the wrong-code message and stays open', async () => {
    mfaApi.status.mockResolvedValue({ totpEnabled: true })
    mfaApi.disable.mockRejectedValue(Object.assign(new Error('Invalid authentication code'), { status: 400 }))
    render(<MfaSettingsModal isOpen onClose={vi.fn()} />)
    const input = await screen.findByLabelText('Authenticator code', { selector: '#mfa-verify-backup' })
    fireEvent.change(input, { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Disable MFA' }))
    expect(await screen.findByText('Invalid authentication code')).toBeInTheDocument()
  })
})

// #1318: an enrolled user moves to a new authenticator app themselves. Queries
// are scoped to the dialog so a collision with page content cannot satisfy them.
describe('MfaSettingsModal: move to a new authenticator app', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mfaApi.status.mockResolvedValue({ totpEnabled: true })
  })

  const openDialog = async () => {
    render(<MfaSettingsModal isOpen canDisable={false} onClose={vi.fn()} />)
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('button', { name: 'Move to a new authenticator app' })
    return within(dialog)
  }

  it('asks for the current code, then the new QR, then the new app code, and shows new backup codes once', async () => {
    mfaApi.setup.mockResolvedValue({ secret: 'NEWSECRET', otpauthUrl: 'otpauth://totp/x?secret=NEWSECRET' })
    mfaApi.enable.mockResolvedValue({ success: true, backupCodes: ['AAAAA-11111', 'BBBBB-22222'] })
    const dialog = await openDialog()

    fireEvent.click(dialog.getByRole('button', { name: 'Move to a new authenticator app' }))
    expect(dialog.getByRole('button', { name: 'Continue' })).toBeDisabled()
    fireEvent.change(dialog.getByLabelText('Current authenticator or backup code'), { target: { value: '123456' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(mfaApi.setup).toHaveBeenCalledWith('123456'))
    expect(await dialog.findByText('NEWSECRET')).toBeInTheDocument()
    expect(mfaApi.enable).not.toHaveBeenCalled()

    fireEvent.change(dialog.getByLabelText('Code from the new authenticator app'), { target: { value: '654321' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Confirm new app' }))

    await waitFor(() => expect(mfaApi.enable).toHaveBeenCalledWith('654321'))
    expect(await dialog.findByText('AAAAA-11111')).toBeInTheDocument()
    expect(dialog.getByText('BBBBB-22222')).toBeInTheDocument()
    // Back at the start: the QR for the finished flow is gone.
    expect(dialog.queryByText('NEWSECRET')).not.toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Move to a new authenticator app' })).toBeInTheDocument()
  })

  it('shows the server message for a wrong current code and does not advance to the QR', async () => {
    mfaApi.setup.mockRejectedValue(Object.assign(new Error('Invalid authentication code'), { status: 400 }))
    const dialog = await openDialog()
    fireEvent.click(dialog.getByRole('button', { name: 'Move to a new authenticator app' }))
    fireEvent.change(dialog.getByLabelText('Current authenticator or backup code'), { target: { value: '000000' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Continue' }))

    expect(await dialog.findByText('Invalid authentication code')).toBeInTheDocument()
    expect(dialog.queryByLabelText('Code from the new authenticator app')).not.toBeInTheDocument()
    expect(dialog.getByLabelText('Current authenticator or backup code')).toBeInTheDocument()
  })

  it('shows the already-used message when the step was spent', async () => {
    const message = 'This code was just used. Wait for the next code from your authenticator app.'
    mfaApi.setup.mockRejectedValue(
      Object.assign(new Error(message), { status: 400, details: { code: 'TOTP_CODE_ALREADY_USED' } })
    )
    const dialog = await openDialog()
    fireEvent.click(dialog.getByRole('button', { name: 'Move to a new authenticator app' }))
    fireEvent.change(dialog.getByLabelText('Current authenticator or backup code'), { target: { value: '123456' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Continue' }))
    expect(await dialog.findByText(message)).toBeInTheDocument()
  })

  it('starts over when the setup changed underneath the confirm (MFA_SETUP_CHANGED)', async () => {
    mfaApi.setup.mockResolvedValue({ secret: 'NEWSECRET', otpauthUrl: 'otpauth://totp/x?secret=NEWSECRET' })
    mfaApi.enable.mockRejectedValue(
      Object.assign(new Error('Two-factor setup changed while this request was running.'), {
        status: 409,
        details: { code: 'MFA_SETUP_CHANGED' },
      })
    )
    const dialog = await openDialog()
    fireEvent.click(dialog.getByRole('button', { name: 'Move to a new authenticator app' }))
    fireEvent.change(dialog.getByLabelText('Current authenticator or backup code'), { target: { value: '123456' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Continue' }))
    fireEvent.change(await dialog.findByLabelText('Code from the new authenticator app'), {
      target: { value: '654321' },
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Confirm new app' }))

    expect(await dialog.findByText(/changed while this request was running/)).toBeInTheDocument()
    expect(dialog.queryByText('NEWSECRET')).not.toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Move to a new authenticator app' })).toBeInTheDocument()
  })

  it('Cancel discards the flow without confirming anything', async () => {
    mfaApi.setup.mockResolvedValue({ secret: 'NEWSECRET', otpauthUrl: 'otpauth://totp/x?secret=NEWSECRET' })
    const dialog = await openDialog()
    fireEvent.click(dialog.getByRole('button', { name: 'Move to a new authenticator app' }))
    fireEvent.change(dialog.getByLabelText('Current authenticator or backup code'), { target: { value: '123456' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Continue' }))
    await dialog.findByText('NEWSECRET')
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(dialog.queryByText('NEWSECRET')).not.toBeInTheDocument()
    expect(mfaApi.enable).not.toHaveBeenCalled()
  })
})
