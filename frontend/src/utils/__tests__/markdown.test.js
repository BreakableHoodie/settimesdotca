/**
 * Tests for frontend/src/utils/markdown.js
 *
 * Security-critical: this util renders editor-submitted content publicly.
 * XSS tests are mandatory and must pass before any deploy.
 */

import { describe, it, expect } from 'vitest'
import { renderMarkdownToSafeHtml, stripMarkdownToText } from '../markdown'

// ---------------------------------------------------------------------------
// renderMarkdownToSafeHtml — markdown syntax rendering
// ---------------------------------------------------------------------------

describe('renderMarkdownToSafeHtml — markdown rendering', () => {
  it('renders **bold** as <strong>', () => {
    const result = renderMarkdownToSafeHtml('**bold text**')
    expect(result).toContain('<strong>bold text</strong>')
  })

  it('renders *italic* as <em>', () => {
    const result = renderMarkdownToSafeHtml('*italic text*')
    expect(result).toContain('<em>italic text</em>')
  })

  it('renders an unordered list', () => {
    const result = renderMarkdownToSafeHtml('- item a\n- item b')
    expect(result).toContain('<ul>')
    expect(result).toContain('<li>')
    expect(result).toContain('item a')
    expect(result).toContain('item b')
  })

  it('renders a markdown link with the href preserved', () => {
    const result = renderMarkdownToSafeHtml('[visit us](https://settimes.ca)')
    expect(result).toContain('<a')
    expect(result).toContain('href="https://settimes.ca"')
    expect(result).toContain('visit us')
  })

  it('renders h3 and h4 headings (h1/h2 must be stripped)', () => {
    const result = renderMarkdownToSafeHtml('### Section\n#### Subsection')
    expect(result).toContain('<h3>')
    expect(result).toContain('<h4>')
  })

  it('strips h1 headings (reserved for page structure)', () => {
    const result = renderMarkdownToSafeHtml('# Page Title')
    expect(result).not.toContain('<h1>')
    // content should still be present
    expect(result).toContain('Page Title')
  })

  it('strips h2 headings (reserved for page structure)', () => {
    const result = renderMarkdownToSafeHtml('## Section Title')
    expect(result).not.toContain('<h2>')
    expect(result).toContain('Section Title')
  })

  it('renders inline code', () => {
    const result = renderMarkdownToSafeHtml('Use `npm install` to install.')
    expect(result).toContain('<code>npm install</code>')
  })

  it('renders blockquotes', () => {
    const result = renderMarkdownToSafeHtml('> A great quote')
    expect(result).toContain('<blockquote>')
    expect(result).toContain('A great quote')
  })
})

// ---------------------------------------------------------------------------
// renderMarkdownToSafeHtml — paragraph preservation (primary use-case)
// ---------------------------------------------------------------------------

