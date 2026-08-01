// Guards the WCAG-contrast root cause behind six confirmed light-theme
// failures (#617): axe-core's color-contrast rule can't resolve backgrounds
// painted by a CSS gradient (BandCard's `bg-gradient-accent`) — it reports
// those elements as `incomplete`, not `violations`, so
// e2e/accessibility/theme-contrast.spec.js (which only asserts on
// `results.violations`) never caught the under-tuned gradient start stop.
// This test parses the actual token values out of index.css and checks
// contrast directly, so it fails offline/fast whenever a token regresses —
// no browser, no axe, no gradient-resolution blind spot.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CSS_PATH = path.resolve(__dirname, '../index.css')
const css = fs.readFileSync(CSS_PATH, 'utf8')

const THEMES = ['midnight-ember', 'arctic-night', 'daybreak', 'silver-lining']
const MIN_CONTRAST = 4.5

// --- Minimal CSS custom-property extraction -------------------------------
// Only needs to handle the flat `--token: value;` declarations index.css
// actually uses inside `@theme { ... }` and `[data-theme='x'] { ... }` blocks
// (no nested braces in either), so a simple "from the opening brace to the
// next line that is just `}`" slice is sufficient and doesn't need a full
// CSS parser.
function extractBlock(source, selectorRegex) {
  const match = selectorRegex.exec(source)
  if (!match) return null
  const start = match.index + match[0].length
  const end = source.indexOf('\n}', start)
  if (end === -1) throw new Error(`Unterminated block for ${selectorRegex}`)
  return source.slice(start, end)
}

function getRawVar(block, varName) {
  if (!block) return null
  const re = new RegExp(`(?:^|\\n)\\s*${varName}:\\s*([^;]+);`)
  const match = re.exec(block)
  return match ? match[1].trim() : null
}

const rootBlock = extractBlock(css, /@theme\s*\{/)
if (!rootBlock) {
  throw new Error('themeTokens.test.js could not locate the @theme {...} root block in index.css')
}

const themeBlocks = Object.fromEntries(
  THEMES.map(theme => [theme, extractBlock(css, new RegExp(`\\[data-theme=['"]${theme}['"]\\]\\s*\\{`))])
)

for (const theme of THEMES) {
  if (!themeBlocks[theme]) {
    throw new Error(`themeTokens.test.js could not locate the [data-theme='${theme}'] block in index.css`)
  }
}

// Per-theme blocks only declare overrides — tokens they omit (e.g.
// arctic-night never redeclares --background-image-gradient-accent or the
// status ramps) fall through to the @theme root default, exactly like the
// browser's CSS custom-property cascade.
function resolveHex(varName, theme) {
  const value = getRawVar(themeBlocks[theme], varName) || getRawVar(rootBlock, varName)
  if (!value) {
    throw new Error(`themeTokens.test.js: ${varName} is not defined for [data-theme='${theme}'] or the @theme root`)
  }
  return value
}

function resolveGradientAccentStops(theme) {
  const raw =
    getRawVar(themeBlocks[theme], '--background-image-gradient-accent') ||
    getRawVar(rootBlock, '--background-image-gradient-accent')
  if (!raw) {
    throw new Error(`themeTokens.test.js: --background-image-gradient-accent is not defined for theme "${theme}"`)
  }
  const match = /linear-gradient\([^,]+,\s*(#[0-9a-fA-F]{3,8})\s*0%,\s*(#[0-9a-fA-F]{3,8})\s*100%\)/.exec(raw)
  if (!match) {
    throw new Error(
      `themeTokens.test.js: could not parse start/end stops out of --background-image-gradient-accent for theme "${theme}": ${raw}`
    )
  }
  return { start: match[1], end: match[2] }
}

// --- WCAG 2.x contrast (relative luminance + contrast ratio) --------------
function hexToRgb(hex) {
  let h = hex.replace('#', '')
  if (h.length === 3 || h.length === 4) {
    h = h
      .split('')
      .map(c => c + c)
      .join('')
  }
  const num = parseInt(h.slice(0, 6), 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function relativeLuminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const channel = c / 255
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function contrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(hexToRgb(hexA))
  const lumB = relativeLuminance(hexToRgb(hexB))
  const [lighter, darker] = lumA > lumB ? [lumA, lumB] : [lumB, lumA]
  return (lighter + 0.05) / (darker + 0.05)
}

function expectMinContrast(theme, tokenLabel, fgHex, bgHex) {
  const ratio = contrastRatio(fgHex, bgHex)
  expect(
    ratio,
    `[${theme}] ${tokenLabel} (${fgHex}) against --color-bg-navy (${bgHex}) computes to ${ratio.toFixed(2)}:1, ` +
      `below the ${MIN_CONTRAST}:1 WCAG AA floor`
  ).toBeGreaterThanOrEqual(MIN_CONTRAST)
}

describe('theme token contrast (WCAG AA, 4.5:1)', () => {
  describe.each(THEMES)('%s', theme => {
    const bgNavy = resolveHex('--color-bg-navy', theme)
    const accent500 = resolveHex('--color-accent-500', theme)
    const warning400 = resolveHex('--color-warning-400', theme)
    const { start: gradientStart, end: gradientEnd } = resolveGradientAccentStops(theme)

    // Root-cause regression guard for #617: BandCard's selected/"Live Now"
    // state renders `bg-gradient-accent` behind `text-bg-navy` — both the
    // start and end stops must independently clear 4.5:1 against bg-navy,
    // since text can sit over either end of the gradient depending on card size.
    it('gradient-accent start stop clears 4.5:1 against bg-navy', () => {
      expectMinContrast(theme, '--background-image-gradient-accent start stop', gradientStart, bgNavy)
    })

    it('gradient-accent end stop clears 4.5:1 against bg-navy', () => {
      expectMinContrast(theme, '--background-image-gradient-accent end stop', gradientEnd, bgNavy)
    })

    // warning-400 backs the "Starts in Xm" .soon-pill text and other
    // warning-toned copy directly on paper/card backgrounds.
    it('warning-400 clears 4.5:1 against bg-navy', () => {
      expectMinContrast(theme, '--color-warning-400', warning400, bgNavy)
    })

    // Bonus guard: accent-500 is the token gradient-accent's stops are meant
    // to match (VenueStrip and BandCard both use it directly against
    // bg-navy/bg-purple) — same bug class, cheap to also pin down here.
    it('accent-500 clears 4.5:1 against bg-navy', () => {
      expectMinContrast(theme, '--color-accent-500', accent500, bgNavy)
    })
  })
})
