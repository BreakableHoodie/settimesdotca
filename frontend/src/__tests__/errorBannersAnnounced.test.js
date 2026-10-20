import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// An error banner must be announced: role="alert" (or the ui <Alert>, which
// carries it). The login 2FA step rendered "This code was just used" in a bare
// <div>, so screen readers never heard it (WCAG 4.1.3), and the E2E retry that
// waits for that alert (e2e/utils/session.js) could never fire. A sweep then
// found three more bare banners. This scan keeps a fifth from appearing.
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// `{error && <div ...>` or `{error && (\n <div ...>` whose opening tag lacks
// role="alert". Specifically alert: role="status" is polite, and the E2E retry
// in e2e/utils/session.js waits for an alert.
export const BARE_ERROR_BANNER = /\{\s*error\s*&&\s*\(?\s*<(div|p|span)\b(?![^>]*\brole="alert")[^>]*>/g

function sourceFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name)
    if (name === '__tests__' || name === 'test') return []
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(jsx|js)$/.test(name) ? [full] : []
  })
}

describe('error banners are announced', () => {
  it('the scan still recognises the shape it guards against', () => {
    const bare = '{error && <div className="bg-red-900/50 p-3">{error}</div>}'
    const bareMultiline = '{error && (\n  <div className="x">\n    <p>{error}</p>\n  </div>\n)}'
    const announced = '{error && (\n  <div role="alert" className="x">{error}</div>\n)}'
    const politeOnly = '{error && <div role="status" className="x">{error}</div>}'
    expect(bare.match(BARE_ERROR_BANNER)).toHaveLength(1)
    expect(bareMultiline.match(BARE_ERROR_BANNER)).toHaveLength(1)
    expect(politeOnly.match(BARE_ERROR_BANNER)).toHaveLength(1)
    expect(announced.match(BARE_ERROR_BANNER)).toBeNull()
  })

  it('no component renders an error banner without role="alert"', () => {
    const offenders = sourceFiles(SRC).flatMap(file => {
      const text = readFileSync(file, 'utf8')
      return [...text.matchAll(BARE_ERROR_BANNER)].map(m => {
        const line = text.slice(0, m.index).split('\n').length
        return `${path.relative(SRC, file)}:${line}`
      })
    })
    expect(offenders, 'add role="alert" (or use <Alert variant="error">)').toEqual([])
  })
})