describe('renderMarkdownToSafeHtml — paragraph preservation (pasted plain-text bios)', () => {
  it('renders a 3-paragraph plain-text bio as 3 separate <p> elements', () => {
    const input = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.'
    const result = renderMarkdownToSafeHtml(input)
    // Count <p> opening tags
    const pCount = (result.match(/<p>/g) || []).length
    expect(pCount).toBe(3)
    expect(result).toContain('<p>First paragraph.</p>')
    expect(result).toContain('<p>Second paragraph.</p>')
    expect(result).toContain('<p>Third paragraph.</p>')
  })

  it('preserves paragraph structure through the whitespace-collapse post-processing used in BandProfilePage', () => {
    // Simulate the full BandProfilePage post-processing pipeline after renderMarkdownToSafeHtml
    const input = 'Bio line one.\n\nBio line two.\n\nBio line three.'
    let cleaned = renderMarkdownToSafeHtml(input)
    // replicate BandProfilePage post-processing
    cleaned = cleaned.replace(/<a\s/gi, '<a rel="noopener noreferrer" ')
    cleaned = cleaned.replace(/(<br\s*\/?>\s*){2,}/gi, '</p><p>')
    cleaned = cleaned.replace(/<br\s*\/?>/gi, ' ')
    cleaned = cleaned.replace(/\s+/g, ' ').trim()

    const pCount = (cleaned.match(/<p>/g) || []).length
    expect(pCount).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// renderMarkdownToSafeHtml — backward compatibility (legacy HTML bios)
// ---------------------------------------------------------------------------

describe('renderMarkdownToSafeHtml — backward compatibility', () => {
  it('passes through a legacy HTML bio with <strong> already in it', () => {
    const result = renderMarkdownToSafeHtml('<strong>Rock band</strong> from Waterloo.')
    expect(result).toContain('<strong>Rock band</strong>')
    expect(result).toContain('from Waterloo.')
  })

  it('renders plain text (no markdown, no HTML) wrapped in a paragraph', () => {
    const result = renderMarkdownToSafeHtml('Just a plain text bio.')
    expect(result).toContain('Just a plain text bio.')
    // marked wraps bare text in <p>
    expect(result).toContain('<p>')
  })
})

// ---------------------------------------------------------------------------
// renderMarkdownToSafeHtml — XSS protection (non-negotiable)
// ---------------------------------------------------------------------------

describe('renderMarkdownToSafeHtml — XSS protection', () => {
  it('strips <script> tags', () => {
    const result = renderMarkdownToSafeHtml('<script>alert(1)</script>Band bio.')
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('alert(1)')
  })

  it('strips <img> with onerror event handler', () => {
    const result = renderMarkdownToSafeHtml('<img src=x onerror=alert(1)>')
    expect(result).not.toContain('<img')
    expect(result).not.toContain('onerror')
  })

  it('strips javascript: href in a markdown link', () => {
    const result = renderMarkdownToSafeHtml('[click me](javascript:alert(1))')
    // The link should either be stripped entirely or the href removed
    const hasJsHref = result.includes('javascript:')
    expect(hasJsHref).toBe(false)
  })

  it('strips data: URI in a markdown link', () => {
    const result = renderMarkdownToSafeHtml('[x](data:text/html,<script>alert(1)</script>)')
    expect(result).not.toContain('data:text/html')
  })

  it('strips event handler attributes injected via HTML', () => {
    const result = renderMarkdownToSafeHtml('<p onmouseover="alert(1)">bio</p>')
    expect(result).not.toContain('onmouseover')
  })

  it('strips <iframe> tags', () => {
    const result = renderMarkdownToSafeHtml('<iframe src="https://evil.com"></iframe>')
    expect(result).not.toContain('<iframe')
  })

  it('strips <style> tags', () => {
    const result = renderMarkdownToSafeHtml('<style>body { display:none }</style>Bio.')
    expect(result).not.toContain('<style')
  })
})

// ---------------------------------------------------------------------------
// stripMarkdownToText — plain text extraction
// ---------------------------------------------------------------------------

describe('stripMarkdownToText', () => {
  it('strips ** bold markers from text', () => {
    const result = stripMarkdownToText('**hi** there')
    expect(result).not.toContain('*')
    expect(result).toContain('hi')
    expect(result).toContain('there')
  })

  it('strips ## heading markers', () => {
    const result = stripMarkdownToText('## Heading\nBody text.')
    expect(result).not.toContain('#')
    expect(result).toContain('Heading')
    expect(result).toContain('Body text.')
  })

  it('strips both bold and heading markers combined (heading must be at line-start)', () => {
    // markdown headings only apply when ## is at the beginning of a line
    const result = stripMarkdownToText('**hi**\n## x')
    expect(result).not.toMatch(/[*#]/)
    expect(result).toContain('hi')
    expect(result).toContain('x')
  })

  it('strips all HTML tags', () => {
    const result = stripMarkdownToText('<p><strong>Bio</strong></p>')
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
    expect(result).toContain('Bio')
  })

  it('returns empty string for null/undefined', () => {
    expect(stripMarkdownToText(null)).toBe('')
    expect(stripMarkdownToText(undefined)).toBe('')
    expect(stripMarkdownToText('')).toBe('')
  })

  it('collapses whitespace to single spaces', () => {
    const result = stripMarkdownToText('Word1\n\nWord2')
    expect(result).toBe('Word1 Word2')
  })
})
