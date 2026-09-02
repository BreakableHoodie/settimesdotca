/**
 * Status-badge contrast on the LIGHT themes (WCAG AA, 4.5:1).
 *
 * `Badge.jsx` renders every status variant as `bg-<c>-500/20 text-<c>-400`. On
 * the dark themes the -400 tokens are light reds/greens on a dark surface and
 * pass comfortably. On the two LIGHT themes they are dark text over a 20% wash
 * of the same hue, and that composite is where the ratio collapses.
 *
 * This was live and unnoticed. The e2e a11y sweep only scans what happens to be
 * on screen, and a status badge is rare: `error` appears solely on a LIVE event
 * card. It surfaced only because an admin E2E spec created an event that
 * rendered as live, and axe then measured the "LIVE NOW" badge at 4.08:1 on
 * daybreak and 4.35:1 on silver-lining. Seven of the eight variant/theme
 * combinations were failing; only info/silver-lining passed.
 *
 * That is the worst possible surface to have it on -- the badge is only ever
 * shown while a show is actually happening.
 *
 * This test computes the ratios directly from index.css, so it covers every
 * variant on every light theme regardless of whether any page renders one
 * today. A browser-based check cannot make that guarantee.
 *
 * Composited against `--color-bg-purple`, the DARKEST light-theme surface a
 * card sits on. A darker backdrop under a 20% wash leaves less contrast for
 * dark text, so passing here implies passing on the lighter surfaces too.
 */
import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CSS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../index.css')
const LIGHT_THEMES = ['daybreak', 'silver-lining']
const VARIANTS = ['error', 'success', 'warning', 'info']
const MIN_RATIO = 4.5
const FILL_ALPHA = 0.2 // the /20 in bg-<c>-500/20

function themeBlock(css, theme) {
  const start = css.indexOf(`[data-theme='${theme}']`)
  expect(start, `theme block for ${theme} must exist in index.css`).toBeGreaterThan(-1)
  const end = css.indexOf('\n}', start)
  return css.slice(start, end)
}

function token(block, name) {
  const value = block.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]
  // A missing token means the variant moved or was renamed -- fail loudly
  // rather than silently scoring zero combinations.
  expect(value, `--color-${name} must be defined`).toBeTruthy()
  return value
}

const toRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const channel = c => (c / 255 <= 0.03928 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4))
const luminance = rgb => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])

function contrast(fg, bg) {
  const [hi, lo] = [luminance(toRgb(fg)), luminance(toRgb(bg))].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

function composite(fg, bg, alpha) {
  const [f, b] = [toRgb(fg), toRgb(bg)]
  return (
    '#' +
    f
      .map((v, i) =>
        Math.round(v * alpha + b[i] * (1 - alpha))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

describe('status badge contrast on the light themes', () => {
  const css = readFileSync(CSS_PATH, 'utf8')

  for (const theme of LIGHT_THEMES) {
    for (const variant of VARIANTS) {
      test(`${theme}: ${variant} badge text meets ${MIN_RATIO}:1`, () => {
        const block = themeBlock(css, theme)
        const surface = token(block, 'bg-purple')
        const text = token(block, `${variant}-400`)
        const fill = token(block, `${variant}-500`)

        const background = composite(fill, surface, FILL_ALPHA)
        const ratio = contrast(text, background)

        expect(
          ratio,
          `${theme} ${variant}: text ${text} on ${background} (${fill} at ${FILL_ALPHA * 100}% over ${surface}) ` +
            `= ${ratio.toFixed(2)}:1, needs ${MIN_RATIO}:1`
        ).toBeGreaterThanOrEqual(MIN_RATIO)
      })
    }
  }

  // Guards the guard: if the ratio maths were wrong in a way that scored
  // everything as passing, every assertion above would be vacuous. Two known
  // pairs pin it -- black on white is the maximum, and a colour against itself
  // is the minimum.
  test('the contrast calculation itself is correct', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrast('#b91c1c', '#b91c1c')).toBeCloseTo(1, 5)
    // The pre-fix error/daybreak case, as measured by axe at 4.08:1.
    expect(contrast('#b91c1c', composite('#dc2626', '#f8eadd', FILL_ALPHA))).toBeCloseTo(4.09, 1)
  })
})
