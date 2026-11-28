// Durable guard: React 19 removed propTypes checking, so `X.propTypes = {...}`
// validates nothing, and ESLint's `react/prop-types` is off. #1497 deleted ~33
// of them along with the `prop-types` dependency. This scans source text so a
// copy-pasted block (or the import) fails the build instead of silently
// reappearing as dead code that looks like validation.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../')
const THIS_FILE = '__tests__/noPropTypes.test.js'
const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx']

// Built from parts so this file's own text never matches.
const PATTERNS = [
  new RegExp('\\.prop' + 'Types\\s*='),
  new RegExp('from\\s+[\'"]prop' + '-types[\'"]'),
  new RegExp('require\\(\\s*[\'"]prop' + '-types[\'"]\\s*\\)'),
]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (EXTENSIONS.includes(path.extname(entry.name))) out.push(full)
  }
  return out
}

describe('no dead propTypes (#1497)', () => {
  it('scans a non-trivial number of source files', () => {
    expect(walk(srcRoot).length).toBeGreaterThan(50)
  })

  it('no source file assigns propTypes or imports prop-types', () => {
    const offenders = []
    for (const file of walk(srcRoot)) {
      const rel = path.relative(srcRoot, file).split(path.sep).join('/')
      if (rel === THIS_FILE) continue
      const text = readFileSync(file, 'utf8')
      if (PATTERNS.some(re => re.test(text))) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})
