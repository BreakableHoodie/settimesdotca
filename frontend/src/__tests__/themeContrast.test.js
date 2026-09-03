// --- Durable guard: theme-token colour pairs must clear AA on ALL FOUR themes
//
// The gap #1074's guard explicitly left open, now closed. That one checks pairs
// of FIXED colours (a Tailwind palette background against text-white/black).
// This one checks the pairs that CHANGE per theme, which is where the harder
// bug lives: a pair can be comfortable on the dark themes and unreadable on a
// light one, because `--color-bg-navy` is `#0c0f1a` on midnight-ember but
// `#fff8f1` on daybreak. A single ratio would be meaningless; each theme has to
// be resolved and checked on its own.
//
// It has bitten twice:
//
//   #617  a `text-bg-navy` consumer sat at ~2.3-2.9:1 until the paired gradient
//         was darkened to match --color-accent-500.
//   this  ComingUp.jsx's "Up Next" banner -- role="status", aria-live="polite",
//         the show-day element telling fans what is playing next -- rendered
//         `text-bg-navy` on a hand-rolled `from-accent-500 to-primary-600`
//         gradient. On arctic-night that `to` stop is indigo #4f46e5 against
//         navy #0f172a text: 2.84:1. Fine on the other three themes, which is
//         exactly why nobody saw it.
//
// WHY AXE CANNOT DO THIS, twice over. It renders one theme per run, so three of
// the four are never evaluated at all; and both incidents were GRADIENTS, which
// axe reports as `incomplete` ("background color could not be determined due to
// a background gradient") rather than as a violation. Reading the declared
// colours has neither limitation: a gradient stop is just another colour, and a
// theme is just another lookup.
//
// SCOPE: public surfaces only. `frontend/src/admin/` is dark-pinned by
// AdminApp.jsx (`<div data-theme="midnight-ember">`), so its colours never vary
// by theme and CLAUDE.md documents its hardcoded values as intentional.
//
// A pair is only checked when BOTH sides resolve. A className naming a
// background but inheriting its text colour (or vice versa) is skipped, because
// this scan cannot know what it inherits — that is a real limit, not an
// oversight, and it is why the fixed-colour guard in linkButtonContrast.test.js
// is a separate, complementary check rather than merged into this one.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import {
  AA_NORMAL_TEXT,
  contrastRatio,
  loadAppThemes,
  loadTailwindPalette,
  parseColour,
  resolveToken,
  toHex,
} from '../test/contrastMath.js'

const PUBLIC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP_DIRS = new Set(['admin', '__tests__', 'test', 'node_modules', 'assets'])

const palette = loadTailwindPalette()
const themeData = loadAppThemes()

function collectSourceFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue
      collectSourceFiles(full, found)
    } else if (/\.jsx?$/.test(entry)) {
      found.push(full)
    }
  }
  return found
}

// Utility classes that look like colours but are not, or that carry no paint.
//
// Only the DIRECTION utilities are excluded (`bg-linear-to-br`,
// `bg-gradient-to-r`), NOT every token beginning with "gradient". An earlier
// version excluded the whole prefix and silently dropped `bg-gradient-accent` --
// the named theme gradient this guard exists to check -- from the scan entirely.
// The mutation test still went red, because the mutant reverts ComingUp to
// `from-`/`to-` classes, which ARE scanned: it proved the guard catches that
// revert, not that it covered the fixed code. A guard can be non-vacuous against
// one mutation and blind to the thing it was written for. Caught by CodeRabbit
// on #1077; the coverage assertion below now pins it.
const NON_COLOUR =
  /^(gradient-to|linear-to|conic|radial|clip|none|transparent|current|inherit|auto|balance|pretty|wrap|nowrap|ellipsis|center|left|right|justify|start|end|xs|sm|base|lg|xl|\d)/

function classPairs(className) {
  const classes = className.split(/\s+/)
  const backgrounds = []
  const foregrounds = []
  for (const cls of classes) {
    // Only unprefixed, unmodified utilities. A `hover:`/`dark:` variant paints a
    // state this scan cannot pair reliably with a foreground.
    const bg = cls.match(/^(?:bg|from|to|via)-([\w-]+)$/)
    if (bg && !NON_COLOUR.test(bg[1])) backgrounds.push(bg[1])
    const fg = cls.match(/^text-([\w-]+)$/)
    if (fg && !NON_COLOUR.test(fg[1])) foregrounds.push(fg[1])
  }
  return { backgrounds, foregrounds }
}

