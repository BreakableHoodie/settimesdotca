import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentFile = fileURLToPath(import.meta.url)
const srcRoot = path.join(path.dirname(currentFile), '../')

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(fullPath)
    return /\.(js|jsx|ts|tsx)$/.test(entry.name) ? [fullPath] : []
  })
}

describe('canonical band links', () => {
  it('never builds the legacy fromEvent query URL', () => {
    const offenders = walk(srcRoot)
      .filter(filePath => filePath !== currentFile)
      .filter(filePath => readFileSync(filePath, 'utf8').includes('?fromEvent='))
      .map(filePath => path.relative(srcRoot, filePath))

    expect(offenders).toEqual([])
  })
})
