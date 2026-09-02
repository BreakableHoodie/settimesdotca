// --- Durable guard: artist link buttons must clear WCAG AA (#1074) ---------
//
// Five of the eight artist link buttons on BandProfilePage shipped below the
// 4.5:1 AA floor with white labels: Bandcamp `green-600` (3.22:1), Spotify
// `green-500` (2.22:1), Linktree `lime-500` (1.95:1), and the two GRADIENT
// buttons -- Instagram `purple-500`->`pink-500` (4.12 / 3.58:1) and Apple Music
// `pink-500`->`red-600` (3.58 / 4.77:1).
//
// WHY THIS IS A SOURCE SCAN AND NOT AN AXE RUN. The full-page axe sweep added
// in #1073 catches the three SOLID buttons and is structurally blind to the two
// gradient ones. axe reports those as `incomplete`, not as violations:
//
//   target: [".from-purple-500"]
//   "Element's background color could not be determined due to a background
//    gradient"
//
// `incomplete` means UNVERIFIED. A green axe run says nothing about them, so no
// amount of E2E coverage would ever have flagged the Instagram button -- the
// same "absence of evidence read as evidence of absence" class this repo keeps
// paying for. Reading the DECLARED colours removes the blind spot entirely,
// because a gradient stop is just another declared colour here.
//
// The seed fixture was a second, independent blind spot: `Future Sound`
// (database/seed-test-data.sql) USED TO carry only `website` and `instagram`, so
// the green and lime buttons never rendered under test at all. That is the
// fixture-vacuity class CLAUDE.md documents under Band Announcements, where ten
// test files all seeded `verified = 1`. The same commit as this guard widened
// that row to all eight BAND_LINK_FIELD_KEYS, so axe can now at least see the
// SOLID buttons. This guard still does not depend on fixture data at all, which
// is the third reason it is a source scan -- and the reason it, not the fixture
// change, is what covers the gradients.
//
// COLOURS COME FROM THE INSTALLED TAILWIND, never a hardcoded table, so the
// palette cannot drift from the dependency that actually renders the page. The
// oklch->sRGB conversion below was validated against the browser: all eight
// spot-checked colours matched the rendered hex exactly, and `green-600` gives
// 3.22:1 where axe independently measured 3.21:1.
//
// SCOPE, stated honestly: this checks pairs of FIXED colours -- a Tailwind
// palette background against `text-white`/`text-black`. It deliberately skips
// pairs involving a THEME TOKEN (`bg-accent-*`, `text-bg-navy`), because those
// resolve to four different values across the four themes and a single ratio
// would be meaningless. That is a real remaining gap, and it has bitten before:
// `--color-bg-navy` is `#0c0f1a` on the dark themes but `#fff8f1` / `#f8fafc`
// on the light ones, and #617 fixed a `text-bg-navy` consumer sitting at
// ~2.3-2.9:1. Theme-pair coverage is tracked separately; do not read this
// guard as proving those safe.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const PAGE = join(process.cwd(), 'src/pages/BandProfilePage.jsx')
const THEME_CSS = join(process.cwd(), 'node_modules/tailwindcss/theme.css')

const AA_NORMAL_TEXT = 4.5

/** Every `--color-<name>` Tailwind declares, as its raw CSS value. */
function loadPalette() {
  const css = readFileSync(THEME_CSS, 'utf8')
  const palette = new Map()
  for (const match of css.matchAll(/--color-([a-z]+-\d{2,3}):\s*([^;]+);/g)) {
    palette.set(match[1], match[2].trim())
  }
  return palette
}

/**
 * oklch() -> sRGB, clamped the way a browser rasterises an out-of-gamut triple.
 * Tailwind v4 declares its whole palette in oklch, so there is no hex to read;
 * parsing the three numbers as if they were RGB (which an early draft of this
 * did) yields confident nonsense like "green-600 is #3b3b29".
 */
function oklchToRgb(value) {
  const match = value.match(/oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/)
  if (!match) return undefined
  const lightness = match[2] === '%' ? parseFloat(match[1]) / 100 : parseFloat(match[1])
  const chroma = parseFloat(match[3])
  const hue = (parseFloat(match[4]) * Math.PI) / 180
  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(channel => {
    const encoded = channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.pow(Math.max(channel, 0), 1 / 2.4) - 0.055
    return Math.max(0, Math.min(255, Math.round(encoded * 255)))
  })
}

