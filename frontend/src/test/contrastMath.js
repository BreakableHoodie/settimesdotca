// Shared colour maths for the contrast guards (#1074, #617).
//
// Lives here, imported by both guards, rather than being copy-pasted into each.
// That is the `CACHE_BROWSE` drift class CLAUDE.md records: a constant exported
// and imported by nothing while five endpoints hardcoded its value. Two guards
// each carrying their own oklch conversion would drift the same way, and the
// drift would be invisible because both would still go green.
//
// `src/test/` is deliberate: vitest's default `include` only collects
// `*.{test,spec}.*`, so nothing here runs as a suite, and vitest.config.js
// already excludes `src/test/` from coverage.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolved from this file's own location, never process.cwd(): an IDE runner or
// a script invoking vitest from the repo root would otherwise read a
// non-existent path and the guards would fail for a reason unrelated to colour.
const FRONTEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** WCAG 2.1 AA, normal-size text. Large text (>=24px, or >=18.66px bold) may
 * use 3:1 — none of the call sites so far qualify, so nothing uses it yet. */
export const AA_NORMAL_TEXT = 4.5

const TAILWIND_THEME = join(FRONTEND_ROOT, 'node_modules/tailwindcss/theme.css')
const APP_CSS = join(FRONTEND_ROOT, 'src/index.css')

/**
 * oklch() -> sRGB, clamped the way a browser rasterises an out-of-gamut triple.
 *
 * Tailwind v4 declares its entire palette in oklch, so there is no hex to read.
 * Parsing the three numbers as if they were RGB — which a first draft of the
 * #1074 guard did — yields confident nonsense like "green-600 is #3b3b29".
 * `parseColour` is validated against real browser renders in the guards.
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

/**
 * Any OPAQUE CSS colour this codebase declares: hex (3 or 6), oklch, rgb().
 *
 * TRANSLUCENT COLOURS RETURN undefined ON PURPOSE, and this is the correction
 * that matters most here. `--color-surface` is `rgba(255, 255, 255, 0.05)` —
 * 5% white. Reading that as opaque `#ffffff` made the first run of the theme
 * guard report `bg-surface + text-text-primary = 1.00:1` on every theme, i.e.
 * invisible text across the whole site, which is plainly false: 5% white over a
 * dark page is very nearly the page colour.
 *
 * The effective colour of a translucent layer depends on everything painted
 * behind it, which a source scan cannot know — it could sit on bg-dark, bg-navy,
 * bg-purple, or another card. Compositing it against a guessed backdrop would
 * produce authoritative-looking numbers derived from an assumption, which is
 * worse than not checking. So these pairs are skipped, and that limit is stated
 * in the guards rather than hidden.
 */
