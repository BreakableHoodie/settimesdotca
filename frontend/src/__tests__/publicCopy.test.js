// --- Durable guard: plain copy on the public site (#1248 3c) -----------------
//
// The public copy read templated: middle-dot strings ("Discover · Plan ·
// Experience", "Starts in 12m · 7:00 PM") and arrows in sentences ("← Back",
// "View schedule →"). Joined fragments become a comma list or a short
// sentence; a back link takes a lucide icon; a forward link just says what it
// does. This scan keeps the glyphs from coming back.
//
// It is a source scan, not a render assertion, for the same reason as
// publicShapeLanguage.test.js: copy is baked into JSX text and string
// literals, and a render test only sees the branches it happens to reach.
//
// Scope: every .js/.jsx under frontend/src/ except admin/ (dark-pinned, out of
// scope), __tests__/ and test/. Comments are removed first, so a comment that
// explains an arrow or a middle-dot ("walk → leave") is not copy and is fine.
// The scan also proves it can fail: each pattern is checked against a
// known-bad and a known-good sample, because a scan whose regex has drifted
// passes while checking nothing.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../')

const SKIPPED_DIRS = new Set(['admin', '__tests__', 'test'])

function walk(dir) {
  let files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) files = files.concat(walk(full))
    } else if (entry.isFile() && /\.(js|jsx)$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

// The glyph, its HTML entity spellings and its JS escape spellings: all render
// the same character, so all are the same defect. (Arrows are above U+00FF,
// so they have no `\x` spelling.)
const MIDDLE_DOT = /·|&middot;|&#0*183;|&#x0*b7;|\\u00b7|\\u\{0*b7\}|\\xb7/i
const ARROW = /[←→]|&[lr]arr;|&#0*859[24];|&#x0*219[02];|\\u219[02]|\\u\{0*219[02]\}/i

// Replace every comment with spaces (newlines kept so line numbers hold),
// leaving strings, template literals and JSX text alone. A comment marker
// inside a string ("https://x") is content, not a comment, so the scanner
// tracks quotes. Template literals nest through `${ }`.
function stripComments(source) {
  const out = []
  // Stack of what we are inside: 'code', or a quote character, or 'tpl'.
  // `braces` counts { } inside a ${ } so the matching } returns to the template.
  const stack = ['code']
  const braces = []
  let i = 0
  const blank = text => text.replace(/[^\n]/g, ' ')
  while (i < source.length) {
    const mode = stack[stack.length - 1]
    const c = source[i]
    const next = source[i + 1]
    if (mode === 'code') {
      // `//` straight after `:` is a URL in JSX text (`https://settimes.ca`), not
      // a comment; JS never puts a line comment there (CodeRabbit, #1248 3c).
      if (c === '/' && next === '/' && source[i - 1] !== ':') {
        const end = source.indexOf('\n', i)
        const stop = end === -1 ? source.length : end
        out.push(blank(source.slice(i, stop)))
        i = stop
        continue
      }
      if (c === '/' && next === '*') {
        const end = source.indexOf('*/', i + 2)
        const stop = end === -1 ? source.length : end + 2
        out.push(blank(source.slice(i, stop)))
        i = stop
        continue
      }
      if (c === "'" || c === '"') stack.push(c)
      else if (c === '`') stack.push('tpl')
      else if (c === '{' && braces.length) braces[braces.length - 1]++
      else if (c === '}' && braces.length) {
        if (--braces[braces.length - 1] === 0) {
          braces.pop()
          stack.pop() // back to the template
        }
      }
    } else if (mode === 'tpl') {
      if (c === '\\') {
        out.push(c, next ?? '')
        i += 2
        continue
      }
      if (c === '`') stack.pop()
      else if (c === '$' && next === '{') {
        stack.push('code')
        braces.push(1)
        out.push(c, next)
        i += 2
        continue
      }
    } else {
      // a ' or " string; it may not span a newline, so a stray apostrophe in
      // JSX text cannot swallow the rest of the file.
      if (c === '\\') {
        out.push(c, next ?? '')
        i += 2
        continue
      }
      if (c === mode || c === '\n') stack.pop()
    }
    out.push(c)
    i++
  }
  return out.join('')
}

function scan(relPath, source) {
  const found = []
  stripComments(source)
    .split('\n')
    .forEach((text, i) => {
      if (MIDDLE_DOT.test(text)) found.push(`${relPath}:${i + 1} middle-dot in copy`)
      if (ARROW.test(text)) found.push(`${relPath}:${i + 1} arrow in copy`)
    })
  return found
}

describe('plain copy on the public site (#1248)', () => {
  const files = walk(srcRoot)

  it('scans a non-trivial number of public files', () => {
    expect(files.length).toBeGreaterThan(40)
    expect(files.some(f => f.includes(`${path.sep}admin${path.sep}`))).toBe(false)
  })

  it('has no middle-dot or arrow in public copy', () => {
    const offenders = files.flatMap(f =>
      scan(path.relative(srcRoot, f).split(path.sep).join('/'), readFileSync(f, 'utf8'))
    )
    expect(offenders).toEqual([])
  })

  describe('the patterns can fail (a scan that cannot is checking nothing)', () => {
    it('middle-dot in every spelling', () => {
      for (const bad of ['a · b', 'a &middot; b', 'a &#183; b', 'a &#xB7; b', 'a \\u00b7 b', '\\u{b7}', 'a \\xB7 b']) {
        expect(MIDDLE_DOT.test(bad), bad).toBe(true)
      }
      for (const good of ['a, b', 'a - b', 'Day 2, Saturday', 'a &mdash; b']) {
        expect(MIDDLE_DOT.test(good), good).toBe(false)
      }
    })

    it('arrow in every spelling', () => {
      for (const bad of [
        '← Back',
        'View schedule →',
        '&rarr;',
        '&larr; All',
        '&#8594;',
        '&#x2190;',
        '\\u2192',
        '\\u{2190}',
      ]) {
        expect(ARROW.test(bad), bad).toBe(true)
      }
      for (const good of ['Back to SetTimes', 'View schedule', 'a - b', 'x => y']) {
        expect(ARROW.test(good), good).toBe(false)
      }
    })

    it('flags a glyph in a string, a template literal and JSX text', () => {
      expect(scan('x.js', "const a = 'a · b'")).toHaveLength(1)
      expect(scan('x.js', 'const a = `${n} · ${m}`')).toHaveLength(1)
      expect(scan('x.jsx', '<p>\n  View schedule →\n</p>')).toEqual(['x.jsx:2 arrow in copy'])
      expect(scan('x.jsx', '<p>{ok ? `${a}` : `x ${b ? `y` : ""} ←`}</p>')).toHaveLength(1)
    })

    it('ignores a glyph in a comment, but not one after a comment marker inside a string', () => {
      expect(scan('x.js', '// walk → leave')).toEqual([])
      expect(scan('x.js', '/* a · b\n   c → d */ const a = 1')).toEqual([])
      expect(scan('x.jsx', '<p>{/* ← note */}</p>')).toEqual([])
      expect(scan('x.js', "const a = 'https://x · y'")).toHaveLength(1)
      // a URL in JSX text is not a comment marker (CodeRabbit, #1248 3c)
      expect(scan('x.jsx', '<p>Visit https://settimes.ca/ → schedule</p>')).toHaveLength(1)
      // a comment on the same line as copy must not hide the copy
      expect(scan('x.js', "const a = 'a · b' // fine")).toHaveLength(1)
    })

    it('keeps line numbers across a multi-line comment', () => {
      expect(scan('x.js', '/* one\n two */\nconst a = "→"')).toEqual(['x.js:3 arrow in copy'])
    })
  })
})
