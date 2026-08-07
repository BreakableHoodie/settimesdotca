import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BAND_PHOTO_CROP } from '../bandPhoto'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function jsxFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...jsxFiles(full))
    else if (entry.name.endsWith('.jsx')) found.push(full)
  }
  return found
}

describe('BAND_PHOTO_CROP', () => {
  // Tailwind v4 scans source TEXT for whole class names and never evaluates
  // template expressions, so a value assembled from parts generates no CSS and
  // silently reverts to the centre crop. Nothing at runtime can detect that —
  // the class name simply matches no rule. Only a source scan catches it.
  it('is a complete literal class name in the source, not built from parts', () => {
    const source = readFileSync(path.join(SRC, 'utils', 'bandPhoto.js'), 'utf8')
    expect(source).toContain(`'${BAND_PHOTO_CROP}'`)
    expect(source).not.toMatch(/BAND_PHOTO_CROP\s*=\s*[`'"].*\$\{/)
  })

  // Pinned exactly, not to a range. The value is a shared contract across
  // eight surfaces, so drifting it to 40% would still be "above centre" while
  // quietly putting the hero back on the midsections — the whole bug.
  it('anchors at 25%, above centre', () => {
    expect(BAND_PHOTO_CROP).toBe('object-[50%_25%]')
    const percent = Number(BAND_PHOTO_CROP.match(/_(\d+)%\]$/)?.[1])
    expect(percent).toBe(25)
  })

  // The bug class: `object-cover` defaults to a CENTRE crop, which frames a
  // portrait band photo on the midsections and cuts the faces out. It was live
  // on eight surfaces at once, so fixing the reported one (the profile hero)
  // would have left seven. This scan is what makes a ninth impossible.
  it('is applied at every object-cover site that renders a band photo', () => {
    const offenders = []

    for (const file of jsxFiles(SRC)) {
      const source = readFileSync(file, 'utf8')
      if (!source.includes('object-cover')) continue

      // Only band photos: an event poster or a decorative image has its own
      // framing and must NOT be dragged to this anchor.
      if (!/photo_url|\bpreview\b/.test(source)) continue

      for (const [index, line] of source.split('\n').entries()) {
        if (!line.includes('object-cover')) continue
        if (line.includes('BAND_PHOTO_CROP')) continue
        offenders.push(`${path.relative(SRC, file)}:${index + 1}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
