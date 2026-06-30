import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import DownloadPdfButton from '../DownloadPdfButton'

// Hoist mock references so they are available inside the vi.mock() factory,
// which is hoisted to the top of the module by Vitest before any imports.
const { mockSave, mockSplitTextToSize } = vi.hoisted(() => ({
  mockSave: vi.fn(),
  mockSplitTextToSize: vi.fn(text => [text]),
}))

vi.mock('jspdf', () => ({
  // Must use a regular constructor function (not an arrow function) so that
  // `new jsPDF()` works correctly in Vitest 4.x — arrow functions can't be
  // called as constructors and the vi.fn() wrapper does not override that.
  jsPDF: vi.fn(function () {
    this.save = mockSave
    this.text = vi.fn()
    this.setFont = vi.fn()
    this.setFontSize = vi.fn()
    this.addPage = vi.fn()
    this.splitTextToSize = mockSplitTextToSize
  }),
}))

describe('DownloadPdfButton', () => {
  afterEach(() => {
    vi.clearAllMocks()
    // Remove any .legal-document nodes injected for individual tests
    document.querySelectorAll('.legal-document').forEach(el => el.remove())
  })

  function injectLegalDocument(titleContains = 'Terms') {
    document.title = titleContains.includes('Privacy') ? 'Privacy Policy | SetTimes' : 'Terms of Service | SetTimes'
    const div = document.createElement('div')
    div.className = 'legal-document'
    const h1 = document.createElement('h1')
    h1.textContent = titleContains.includes('Privacy') ? 'Privacy Policy' : 'Terms of Service'
    div.appendChild(h1)
    document.body.appendChild(div)
    return div
  }

  it('renders a Download PDF button', () => {
    render(<DownloadPdfButton />)
    expect(screen.getByRole('button', { name: /download this page as a pdf/i })).toBeInTheDocument()
    expect(screen.getByText('Download PDF')).toBeInTheDocument()
  })

  it('is marked no-print so it never appears in the generated PDF', () => {
    render(<DownloadPdfButton />)
    expect(screen.getByRole('button')).toHaveClass('no-print')
  })

  it('calls doc.save() with a .pdf filename when clicked', async () => {
    injectLegalDocument('Terms')
    render(<DownloadPdfButton />)
    fireEvent.click(screen.getByRole('button', { name: /download this page as a pdf/i }))
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledTimes(1)
      expect(mockSave).toHaveBeenCalledWith(expect.stringMatching(/\.pdf$/))
    })
  })

  it('uses the privacy filename when document.title contains "Privacy"', async () => {
    injectLegalDocument('Privacy')
    render(<DownloadPdfButton />)
    fireEvent.click(screen.getByRole('button', { name: /download this page as a pdf/i }))
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith('settimes-privacy-policy.pdf')
    })
  })

  it('uses the terms filename when document.title contains "Terms"', async () => {
    injectLegalDocument('Terms')
    render(<DownloadPdfButton />)
    fireEvent.click(screen.getByRole('button', { name: /download this page as a pdf/i }))
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith('settimes-terms-of-service.pdf')
    })
  })

  it('does NOT call window.print()', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    injectLegalDocument('Terms')
    render(<DownloadPdfButton />)
    fireEvent.click(screen.getByRole('button', { name: /download this page as a pdf/i }))
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledTimes(1)
    })
    expect(printSpy).not.toHaveBeenCalled()
  })

  it('disables the button while generating and re-enables after', async () => {
    injectLegalDocument('Terms')
    render(<DownloadPdfButton />)
    const btn = screen.getByRole('button', { name: /download this page as a pdf/i })
    fireEvent.click(btn)
    // Immediately after click the button should be disabled
    expect(btn).toBeDisabled()
    // After the async generation completes it should be enabled again
    await waitFor(() => {
      expect(btn).not.toBeDisabled()
    })
  })
})