function relativeLuminance([r, g, b]) {
  const channel = value => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(foreground, background) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

const palette = loadPalette()

/** A colour is resolvable only if it is fixed. Theme tokens return undefined
 * ON PURPOSE — see the scope note in the header. */
function resolveColour(token) {
  if (token === 'white') return [255, 255, 255]
  if (token === 'black') return [0, 0, 0]
  const declared = palette.get(token)
  return declared ? oklchToRgb(declared) : undefined
}

// The link buttons share one distinctive shape: a 44px minimum touch target on
// an inline-flex anchor. Matching on that rather than on a colour keeps a newly
// added button in scope by default — the failure mode to avoid is a guard that
// silently covers fewer things over time.
const BUTTON_CLASS_RE = /className="(inline-flex min-h-\[44px\][^"]*)"/g

function extractButtons(source) {
  return [...source.matchAll(BUTTON_CLASS_RE)].map(match => {
    const classes = match[1].split(/\s+/)
    const backgrounds = []
    for (const cls of classes) {
      // A gradient stop is a background like any other: this is the half an
      // axe run cannot see.
      const stop = cls.match(/^(?:bg|from|to|hover:bg)-([a-z]+-\d{2,3})$/)
      if (stop) backgrounds.push({ cls, token: stop[1] })
      else if (/^(?:bg|from|to|hover:bg)-/.test(cls)) backgrounds.push({ cls, token: undefined })
    }
    const fg = classes.find(cls => /^text-(?:white|black|bg-navy|[a-z]+-\d{2,3})$/.test(cls))
    return { classes: match[1], backgrounds, foreground: fg?.replace(/^text-/, '') }
  })
}

describe('artist link buttons — declared colours clear WCAG AA (#1074)', () => {
  const source = readFileSync(PAGE, 'utf8')
  const buttons = extractButtons(source)

  // An empty scan is a GATE FAILURE, never a silent pass. If the button markup
  // is restyled and stops matching, this guard must go red rather than report
  // all-clear while checking nothing — the `lint-md`/`.PHONY` failure shape.
  test('the scan actually finds the link buttons', () => {
    expect(
      buttons.length,
      `No element matched ${BUTTON_CLASS_RE} in BandProfilePage.jsx. The button markup likely changed — update this guard rather than deleting it.`
    ).toBeGreaterThanOrEqual(8)
  })

  test('the oklch conversion agrees with the rendered browser values', () => {
    // Guarding the instrument, not the page. Every value here was read out of a
    // real Chromium render; if the conversion regresses, the ratios below
    // become meaningless and would fail silently in the passing direction.
    const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('')
    expect(hex(resolveColour('green-600'))).toBe('#00a63e')
    expect(hex(resolveColour('lime-500'))).toBe('#7ccf00')
    expect(hex(resolveColour('pink-500'))).toBe('#f6339a')
    expect(hex(resolveColour('blue-600'))).toBe('#155dfc')
    expect(+contrastRatio([255, 255, 255], resolveColour('green-600')).toFixed(2)).toBeCloseTo(3.22, 2)
  })

  test('every fixed-colour pair meets 4.5:1', () => {
    const failures = []
    let checked = 0

    for (const button of buttons) {
      const foreground = button.foreground && resolveColour(button.foreground)
      // Theme-token foreground (text-bg-navy) — out of scope, see header.
      if (!foreground) continue

      for (const background of button.backgrounds) {
        const resolved = background.token && resolveColour(background.token)
        // Theme-token background (bg-accent-500) — out of scope, see header.
        if (!background.token) continue
        if (!resolved) {
          failures.push(
            `${background.cls}: not found in tailwindcss/theme.css. If this is a new palette entry, the guard needs updating; if it is a typo, Tailwind is emitting no CSS for it.`
          )
          continue
        }
        checked++
        const ratio = contrastRatio(foreground, resolved)
        if (ratio < AA_NORMAL_TEXT) {
          failures.push(
            `${background.cls} on text-${button.foreground} = ${ratio.toFixed(2)}:1 (needs ${AA_NORMAL_TEXT}:1). These labels are 14px/600, which is NOT WCAG "large text".`
          )
        }
      }
    }

    // Same reasoning as the empty-scan test: a run that resolved nothing proves
    // nothing, and must not read as green.
    expect(checked, 'resolved no fixed colour pairs at all — the extractor is broken').toBeGreaterThan(8)
    expect(failures, `WCAG AA failures in BandProfilePage link buttons:\n  ${failures.join('\n  ')}`).toEqual([])
  })
})
