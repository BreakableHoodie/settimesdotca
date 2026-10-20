import { describe, expect, it, vi } from 'vitest'
import { RELOAD_KEY, RELOAD_WINDOW_MS, installStaleChunkReload, shouldReloadForStaleChunk } from '../staleChunkReload'

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    data,
  }
}

describe('shouldReloadForStaleChunk (#1349)', () => {
  it('reloads on the first failure and records when', () => {
    const storage = memoryStorage()
    expect(shouldReloadForStaleChunk(() => storage, 1000000)).toBe(true)
    expect(storage.data.get(RELOAD_KEY)).toBe('1000000')
  })

  it('does not reload again inside the window: a broken deploy cannot loop', () => {
    const storage = memoryStorage({ [RELOAD_KEY]: '1000000' })
    expect(shouldReloadForStaleChunk(() => storage, 1000000 + RELOAD_WINDOW_MS - 1)).toBe(false)
  })

  it('reloads again once the window has passed (a later deploy)', () => {
    const storage = memoryStorage({ [RELOAD_KEY]: '1000000' })
    expect(shouldReloadForStaleChunk(() => storage, 1000000 + RELOAD_WINDOW_MS)).toBe(true)
  })

  it('does not reload when storage is unavailable, since nothing could stop a loop', () => {
    const blocked = () => {
      throw new Error('SecurityError: storage denied')
    }
    expect(shouldReloadForStaleChunk(blocked, 1000000)).toBe(false)
    const throwsOnWrite = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(shouldReloadForStaleChunk(() => throwsOnWrite, 1000000)).toBe(false)
  })
})

describe('installStaleChunkReload', () => {
  function fakeWindow(storage) {
    const target = new globalThis.EventTarget()
    return Object.assign(target, { sessionStorage: storage, location: { reload: vi.fn() } })
  }

  it('reloads on vite:preloadError and leaves the error to propagate (no preventDefault)', () => {
    const win = fakeWindow(memoryStorage())
    installStaleChunkReload(win)
    const event = new Event('vite:preloadError', { cancelable: true })
    win.dispatchEvent(event)
    expect(win.location.reload).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(false)
  })

  it('a second failure right after the reload does not reload again', () => {
    const win = fakeWindow(memoryStorage({ [RELOAD_KEY]: String(Date.now()) }))
    installStaleChunkReload(win)
    win.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))
    expect(win.location.reload).not.toHaveBeenCalled()
  })
})