describe('theme-token contrast — every theme, not just the one axe renders', () => {
  test('all four themes are parsed out of index.css', () => {
    // The parser strips CSS comments first because index.css says "@theme" in
    // prose; without that, phantom blocks swallowed two real themes and this
    // guard silently checked half of what it claimed to. Asserting the count is
    // how that stays caught.
    expect(themeData.themes.sort()).toEqual(['arctic-night', 'daybreak', 'midnight-ember', 'silver-lining'])
  })

  test('the resolver agrees with the values declared in index.css', () => {
    // Instrument check. bg-navy is the token whose per-theme swing causes the
    // bugs, so it is the one worth pinning.
    expect(toHex(resolveToken('bg-navy', 'midnight-ember', themeData, palette)[0])).toBe('#0c0f1a')
    expect(toHex(resolveToken('bg-navy', 'daybreak', themeData, palette)[0])).toBe('#fff8f1')
    // A gradient token must resolve to MULTIPLE stops, or the gradient half of
    // this guard is silently checking one colour.
    expect(resolveToken('gradient-accent', 'midnight-ember', themeData, palette).length).toBeGreaterThan(1)
  })

  const files = collectSourceFiles(PUBLIC_ROOT)

  test('the scan finds public source to check', () => {
    expect(files.length, 'no public source files found — the walker is broken').toBeGreaterThan(20)
  })

  // THE GAP THIS GUARD ACTUALLY SHIPPED WITH, now pinned.
  //
  // `NON_COLOUR` excluded every token starting with "gradient", so
  // `bg-gradient-accent` — the named theme gradient, and the fix applied to
  // ComingUp — was dropped from the scan entirely. Nothing caught it: the
  // mutation test reverts ComingUp to `from-`/`to-` classes, which ARE scanned,
  // so it went red for a reason unrelated to the fixed code's coverage.
  //
  // Asserting the extractor REACHES the pair is a different claim from asserting
  // the pair passes. Only this one fails if the exclusion widens again.
  test('the extractor actually reaches named gradient backgrounds', () => {
    const { backgrounds, foregrounds } = classPairs('bg-gradient-accent px-4 py-2.5 text-bg-navy shadow-lg sm:py-3')
    expect(backgrounds, 'bg-gradient-accent must be scanned, not skipped as a direction utility').toContain(
      'gradient-accent'
    )
    expect(foregrounds).toContain('bg-navy')

    // ...while the direction utilities stay excluded, or every gradient element
    // pairs its text against a meaningless "to-br" token.
    expect(classPairs('bg-linear-to-br from-purple-500 text-white').backgrounds).not.toContain('linear-to-br')
  })

  // Alpha is a number OR a percentage in CSS, and the percentage form failed in
  // the dangerous direction: `parseFloat('50%')` is 50, which is not < 1, so a
  // half-transparent colour read as fully opaque. Same shape as reading
  // rgba(255,255,255,0.05) as #ffffff, which produced "1.00:1" sitewide.
  test('translucent colours are skipped, in every alpha notation', () => {
    expect(parseColour('rgba(255, 255, 255, 0.05)'), 'decimal alpha').toBeUndefined()
    expect(parseColour('rgb(255 255 255 / 50%)'), 'percentage alpha').toBeUndefined()
    expect(parseColour('#ffffff80'), '8-digit hex alpha').toBeUndefined()
    // ...and opaque colours in the same notations still resolve.
    expect(parseColour('rgb(255 255 255)')).toEqual([255, 255, 255])
    expect(parseColour('rgb(255 255 255 / 100%)')).toEqual([255, 255, 255])
  })

  test('every resolvable pair meets AA on all four themes', () => {
    const failures = []
    let checked = 0

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const { backgrounds, foregrounds } = classPairs(match[1] || match[2] || '')
        if (!backgrounds.length || !foregrounds.length) continue

        for (const bgToken of backgrounds) {
          for (const fgToken of foregrounds) {
            for (const theme of themeData.themes) {
              const bgStops = resolveToken(bgToken, theme, themeData, palette)
              const fg = resolveToken(fgToken, theme, themeData, palette)
              if (!bgStops || !fg) continue
              checked++
              for (const stop of bgStops) {
                const ratio = contrastRatio(fg[0], stop)
                if (ratio >= AA_NORMAL_TEXT) continue
                failures.push(
                  `${file.replace(PUBLIC_ROOT, 'src')}: bg-${bgToken} + text-${fgToken} = ${ratio.toFixed(2)}:1 on "${theme}" (stop ${toHex(stop)} vs ${toHex(fg[0])}, needs ${AA_NORMAL_TEXT}:1)`
                )
              }
            }
          }
        }
      }
    }

    // A run that resolved nothing proves nothing and must not read as green —
    // the same rule as the empty-scan check above.
    expect(checked, 'resolved no theme pairs at all — the extractor or parser is broken').toBeGreaterThan(50)
    expect([...new Set(failures)], `Theme contrast failures:\n  ${[...new Set(failures)].join('\n  ')}`).toEqual([])
  })
})
