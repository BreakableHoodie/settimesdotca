// --- Durable guard: one shape language on the public site (#1248) ------------
//
// Shape encodes meaning: a thing that is itself round (avatar, dot, icon-only
// button, count badge) is `rounded-full`; a control you press or type in is
// `rounded-md`; a label that describes something is `rounded-sm`. Before this
// the public site put a pill on everything, plus decorative blur, decorative
// gradients and `transition-all`, which read as templated.
//
// This is a source scan, not a render assertion, for the same reason as
// isPublishedGuard.test.js and admin/utils/__tests__/bandFields.test.js: the
// defect is a class name baked into JSX text. Tailwind v4 scans source TEXT
// for whole class names, so reading the source is the only way to see it.
//
// Scope: every .js/.jsx under frontend/src/ except admin/ (dark-pinned, out of
// scope), __tests__/ and test/. The scan also proves it can fail: each rule's
// pattern is checked against a known-bad and a known-good sample, because a
// scan whose regex has drifted passes while checking nothing.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../')

const SKIPPED_DIRS = new Set(['admin', '__tests__', 'test'])

function walk(dir, extension = /\.(js|jsx)$/) {
  let files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) files = files.concat(walk(full, extension))
    } else if (entry.isFile() && extension.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

// Stylesheets get the two rules that have no legitimate use anywhere: blur and
// `transition: all` (CodeRabbit, #1371). Gradients are deliberately NOT scanned
// in CSS: index.css holds every theme's gradient tokens and the skeleton
// shimmer, so that rule would be mostly allowlist.
// `transition` animates `all` when an item names `all`, or names no property
// at all (`transition: 200ms ease`), and that item may be any entry of a
// comma-separated list. The grammar lets the property come anywhere in an item
// (`200ms opacity` is valid) and allows `none`, so each item is searched for a
// property token rather than read by position (CodeRabbit, #1371).
const NOT_A_PROPERTY =
  /^(?:-?[\d.]+m?s|ease(?:-in|-out|-in-out)?|linear|step-start|step-end|steps\(.*|cubic-bezier\(.*|linear\(.*|allow-discrete|normal)$/
function transitionAnimatesAll(value) {
  const v = value.trim()
  if (/^(?:none|initial|inherit|unset|revert(?:-layer)?)$/.test(v)) return false
  return v.split(',').some(item => {
    const property = item
      .trim()
      .split(/\s+/)
      .find(token => token && !NOT_A_PROPERTY.test(token))
    return property === undefined || property === 'all'
  })
}

// One finding per declaration, with the line it starts on: the whole sheet is
// scanned, so a declaration broken across lines is still read as one.
function scanCss(relPath, raw) {
  // CSS ignores comments, so must the scan (`transition: /* x */ 200ms` is an
  // implicit `all`). Newlines inside a comment are kept, so line numbers hold.
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' '))
  const lineOf = index => source.slice(0, index).split('\n').length
  const found = []
  for (const m of source.matchAll(/backdrop-filter\s*:|backdrop-blur/g)) {
    found.push(`${relPath}:${lineOf(m.index)} blur`)
  }
  for (const m of source.matchAll(/(?<![\w-])transition-all(?![\w-])/g)) {
    found.push(`${relPath}:${lineOf(m.index)} transition: all`)
  }
  for (const m of source.matchAll(/(?<![\w-])transition\s*:\s*([^;}]+)/g)) {
    if (transitionAnimatesAll(m[1])) found.push(`${relPath}:${lineOf(m.index)} transition: all`)
  }
  for (const m of source.matchAll(/(?<![\w-])transition-property\s*:\s*([^;}]+)/g)) {
    if (/(?:^|,)\s*all\s*(?:,|$)/.test(m[1].trim())) found.push(`${relPath}:${lineOf(m.index)} transition: all`)
  }
  return found
}

// Gradients that stay, each with the reason it is functional. `match` is a
// substring of the offending line, so an allowance covers one use and not the
// whole file.
const GRADIENT_ALLOWLIST = [
  {
    file: 'pages/BandProfilePage.jsx',
    match: 'from-black/85',
    reason: 'photo scrim: a dark gradient over the band photo so the white name and tags on it stay legible',
  },
  {
    file: 'utils/posterTheme.js',
    match: '--background-image-gradient-',
    reason: "overrides the theme's gradient tokens on the poster-led event page; it applies no gradient utility",
  },
]

// --- the rules ---------------------------------------------------------------

