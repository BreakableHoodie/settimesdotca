import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import DownloadPdfButton from '../DownloadPdfButton'

describe('DownloadPdfButton', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a Download PDF button', () => {
    render(<DownloadPdfButton />)
    expect(screen.getByRole('button', { name: /download this page as a pdf/i })).toBeInTheDocument()
    expect(screen.getByText('Download PDF')).toBeInTheDocument()
  })

  it('calls window.print() when clicked', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<DownloadPdfButton />)
    fireEvent.click(screen.getByRole('button', { name: /download this page as a pdf/i }))
    expect(printSpy).toHaveBeenCalledTimes(1)
  })

  it('is marked no-print so it never appears in the saved PDF', () => {
    render(<DownloadPdfButton />)
    expect(screen.getByRole('button')).toHaveClass('no-print')
  })
})
