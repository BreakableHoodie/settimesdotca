// After a deploy, a tab opened on the previous build asks for hashed chunks
// that no longer exist. Pages answers 200 text/html (its SPA fallback), the
// module import fails, and the route's ErrorBoundary renders (#1349). A reload
// fetches the current shell with the current hashes, which is the fix.
//
// Once per window only: a deploy that is genuinely broken would otherwise
// reload forever. The error is not swallowed (no preventDefault): swallowing
// hands lazy() an undefined module, a different and misleading error.
export const RELOAD_KEY = 'settimes:stale-chunk-reload-at'
export const RELOAD_WINDOW_MS = 10000

// True when this failure should reload the page, and records that it did.
// Storage that is missing or throws means no loop guard, so no reload: the
// boundary still offers its own Refresh button.
export function shouldReloadForStaleChunk(getStorage, now) {
  try {
    const storage = getStorage()
    const last = Number(storage.getItem(RELOAD_KEY))
    if (last > 0 && now - last < RELOAD_WINDOW_MS) return false
    storage.setItem(RELOAD_KEY, String(now))
    return true
  } catch {
    return false
  }
}

export function installStaleChunkReload(win = window) {
  win.addEventListener('vite:preloadError', () => {
    if (shouldReloadForStaleChunk(() => win.sessionStorage, Date.now())) {
      win.location.reload()
    }
  })
}
