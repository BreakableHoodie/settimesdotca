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
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { AA_NORMAL_TEXT, contrastRatio, loadTailwindPalette, resolveFixedColour, toHex } from '../test/contrastMath.js'

const PAGE = join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'BandProfilePage.jsx')

// The colour maths, the Tailwind palette loader and the oklch conversion live in
// src/test/contrastMath.js and are SHARED with themeContrast.test.js. They were
// duplicated here at first, which is the CACHE_BROWSE drift class exactly: two
// copies that can disagree while both stay green.
const palette = loadTailwindPalette()

/** A colour is resolvable only if it is FIXED. Theme tokens return undefined
 * ON PURPOSE — see the scope note in the header; themeContrast.test.js owns them. */
const resolveColour = token => resolveFixedColour(token, palette)

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
    expect(toHex(resolveColour('green-600'))).toBe('#00a63e')
    expect(toHex(resolveColour('lime-500'))).toBe('#7ccf00')
    expect(toHex(resolveColour('pink-500'))).toBe('#f6339a')
    expect(toHex(resolveColour('blue-600'))).toBe('#155dfc')
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
