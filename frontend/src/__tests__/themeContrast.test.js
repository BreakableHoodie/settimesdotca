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
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  AA_NORMAL_TEXT,
  contrastRatio,
  loadAppThemes,
  loadTailwindPalette,
  resolveToken,
  toHex,
} from '../test/contrastMath.js'

const PUBLIC_ROOT = join(process.cwd(), 'src')
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
const NON_COLOUR =
  /^(gradient|linear|clip|none|transparent|current|inherit|auto|balance|pretty|wrap|nowrap|ellipsis|center|left|right|justify|start|end|xs|sm|base|lg|xl|\d)/

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
