import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StepUpModal from '../StepUpModal'

let prompter = null
vi.mock('../../../utils/adminApi', () => ({
  mfaApi: { stepUp: vi.fn() },
  registerStepUpPrompter: vi.fn(fn => {
    prompter = fn
    return () => {
      if (prompter === fn) prompter = null
    }
  }),
}))
import { mfaApi } from '../../../utils/adminApi'

// Raise the prompt the way adminApi does when a request meets STEP_UP_REQUIRED.
function raisePrompt() {
  let outcome
  act(() => {
    outcome = prompter()
  })
  return outcome
}

describe('StepUpModal (#1324)', () => {
  beforeEach(() => {
    mfaApi.stepUp.mockReset()
  })
  afterEach(() => {
    prompter = null
  })

  it('renders nothing until a request needs step-up', () => {
    render(<StepUpModal />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens an accessible dialog with the code input focused', async () => {
    render(<StepUpModal />)
    raisePrompt()
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title')
    const input = within(dialog).getByLabelText('Authentication code')
    await waitFor(() => expect(input).toHaveFocus())
  })

  it('resolves true and closes after a correct code', async () => {
    mfaApi.stepUp.mockResolvedValue({ success: true })
    render(<StepUpModal />)
    const outcome = raisePrompt()
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Authentication code'), { target: { value: ' 123456 ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    await expect(outcome).resolves.toBe(true)
    expect(mfaApi.stepUp).toHaveBeenCalledWith('123456')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('a wrong code shows an error inside the dialog and keeps it open and unresolved', async () => {
    mfaApi.stepUp.mockRejectedValue(new Error('Invalid authentication code'))
    render(<StepUpModal />)
    const outcome = raisePrompt()
    const settled = vi.fn()
    outcome.then(settled)
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Authentication code'), { target: { value: '000000' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    expect(await within(dialog).findByText('Invalid authentication code')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
  })

  it('Cancel resolves false and closes', async () => {
    render(<StepUpModal />)
    const outcome = raisePrompt()
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await expect(outcome).resolves.toBe(false)
    expect(mfaApi.stepUp).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('Confirm is disabled until a code is typed', async () => {
    render(<StepUpModal />)
    raisePrompt()
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('unmounting while a request waits resolves it false', async () => {
    const { unmount } = render(<StepUpModal />)
    const outcome = raisePrompt()
    await screen.findByRole('dialog')
    unmount()
    await expect(outcome).resolves.toBe(false)
  })
})
