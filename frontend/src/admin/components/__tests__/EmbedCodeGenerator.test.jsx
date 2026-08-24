import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EmbedCodeGenerator, { escapeHtmlAttribute } from '../EmbedCodeGenerator'
import { copyToClipboard } from '../../../utils/clipboard'

// Mock the shared helper rather than navigator.clipboard: the component's
// contract is with copyToClipboard (which reports false instead of throwing and
// has its own execCommand fallback). Mocking the browser API would test the
// helper's internals through the component.
vi.mock('../../../utils/clipboard', () => ({ copyToClipboard: vi.fn() }))

const EVENT = { slug: 'lwbc18', name: 'Long Weekend Band Crawl Vol. 18' }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('escapeHtmlAttribute', () => {
  // & must be replaced first or the entities added afterwards get double-escaped.
  it('escapes & before the entities that contain it', () => {
    expect(escapeHtmlAttribute('Rock & "Roll"')).toBe('Rock &amp; &quot;Roll&quot;')
  })

  it.each([
    ['"', '&quot;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['&', '&amp;'],
  ])('escapes %s', (raw, escaped) => {
    expect(escapeHtmlAttribute(raw)).toBe(escaped)
  })

  it('renders null and undefined as empty rather than the literal words', () => {
    expect(escapeHtmlAttribute(null)).toBe('')
    expect(escapeHtmlAttribute(undefined)).toBe('')
  })
})

describe('EmbedCodeGenerator', () => {
  // The generated code is pasted onto someone ELSE's site, so a quote in the
  // event name must not be able to close the title attribute and open another.
  it('does not let an event name inject an attribute into the generated iframe', () => {
    render(<EmbedCodeGenerator event={{ slug: 'x', name: 'evil" onload="alert(1)' }} />)

    const code = screen.getByText(/<iframe/).textContent
    expect(code).not.toContain('onload="alert(1)')
    expect(code).toContain('&quot;')
    expect(code.match(/title="/g)).toHaveLength(1)
  })

  it('escapes the slug in the generated src as well', () => {
    render(<EmbedCodeGenerator event={{ slug: 'a"b', name: 'n' }} />)
    expect(screen.getByText(/<iframe/).textContent).toContain('embed/a&quot;b')
  })

  it('reports success when the clipboard write resolves', async () => {
    copyToClipboard.mockResolvedValue(true)
    render(<EmbedCodeGenerator event={EVENT} />)

    fireEvent.click(screen.getByRole('button', { name: /copy code/i }))

    expect(await screen.findByText(/copied/i)).toBeInTheDocument()
  })

  // The load-bearing case: before this fix the success message fired whether or
  // not the write worked, so the admin pasted whatever was already on their
  // clipboard. A rejected write must never read as success.
  it('does NOT claim success when the clipboard write rejects', async () => {
    copyToClipboard.mockResolvedValue(false)
    render(<EmbedCodeGenerator event={EVENT} />)

    fireEvent.click(screen.getByRole('button', { name: /copy code/i }))

    expect(await screen.findByText(/could not copy/i)).toBeInTheDocument()
    expect(screen.queryByText(/copied\./i)).not.toBeInTheDocument()
  })

  // copyToClipboard also returns false when it rejects internally; the component
  // must treat that identically to an explicit false.
  it('does NOT claim success when the copy helper rejects', async () => {
    copyToClipboard.mockRejectedValue(new Error('denied'))
    render(<EmbedCodeGenerator event={EVENT} />)

    fireEvent.click(screen.getByRole('button', { name: /copy code/i }))

    expect(await screen.findByText(/could not copy/i)).toBeInTheDocument()
    expect(screen.queryByText(/copied\./i)).not.toBeInTheDocument()
  })
})