export function parseColour(value) {
  if (!value) return undefined
  const raw = value.trim()
  const six = raw.match(/^#([0-9a-f]{6})$/i)
  if (six) return [0, 2, 4].map(i => parseInt(six[1].slice(i, i + 2), 16))
  const three = raw.match(/^#([0-9a-f]{3})$/i)
  if (three) return [...three[1]].map(c => parseInt(c + c, 16))
  // 8- and 4-digit hex carry alpha; translucent, so not resolvable here.
  if (/^#([0-9a-f]{8}|[0-9a-f]{4})$/i.test(raw)) return undefined
  if (raw.startsWith('oklch')) {
    if (isTranslucent(raw.match(/\/\s*([\d.]+%?)\s*\)/)?.[1])) return undefined
    return oklchToRgb(raw)
  }
  const rgb = raw.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?/)
  if (rgb) {
    if (isTranslucent(rgb[4])) return undefined
    return [+rgb[1], +rgb[2], +rgb[3]]
  }
  return undefined
}

/**
 * CSS alpha is a number OR a percentage, and mixing them up fails in the
 * dangerous direction. An earlier version tested `parseFloat(alpha) < 1`, so
 * `rgb(255 255 255 / 50%)` parsed as `50` — not less than 1 — and a
 * half-transparent colour was read as fully OPAQUE. That is the same failure as
 * reading `rgba(255,255,255,0.05)` as `#ffffff`, which produced
 * "bg-surface + text-text-primary = 1.00:1" on every theme.
 *
 * No percentage alpha appears in index.css today, so this is latent rather than
 * live — but a guard whose instrument silently mis-reads is worse than no guard,
 * and the fix is one function. Flagged by CodeRabbit on #1077.
 */
function isTranslucent(alpha) {
  if (alpha === undefined) return false
  const value = alpha.endsWith('%') ? parseFloat(alpha) / 100 : parseFloat(alpha)
  return Number.isFinite(value) && value < 1
}

export function relativeLuminance([r, g, b]) {
  const channel = value => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(foreground, background) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

export const toHex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('')

/** Tailwind's own palette, read from the INSTALLED dependency so it cannot
 * drift from the package that actually renders the page. */
export function loadTailwindPalette() {
  const css = readFileSync(TAILWIND_THEME, 'utf8')
  const palette = new Map()
  for (const match of css.matchAll(/--color-([a-z]+-\d{2,3}):\s*([^;]+);/g)) palette.set(match[1], match[2].trim())
  return palette
}

/**
 * The app's own theme layers, as { themeName: { 'color:accent-500': '#...' } }.
 *
 * Comments are stripped FIRST and that is load-bearing: index.css contains the
 * literal word "@theme" inside prose comments ("...matched to the @theme
 * defaults"), and matching those phantom blocks made the brace scan swallow two
 * of the four real theme blocks — silently reporting 2 themes instead of 4.
 * Every consumer asserts the theme count for exactly this reason.
 */
export function loadAppThemes() {
  const css = readFileSync(APP_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const layers = {}
  const selector = /(\[data-theme=['"]([\w-]+)['"]\]|:root|@theme)\s*\{/g
  let match
  while ((match = selector.exec(css))) {
    const name = match[2] || (match[1] === '@theme' ? 'base' : 'root')
    let depth = 1
    let i = selector.lastIndex
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    const body = css.slice(selector.lastIndex, i - 1)
    layers[name] = { ...(layers[name] || {}) }
    for (const decl of body.matchAll(/--(color|background-image)-([\w-]+)\s*:\s*([^;]+);/g)) {
      layers[name][`${decl[1]}:${decl[2]}`] = decl[3].trim()
    }
    selector.lastIndex = i
  }
  const themes = Object.keys(layers).filter(name => name !== 'base' && name !== 'root')
  const base = { ...(layers.base || {}), ...(layers.root || {}) }
  return { layers, themes, base }
}

/**
 * Resolve a token that does NOT vary by theme: `white`, `black`, or a Tailwind
 * palette step. Returns undefined for anything theme-dependent, which is what
 * lets the fixed-colour guard skip theme tokens without knowing their names.
 */
export function resolveFixedColour(token, palette) {
  if (token === 'white') return [255, 255, 255]
  if (token === 'black') return [0, 0, 0]
  const declared = palette.get(token)
  return declared ? parseColour(declared) : undefined
}

/**
 * Resolve one class token to its colour(s) for a given theme.
 *
 * Returns an ARRAY because a gradient token is several colours and every stop
 * has to clear the floor independently — that is precisely the case axe cannot
 * evaluate ("background color could not be determined due to a background
 * gradient") and therefore the case a source scan has to own.
 */
export function resolveToken(token, theme, { layers, base }, palette) {
  if (token === 'white') return [[255, 255, 255]]
  if (token === 'black') return [[0, 0, 0]]

  const gradient = layers[theme]?.[`background-image:${token}`] ?? base[`background-image:${token}`]
  if (gradient) {
    const stops = [...gradient.matchAll(/#[0-9a-f]{3,6}\b|oklch\([^)]*\)|rgba?\([^)]*\)/gi)]
      .map(m => parseColour(m[0]))
      .filter(Boolean)
    return stops.length ? stops : undefined
  }

  const themed = layers[theme]?.[`color:${token}`] ?? base[`color:${token}`]
  if (themed) {
    const parsed = parseColour(themed)
    return parsed ? [parsed] : undefined
  }

  const fixed = palette.get(token)
  if (fixed) {
    const parsed = parseColour(fixed)
    return parsed ? [parsed] : undefined
  }
  return undefined
}
