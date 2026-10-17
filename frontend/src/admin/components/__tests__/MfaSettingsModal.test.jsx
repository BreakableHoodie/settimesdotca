import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'
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
})
