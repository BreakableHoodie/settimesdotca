import { describe, it, expect } from 'vitest'
import {
  safeExternalHref,
  safeHttpsFallbackHref,
  safeSocialProfileHref,
  safeInstagramHref,
  safeXHref,
  safeTikTokHref,
} from '../urlSafety'

describe('safeExternalHref', () => {
  it('returns # for empty/nullish input', () => {
    expect(safeExternalHref('')).toBe('#')
    expect(safeExternalHref(null)).toBe('#')
    expect(safeExternalHref(undefined)).toBe('#')
  })

  it('passes through http and https URLs (normalized)', () => {
    expect(safeExternalHref('https://example.com')).toBe('https://example.com/')
    expect(safeExternalHref('http://example.com/path')).toBe('http://example.com/path')
  })

  it('trims surrounding whitespace before parsing', () => {
    expect(safeExternalHref('  https://example.com  ')).toBe('https://example.com/')
  })

  it('rejects dangerous and non-http(s) schemes', () => {
    expect(safeExternalHref('javascript:alert(1)')).toBe('#')
    expect(safeExternalHref('data:text/html,<script>')).toBe('#')
    expect(safeExternalHref('ftp://example.com')).toBe('#')
    expect(safeExternalHref('mailto:a@b.com')).toBe('#')
  })

  it('returns # for unparseable values', () => {
    expect(safeExternalHref('not a url')).toBe('#')
  })
})

describe('safeHttpsFallbackHref', () => {
  it('returns # for empty/whitespace input', () => {
    expect(safeHttpsFallbackHref('')).toBe('#')
    expect(safeHttpsFallbackHref('   ')).toBe('#')
    expect(safeHttpsFallbackHref(null)).toBe('#')
  })

  it('passes through explicit http(s) URLs', () => {
    expect(safeHttpsFallbackHref('https://example.com')).toBe('https://example.com/')
  })

  it('prepends https:// to a bare domain', () => {
    expect(safeHttpsFallbackHref('example.com')).toBe('https://example.com/')
    expect(safeHttpsFallbackHref('example.com/path')).toBe('https://example.com/path')
  })

  it('rejects a leading-slash value (fails the bare-domain pattern before any slash-stripping)', () => {
    expect(safeHttpsFallbackHref('/example.com')).toBe('#')
  })

  it('rejects values with a scheme-like colon or whitespace', () => {
    expect(safeHttpsFallbackHref('javascript:alert(1)')).toBe('#')
    expect(safeHttpsFallbackHref('foo bar')).toBe('#')
  })
})

describe('safeSocialProfileHref', () => {
  const base = 'https://instagram.com'

  it('returns # for empty input', () => {
    expect(safeSocialProfileHref('', base)).toBe('#')
    expect(safeSocialProfileHref('   ', base)).toBe('#')
  })

  it('passes through a full http(s) profile URL', () => {
    expect(safeSocialProfileHref('https://instagram.com/band', base)).toBe('https://instagram.com/band')
  })

  it('builds a profile URL from a handle, stripping @ and leading slashes', () => {
    expect(safeSocialProfileHref('@band', base)).toBe('https://instagram.com/band')
    expect(safeSocialProfileHref('/band', base)).toBe('https://instagram.com/band')
  })

  it('honors a base URL with a trailing slash without doubling it', () => {
    expect(safeSocialProfileHref('band', 'https://instagram.com/')).toBe('https://instagram.com/band')
  })

  it('rejects handles containing whitespace', () => {
    expect(safeSocialProfileHref('two words', base)).toBe('#')
  })

  it('returns # when a handle normalizes to empty', () => {
    expect(safeSocialProfileHref('@', base)).toBe('#')
  })

  it('rejects a handle containing a colon (any URL scheme, e.g. javascript:)', () => {
    expect(safeSocialProfileHref('javascript:alert(1)', base)).toBe('#')
  })
})

describe('safeInstagramHref', () => {
  it('builds an instagram.com profile URL from a handle', () => {
    expect(safeInstagramHref('@band')).toBe('https://instagram.com/band')
  })

  it('returns # for empty input', () => {
    expect(safeInstagramHref('')).toBe('#')
  })

  it('rejects a javascript: value passed as a bare handle', () => {
    expect(safeInstagramHref('javascript:alert(1)')).toBe('#')
  })
})

describe('safeXHref', () => {
  it('builds an x.com profile URL from a bare handle', () => {
    expect(safeXHref('settimesca')).toBe('https://x.com/settimesca')
  })

  it('builds an x.com profile URL from an @handle', () => {
    expect(safeXHref('@settimesca')).toBe('https://x.com/settimesca')
  })

  it('passes through a full profile URL untouched', () => {
    expect(safeXHref('https://x.com/settimesca')).toBe('https://x.com/settimesca')
  })

  it('returns # for empty input', () => {
    expect(safeXHref('')).toBe('#')
    expect(safeXHref(null)).toBe('#')
  })

  it('rejects a javascript: value passed as a bare handle', () => {
    expect(safeXHref('javascript:alert(1)')).toBe('#')
  })
})

describe('safeTikTokHref', () => {
  it('builds a tiktok.com profile URL with a leading @ from a bare handle', () => {
    expect(safeTikTokHref('settimesca')).toBe('https://www.tiktok.com/@settimesca')
  })

  it('builds a tiktok.com profile URL with a leading @ from an @handle (no doubling)', () => {
    expect(safeTikTokHref('@settimesca')).toBe('https://www.tiktok.com/@settimesca')
  })

  it('passes through a full profile URL untouched', () => {
    expect(safeTikTokHref('https://www.tiktok.com/@settimesca')).toBe('https://www.tiktok.com/@settimesca')
  })

  it('returns # for empty input', () => {
    expect(safeTikTokHref('')).toBe('#')
    expect(safeTikTokHref(null)).toBe('#')
  })

  it('rejects a handle containing whitespace', () => {
    expect(safeTikTokHref('two words')).toBe('#')
  })

  it('rejects a javascript: value passed as a bare handle', () => {
    expect(safeTikTokHref('javascript:alert(1)')).toBe('#')
  })
})
