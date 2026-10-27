// Pure colour maths: hex <-> sRGB <-> OKLab/OKLCH, WCAG contrast, and a
// lightness-only contrast fixer. All colours are lowercase '#rrggbb' strings.

export const AA_TEXT = 4.5
export const AA_LARGE_TEXT = 3

const EPS = 1e-6

export function parseHex(hex) {
  if (typeof hex !== 'string') return null
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = [...h].map(c => c + c).join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function toHex([r, g, b]) {
  return (
    '#' +
    [r, g, b]
      .map(v => {
        const n = Math.min(255, Math.max(0, Math.round(Number.isFinite(v) ? v : 0)))
        return n.toString(16).padStart(2, '0')
      })
      .join('')
  )
}

const toLinear = c => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const fromLinear = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255

export function relativeLuminance(hex) {
  const [r, g, b] = parseHex(hex).map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a, b) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// --- OKLab ---------------------------------------------------------------

function linearToOklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

function toOklab(hex) {
  const [r, g, b] = parseHex(hex).map(toLinear)
  return linearToOklab(r, g, b)
}

const linearToHex = lin => toHex(lin.map(v => fromLinear(Math.min(1, Math.max(0, v)))))
const inGamut = lin => lin.every(v => v >= -EPS && v <= 1 + EPS)

/** hex -> { L, C, h } (L 0-1, h in degrees 0-360). */
export function toOklch(hex) {
  const [L, a, b] = toOklab(hex)
  const C = Math.hypot(a, b)
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
  return { L, C, h }
}

/** OKLCH -> hex. If out of sRGB gamut, chroma is reduced (hue and lightness kept). */
export function fromOklch(L, C, h) {
  if (L <= 0) return '#000000'
  if (L >= 1) return '#ffffff'
  const rad = (h * Math.PI) / 180
  const at = c => oklabToLinear(L, c * Math.cos(rad), c * Math.sin(rad))
  let lin = at(C)
  if (!inGamut(lin)) {
    let lo = 0
    let hi = C
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(at(mid))) lo = mid
      else hi = mid
    }
    lin = at(lo)
  }
  return linearToHex(lin)
}

export function withLightness(hex, L) {
  const { C, h } = toOklch(hex)
  return fromOklch(Math.min(1, Math.max(0, L)), C, h)
}

/**
 * `fg` at `alpha` painted over an opaque `bg`: how a browser composites a
 * translucent fill such as Tailwind's bg-x/20, in sRGB. Not mix(), which
 * interpolates in OKLab and lands on a different colour (#1396).
 */
export function composite(fg, bg, alpha) {
  const f = parseHex(fg)
  const b = parseHex(bg)
  const a = Math.min(1, Math.max(0, alpha))
  return toHex(f.map((c, i) => c * a + b[i] * (1 - a)))
}

export function mix(a, b, t) {
  const [L1, a1, b1] = toOklab(a)
  const [L2, a2, b2] = toOklab(b)
  const k = Math.min(1, Math.max(0, t))
  return linearToHex(oklabToLinear(L1 + (L2 - L1) * k, a1 + (a2 - a1) * k, b1 + (b2 - b1) * k))
}

/**
 * Return `colour` unchanged if it meets `minRatio` against `against`; otherwise
 * move only its OKLCH lightness (toward black on a light `against`, toward
 * white on a dark one) to the nearest passing step. If even pure black/white
 * cannot reach the target, return whichever of the two has higher contrast.
 */
export function ensureContrast(colour, against, minRatio) {
  if (contrastRatio(colour, against) >= minRatio) return colour
  const towardBlack = relativeLuminance(against) > 0.18
  const end = towardBlack ? '#000000' : '#ffffff'
  if (contrastRatio(end, against) < minRatio) {
    return contrastRatio('#000000', against) >= contrastRatio('#ffffff', against) ? '#000000' : '#ffffff'
  }
  const { L, C, h } = toOklch(colour)
  let fail = L // does not pass
  let pass = towardBlack ? 0 : 1 // end point passes (verified above)
  for (let i = 0; i < 24; i++) {
    const mid = (fail + pass) / 2
    if (contrastRatio(fromOklch(mid, C, h), against) >= minRatio) pass = mid
    else fail = mid
  }
  const out = fromOklch(pass, C, h)
  return contrastRatio(out, against) >= minRatio ? out : end
}
