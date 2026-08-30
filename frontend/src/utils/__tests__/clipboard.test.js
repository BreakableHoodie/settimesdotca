import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { copyToClipboard } from '../clipboard'

describe('copyToClipboard', () => {
  let originalClipboard
  let originalExecCommand

  beforeEach(() => {
    originalClipboard = navigator.clipboard
    originalExecCommand = document.execCommand
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true })
    document.execCommand = originalExecCommand
    vi.restoreAllMocks()
    // copyToClipboard's execCommand fallback appends a <textarea> and only
    // removes it after document.execCommand('copy') returns — if that call
    // throws (as "returns false when the fallback throws" below forces), the
    // removal is never reached and the element is orphaned in document.body
    // for the rest of this file's shared jsdom environment. Sweep it here so
    // a later test's "the textarea is cleaned up" assertion sees a clean DOM
    // regardless of run order.
    document.querySelectorAll('textarea').forEach(node => node.remove())
  })

  function setClipboard(value) {
    Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
  }

  it('uses the async Clipboard API when available and returns true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })

    await expect(copyToClipboard('hello')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('falls back to execCommand when the Clipboard API throws, returning its result', async () => {
    setClipboard({
      writeText: vi.fn().mockRejectedValue(new Error('denied')),
    })
    document.execCommand = vi.fn().mockReturnValue(true)

    await expect(copyToClipboard('world')).resolves.toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    // the temporary textarea is cleaned up
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('falls back to execCommand when the Clipboard API is absent', async () => {
    setClipboard(undefined)
    document.execCommand = vi.fn().mockReturnValue(true)

    await expect(copyToClipboard('x')).resolves.toBe(true)
  })

  it('returns false when the execCommand fallback reports failure', async () => {
    setClipboard(undefined)
    document.execCommand = vi.fn().mockReturnValue(false)

    await expect(copyToClipboard('x')).resolves.toBe(false)
  })

  it('returns false when the fallback throws', async () => {
    setClipboard(undefined)
    document.execCommand = vi.fn(() => {
      throw new Error('execCommand blew up')
    })

    await expect(copyToClipboard('x')).resolves.toBe(false)
  })
})
