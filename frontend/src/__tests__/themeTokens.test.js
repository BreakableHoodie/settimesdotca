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

// gradient-card's stops are `rgba(...)` with real alpha (0.9-0.96), unlike
// gradient-accent's opaque hex stops above — the card itself is a
// translucent overlay on the page background, not a solid fill. Returns both
// stops as {rgb, alpha} so the caller can composite each over the page
// background and use whichever is darker (#721).
function resolveGradientCardStops(theme) {
  const raw =
    getRawVar(themeBlocks[theme], '--background-image-gradient-card') ||
    getRawVar(rootBlock, '--background-image-gradient-card')
  if (!raw) {
    throw new Error(`themeTokens.test.js: --background-image-gradient-card is not defined for theme "${theme}"`)
  }
  const match =
    /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)\s*0%,\s*rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)\s*100%/.exec(
      raw
    )
  if (!match) {
    throw new Error(
      `themeTokens.test.js: could not parse rgba start/end stops out of --background-image-gradient-card for theme "${theme}": ${raw}`
    )
  }
  const [, r1, g1, b1, a1, r2, g2, b2, a2] = match
  return {
    start: { rgb: [Number(r1), Number(g1), Number(b1)], alpha: a1 === undefined ? 1 : Number(a1) },
    end: { rgb: [Number(r2), Number(g2), Number(b2)], alpha: a2 === undefined ? 1 : Number(a2) },
  }
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

// `color-mix(in srgb, C P%, transparent)` painted over an opaque backdrop B
// alpha-blends to `result = (P/100)*C + (1 - P/100)*B` per channel — this is
// what a translucent-tint background (e.g. .soon-pill's) actually renders
// as. Text-vs-raw-token contrast checks (like the ones above) are blind to
// this: they measure against an opaque background that never appears
// on-screen for a tinted element.
function blend(fgHex, bgHex, alphaPercent) {
  const [fr, fg, fb] = hexToRgb(fgHex)
  const [br, bg, bb] = hexToRgb(bgHex)
  const alpha = alphaPercent / 100
  const mixChannel = (f, b) => Math.round(alpha * f + (1 - alpha) * b)
  return `#${[mixChannel(fr, br), mixChannel(fg, bg), mixChannel(fb, bb)]
    .map(c => c.toString(16).padStart(2, '0'))
    .join('')}`
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')}`
}

// gradient-card is a translucent overlay (real rgba alpha, not an opaque
// fill) painted over the page background, so a gradient-card stop has to be
// resolved to what actually renders on screen — the stop alpha-blended over
// the page backdrop — before anything else (e.g. the pill tint) can be
// composited on top of it in turn (#721).
function compositeCardStopOverPage(stop, pageBgHex) {
  return blend(rgbToHex(stop.rgb), pageBgHex, stop.alpha * 100)
}