const BACKDROP_BLUR = /backdrop-blur/
const TRANSITION_ALL = /(?<![\w-])transition-all(?![\w-])/
// Gradient utilities, and the raw CSS functions: a `style={{ background:
// 'linear-gradient(...)' }}` is the same decoration without a class name.
const GRADIENT =
  /(?<![\w-])(?:(?:[\w-]+:)*(?:bg-gradient-|bg-linear-|bg-radial-|bg-conic-|from-)[\w/[\].#%-]*)|(?:linear|radial|conic)-gradient\(/

// A pill is round text: `rounded-full` plus horizontal padding of px-2 or more
// in ONE class string. px-1 / px-1.5 are what count badges use around a number.
function isPill(literal) {
  const tokens = literal.split(/[\s"'`]+/)
  const round = tokens.some(t => t.split(':').pop() === 'rounded-full')
  if (!round) return false
  return tokens.some(t => {
    const m = /^px-(\d+(?:\.\d+)?|\[.+\])$/.exec(t.split(':').pop())
    if (!m) return false
    return m[1].startsWith('[') || Number(m[1]) >= 2
  })
}

// A see-through bar: something pinned over scrolling content (sticky/fixed)
// on a translucent THEME colour. Blur used to hide what showed through; without
// it the lineup reads through the bar (the Header, CodeRabbit on #1248 3b). A
// black scrim (`bg-black/80` behind a modal) is a dimmer, not a bar, so it is
// allowed. Inline `color-mix(..., transparent)` is the same thing without a class.
function isSeeThroughBar(literal) {
  // `var(...)` nests parentheses, so match lazily up to `transparent`.
  if (/color-mix\([\s\S]*?\btransparent\b/.test(literal)) return true
  const tokens = literal.split(/[\s"'`]+/).map(t => t.split(':').pop())
  if (!tokens.some(t => t === 'sticky' || t === 'fixed')) return false
  return tokens.some(t => /^bg-(?!black\/)[\w-]+\/\d+$/.test(t))
}

// Every string / template literal in the source with its line number. Quotes
// may not span a newline; a template literal may. Nested quotes inside `${}`
// are content to the enclosing backtick, which is what we want: one literal.
function literals(source) {
  const out = []
  const re = /`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g
  for (const m of source.matchAll(re)) {
    out.push({ text: m[0], line: source.slice(0, m.index).split('\n').length })
  }
  return out
}

function scan(relPath, source) {
  const found = []
  const lines = source.split('\n')
  lines.forEach((text, i) => {
    const where = `${relPath}:${i + 1}`
    if (BACKDROP_BLUR.test(text)) found.push(`${where} backdrop-blur`)
    if (TRANSITION_ALL.test(text)) found.push(`${where} transition-all`)
    if (GRADIENT.test(text)) {
      const allowed = GRADIENT_ALLOWLIST.some(a => a.file === relPath && text.includes(a.match))
      if (!allowed) found.push(`${where} gradient`)
    }
  })
  for (const { text, line } of literals(source)) {
    if (isPill(text)) found.push(`${relPath}:${line} pill (rounded-full text with px-2 or more)`)
    if (isSeeThroughBar(text)) found.push(`${relPath}:${line} see-through sticky/fixed bar`)
  }
  return found
}

describe('public site shape language (#1248)', () => {
  const files = walk(srcRoot)

  it('scans a non-trivial number of public files', () => {
    expect(files.length).toBeGreaterThan(40)
    expect(files.some(f => f.includes(`${path.sep}admin${path.sep}`))).toBe(false)
  })

  it('has no backdrop-blur, transition-all, decorative gradient, pill or see-through bar in public files', () => {
    const offenders = files.flatMap(f =>
      scan(path.relative(srcRoot, f).split(path.sep).join('/'), readFileSync(f, 'utf8'))
    )
    expect(offenders).toEqual([])
  })

  it('has no blur or transition: all in public stylesheets', () => {
    const sheets = walk(srcRoot, /\.css$/)
    expect(sheets.length).toBeGreaterThan(0)
    const offenders = sheets.flatMap(f =>
      scanCss(path.relative(srcRoot, f).split(path.sep).join('/'), readFileSync(f, 'utf8'))
    )
    expect(offenders).toEqual([])
  })

  it('every allowlist entry still matches a real line (no stale exemptions)', () => {
    for (const { file, match, reason } of GRADIENT_ALLOWLIST) {
      expect(reason.length).toBeGreaterThan(10)
      expect(readFileSync(path.join(srcRoot, file), 'utf8')).toContain(match)
    }
  })

  describe('the patterns can fail (a scan that cannot is checking nothing)', () => {
    it('backdrop-blur', () => {
      expect(BACKDROP_BLUR.test('bg-bg-navy/90 backdrop-blur-xs')).toBe(true)
      expect(BACKDROP_BLUR.test('bg-bg-navy')).toBe(false)
    })

    it('transition-all', () => {
      expect(TRANSITION_ALL.test('rounded-lg transition-all duration-200')).toBe(true)
      expect(TRANSITION_ALL.test('transition-colors transition-[padding,box-shadow]')).toBe(false)
    })

    it('gradients', () => {
      for (const bad of [
        'bg-gradient-card',
        'hover:bg-gradient-accent',
        'bg-linear-to-br from-bg-navy to-bg-purple',
        'bg-radial-[at_top] from-black',
        "background: 'linear-gradient(180deg, red, blue)'",
      ]) {
        expect(GRADIENT.test(bad), bad).toBe(true)
      }
      for (const good of ['bg-surface', 'bg-accent-500 text-bg-navy', 'animate-shimmer', 'text-start from the top']) {
        expect(GRADIENT.test(good), good).toBe(false)
      }
    })

    it('stylesheet blur and transition: all', () => {
      const flags = css => scanCss('x.css', css).length > 0
      for (const bad of [
        '.a { backdrop-filter: blur(8px); }',
        '.a { transition: all 200ms ease; }',
        '.a { transition: 200ms ease; }', // no property named: that is `all`
        '.a { transition: opacity 200ms, all 1s; }', // `all` later in the list
        '.a { transition: opacity 200ms, 300ms linear; }', // an unnamed later item
        '.a {\n  transition:\n    200ms ease;\n}', // a declaration across lines
        '.a { transition: /* note */ 200ms ease; }', // a comment is not a property
        '.a { transition-property: all; }',
        '.a { @apply transition-all; }',
      ]) {
        expect(flags(bad), bad).toBe(true)
      }
      for (const good of [
        '.a { filter: blur(2px); }',
        '.a { transition: box-shadow 200ms ease, transform 200ms ease; }',
        '.a { transition: 200ms opacity; }', // property after the duration
        '.a { transition: none; }',
        '/* transition: all 1s; */ .a { color: red; }', // commented out entirely
        '.a { transition-property: opacity, transform; }',
        '.a { transition-duration: 200ms; }',
        '.a { animation: shimmer 1.5s infinite; }',
      ]) {
        expect(flags(good), good).toBe(false)
      }
      expect(scanCss('x.css', '.a {}\n.b {\n  transition:\n    1s;\n}')).toEqual(['x.css:3 transition: all'])
    })

    it('see-through bars', () => {
      for (const bad of [
        '"sticky top-0 z-50 bg-bg-navy/95"',
        '"fixed inset-x-0 bottom-0 sm:bg-bg-purple/90"',
        "'color-mix(in srgb, var(--color-bg-navy) 80%, transparent)'",
      ]) {
        expect(isSeeThroughBar(bad), bad).toBe(true)
      }
      for (const good of [
        '"sticky top-0 z-50 bg-bg-navy"',
        '"fixed inset-0 z-50 bg-black/80"',
        '"rounded-lg bg-accent-500/20 px-2"',
        "'color-mix(in srgb, var(--color-bg-navy) 80%, var(--color-bg-purple))'",
      ]) {
        expect(isSeeThroughBar(good), good).toBe(false)
      }
    })

    it('pills', () => {
      for (const bad of [
        '"rounded-full px-2 py-0.5 text-xs"',
        '`inline-flex rounded-full border px-3 py-1 ${x}`',
        "'sm:px-4 rounded-full'",
        '"rounded-full px-2.5"',
      ]) {
        expect(isPill(bad), bad).toBe(true)
      }
      for (const good of [
        '"h-5 w-5 rounded-full"',
        '"min-w-[20px] rounded-full px-1.5 py-0.5"',
        '"rounded-full px-1"',
        '"rounded-md px-4 py-2"',
        '"rounded-sm px-2 py-0.5"',
      ]) {
        expect(isPill(good), good).toBe(false)
      }
    })

    it('literal extraction keeps a multi-line template as one literal', () => {
      const src = 'const a = `\n  rounded-full\n  px-3\n`\nconst b = "rounded-full"'
      const found = literals(src)
      expect(found).toHaveLength(2)
      expect(isPill(found[0].text)).toBe(true)
      expect(isPill(found[1].text)).toBe(false)
    })
  })
})
