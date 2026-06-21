import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ShareButton from '../ShareButton.jsx'
import { copyToClipboard } from '../../utils/clipboard'

vi.mock('../../utils/clipboard', () => ({ copyToClipboard: vi.fn() }))

afterEach(() => {
  vi.clearAllMocks()
  delete navigator.share
})

describe('ShareButton', () => {
  it('uses the native share sheet when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    navigator.share = share

    render(
      <ShareButton url="https://settimes.ca/band/the-band" title="The Band" text="Check out The Band on SetTimes" />
    )
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(share).toHaveBeenCalledWith({
        title: 'The Band',
        text: 'Check out The Band on SetTimes',
        url: 'https://settimes.ca/band/the-band',
      })
    })
    expect(copyToClipboard).not.toHaveBeenCalled()
  })

  it('falls back to copying the link when native share is unavailable', async () => {
    delete navigator.share
    copyToClipboard.mockResolvedValue(true)

    render(<ShareButton url="https://settimes.ca/band/the-band" title="The Band" />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith('https://settimes.ca/band/the-band')
    })
    expect(await screen.findByText('Copied!')).toBeInTheDocument()
  })

  it('does not copy when the user cancels the native share sheet', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    navigator.share = vi.fn().mockRejectedValue(abort)

    render(<ShareButton url="https://settimes.ca/band/the-band" title="The Band" />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(navigator.share).toHaveBeenCalled()
    })
    expect(copyToClipboard).not.toHaveBeenCalled()
  })
})