// Pulls the `.soon-pill` rule's actual `background: color-mix(...)` and
// `color: var(...)` declarations out of index.css, instead of hardcoding a
// copy of the tint token/percent/text-token here — so this guard tracks the
// real CSS and can't silently drift from it.
function resolvePillTintSpec() {
  const soonPillBlock = extractBlock(css, /\.soon-pill\s*\{/)
  if (!soonPillBlock) {
    throw new Error("themeTokens.test.js could not locate the '.soon-pill' rule in index.css")
  }
  const backgroundRaw = getRawVar(soonPillBlock, 'background')
  const colorRaw = getRawVar(soonPillBlock, 'color')
  if (!backgroundRaw || !colorRaw) {
    throw new Error("themeTokens.test.js: '.soon-pill' is missing a background or color declaration")
  }
  const tintMatch = /color-mix\(in srgb,\s*var\((--[\w-]+)\)\s+(\d+(?:\.\d+)?)%,\s*transparent\)/.exec(backgroundRaw)
  if (!tintMatch) {
    throw new Error(`themeTokens.test.js: could not parse '.soon-pill' background color-mix(): ${backgroundRaw}`)
  }
  const textMatch = /var\((--[\w-]+)\)/.exec(colorRaw)
  if (!textMatch) {
    throw new Error(`themeTokens.test.js: could not parse '.soon-pill' color token: ${colorRaw}`)
  }
  return { tintToken: tintMatch[1], tintPercent: Number(tintMatch[2]), textToken: textMatch[1] }
}

const pillSpec = resolvePillTintSpec()

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

    // Bonus guard for the raw design-system value itself (mirrors accent-500
    // below) — not a claim that any consumer renders warning-400 text on a
    // bare paper background. In practice every current UI consumer (e.g.
    // .soon-pill) pairs warning-400 with a same-hue translucent tint, which
    // is exactly what the composited assertion right below this one covers.
    it('warning-400 clears 4.5:1 against bg-navy', () => {
      expectMinContrast(theme, '--color-warning-400', warning400, bgNavy)
    })

    // Root-cause regression guard for the MAJOR finding on #720: the raw
    // warning-400-vs-bg-navy check above passes (~4.77:1) but that pairing
    // never renders — .soon-pill's text sits on its OWN
    // `color-mix(in srgb, warning-400 15%, transparent)` tint, which
    // (per `blend()` above) pulls the effective background toward
    // warning-400's hue and erodes the real on-screen contrast. This
    // composites the tint the same way the browser does and checks the
    // pill's actual text token (--color-warning-pill-text) against that
    // composited result.
    //
    // The pill only ever renders on BandCard's default `bg-gradient-card`
    // state (BandCard.jsx swaps to the opaque `.soon-pill--dark` style
    // whenever the amber `bg-gradient-accent` background is active), and
    // gradient-card is a translucent rgba overlay — NOT near-identical to
    // bg-navy, contrary to what this comment used to claim (#721). On
    // daybreak, gradient-card's darkest stop is rgba(247,234,220,0.92)
    // against bg-navy #fff8f1 — visibly darker, which erodes contrast for
    // the pill's dark text. So the real backdrop for the pill tint is
    // gradient-card's stop, itself composited over the page background
    // (bg-navy), not bg-navy directly. Both gradient-card stops are checked
    // and the lower (worse) resulting ratio is asserted, since the pill can
    // sit anywhere along the card's gradient.
    it('soon-pill text clears 4.5:1 against its composited (color-mix over gradient-card) pill background', () => {
      const tintColor = resolveHex(pillSpec.tintToken, theme)
      const textColor = resolveHex(pillSpec.textToken, theme)
      const cardStops = resolveGradientCardStops(theme)

      const results = [cardStops.start, cardStops.end].map(stop => {
        const cardBg = compositeCardStopOverPage(stop, bgNavy)
        const pillBg = blend(tintColor, cardBg, pillSpec.tintPercent)
        return { cardBg, pillBg, ratio: contrastRatio(textColor, pillBg) }
      })
      const worst = results[0].ratio <= results[1].ratio ? results[0] : results[1]

      expect(
        worst.ratio,
        `[${theme}] .soon-pill text (${pillSpec.textToken}=${textColor}) against its composited pill ` +
          `background (${pillSpec.tintPercent}% ${pillSpec.tintToken}=${tintColor} color-mixed over the ` +
          `gradient-card stop composited over --color-bg-navy=${bgNavy} => ${worst.cardBg} => ${worst.pillBg}) ` +
          `computes to ${worst.ratio.toFixed(2)}:1, below the ${MIN_CONTRAST}:1 WCAG AA floor`
      ).toBeGreaterThanOrEqual(MIN_CONTRAST)
    })

    // BandCard's artist-name pill (#729). It carries `bg-surface`, which is
    // rgba with 4-5% alpha in every theme — so it barely tints the card and
    // the text effectively reads against gradient-card itself. #729 asked for
    // this check explicitly because BandCard has already shipped one WCAG
    // failure (#720, the selected-card gradient at 2.3:1), and nothing else
    // covers the pairing: BandCard.test.jsx asserts the CLASSES are
    // `bg-surface border-border`, which says nothing about whether the result
    // is readable. Both gradient-card stops are checked and the worse ratio
    // asserted, since the pill sits anywhere along the card.
    it('BandCard name-pill text clears 4.5:1 against bg-surface composited over gradient-card', () => {
      const surfaceRaw = resolveHex('--color-surface', theme)
      const surfaceMatch = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/.exec(surfaceRaw)
      expect(surfaceMatch, `[${theme}] could not parse --color-surface: ${surfaceRaw}`).toBeTruthy()
      const surfaceHex = rgbToHex([Number(surfaceMatch[1]), Number(surfaceMatch[2]), Number(surfaceMatch[3])])
      const surfaceAlphaPercent = (surfaceMatch[4] === undefined ? 1 : Number(surfaceMatch[4])) * 100

      const textColor = resolveHex('--color-text-primary', theme)
      const cardStops = resolveGradientCardStops(theme)

      const results = [cardStops.start, cardStops.end].map(stop => {
        const cardBg = compositeCardStopOverPage(stop, bgNavy)
        const pillBg = blend(surfaceHex, cardBg, surfaceAlphaPercent)
        return { cardBg, pillBg, ratio: contrastRatio(textColor, pillBg) }
      })
      const worst = results[0].ratio <= results[1].ratio ? results[0] : results[1]

      expect(
        worst.ratio,
        `[${theme}] BandCard name-pill text (--color-text-primary=${textColor}) against its composited pill ` +
          `background (--color-surface=${surfaceRaw} over the gradient-card stop composited over ` +
          `--color-bg-navy=${bgNavy} => ${worst.cardBg} => ${worst.pillBg}) computes to ` +
          `${worst.ratio.toFixed(2)}:1, below the ${MIN_CONTRAST}:1 WCAG AA floor`
      ).toBeGreaterThanOrEqual(MIN_CONTRAST)
    })

    // Root-cause regression guard for #1052. Badge.jsx renders EVERY status
    // variant as `bg-<c>-500/20 text-<c>-400`, and on the light themes that is
    // dark text over a 20% wash of its own hue -- the same composited shape as
    // .soon-pill above, and it collapsed the same way.
    //
    // axe measured the "LIVE NOW" badge at 4.08:1 on daybreak and 4.35:1 on
    // silver-lining. Sweeping the other variants found SEVEN of eight
    // variant/theme combinations failing; only info/silver-lining passed.
    //
    // It hid because a status badge is rare on public pages: `error` renders
    // ONLY on a live event card, which seeded data never produces, so the e2e
    // sweep never had one on screen to scan. Computing from the tokens covers
    // all four variants whether or not a page renders them today -- that gap is
    // precisely how this shipped.
    //
    // LIGHT THEMES ONLY, deliberately. The dark themes put light text on a dark
    // tint and pass comfortably (5.2-7.3:1). arctic-night computes to 4.45:1
    // against the DARKEST gradient-card stop, but axe measures the real render
    // as passing -- a modelling artifact of assuming the worst stop, not a
    // defect, so it is neither asserted here nor claimed as a bug.
    if (theme === 'daybreak' || theme === 'silver-lining') {
      describe.each(['error', 'success', 'warning', 'info'])('%s badge', variant => {
        it('badge text clears 4.5:1 against its composited chip background', () => {
          const cardStops = resolveGradientCardStops(theme)
          const text = resolveHex(`--color-${variant}-400`, theme)
          const fill = resolveHex(`--color-${variant}-500`, theme)

          // Same backdrop chain as .soon-pill: the chip tint sits on a
          // gradient-card stop, itself composited over the page background.
          // Both stops are checked and the worse ratio asserted, since a card
          // can render the badge anywhere along its gradient.
          const worst = [cardStops.start, cardStops.end]
            .map(stop => {
              const cardBg = compositeCardStopOverPage(stop, bgNavy)
              const chipBg = blend(fill, cardBg, 20)
              return { chipBg, ratio: contrastRatio(text, chipBg) }
            })
            .reduce((a, b) => (a.ratio <= b.ratio ? a : b))

          expect(
            worst.ratio,
            `[${theme}] ${variant} badge text (--color-${variant}-400=${text}) against its composited chip ` +
              `background (--color-${variant}-500=${fill} at 20% over the gradient-card stop over ` +
              `--color-bg-navy=${bgNavy} => ${worst.chipBg}) computes to ${worst.ratio.toFixed(2)}:1, ` +
              `below the ${MIN_CONTRAST}:1 WCAG AA floor`
          ).toBeGreaterThanOrEqual(MIN_CONTRAST)
        })
      })
    }
    // Bonus guard: accent-500 is the token gradient-accent's stops are meant
    // to match (VenueStrip and BandCard both use it directly against
    // bg-navy/bg-purple) — same bug class, cheap to also pin down here.
    it('accent-500 clears 4.5:1 against bg-navy', () => {
      expectMinContrast(theme, '--color-accent-500', accent500, bgNavy)
    })
  })
})
