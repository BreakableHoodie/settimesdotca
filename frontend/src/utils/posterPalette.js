// Poster -> theme colours. Pure except extractPaletteFromImage (browser only).
import { AA_TEXT, contrastRatio, ensureContrast, fromOklch, toHex, toOklch, withLightness } from './colour'

const INK_RATIO = 7
const MIN_ACCENT_CHROMA = 0.04
const ROLES = ['ground', 'ink', 'accent', 'nowFill']
// Case-insensitive, like the server's isValidThemeColors (functions/utils/themeColors.js).
const HEX_RE = /^#[0-9a-f]{6}$/i

/** Median-cut an RGBA buffer into at most `maxColours` swatches, by population desc. */
export function quantize(pixels, { maxColours = 8 } = {}) {
  const px = []
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] >= 128) px.push([pixels[i], pixels[i + 1], pixels[i + 2]])
  }
  if (!px.length) return []
  const widest = box => {
    let channel = 0
    let spread = -1
    for (let c = 0; c < 3; c++) {
      let min = 255
      let max = 0
      for (const p of box) {
        if (p[c] < min) min = p[c]
        if (p[c] > max) max = p[c]
      }
      if (max - min > spread) {
        spread = max - min
        channel = c
      }
    }
    return { channel, spread }
  }
  const boxes = [px]
  while (boxes.length < maxColours) {
    let pick = -1
    for (let i = 0; i < boxes.length; i++) {
      if (widest(boxes[i]).spread > 0 && (pick < 0 || boxes[i].length > boxes[pick].length)) pick = i
    }
    if (pick < 0) break
    const box = boxes[pick]
    const { channel } = widest(box)
    box.sort((p, q) => p[channel] - q[channel])
    // Split at the value boundary nearest the median so equal colours never straddle boxes.
    const mid = box.length / 2
    let cut = -1
    for (let i = 1; i < box.length; i++) {
      if (box[i][channel] !== box[i - 1][channel] && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i
    }
    boxes.splice(pick, 1, box.slice(0, cut), box.slice(cut))
  }
  return boxes
    .map(box => {
      const sum = box.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0])
      return { hex: toHex(sum.map(v => v / box.length)), population: box.length / px.length }
    })
    .sort((a, b) => b.population - a.population)
}

const chromaOf = hex => toOklch(hex).C
const lightnessOf = hex => toOklch(hex).L

/**
 * Map swatches to the four theme roles in a light and a dark variant; null when
 * there are none. `poster` is the URL the swatches came from: a palette
 * describes one poster (see isValidThemeColours).
 */
export function mapPaletteRoles(swatches, poster) {
  if (!Array.isArray(swatches) || !swatches.length) return null
  const dominant = swatches.reduce((a, b) => (b.population > a.population ? b : a))

  // ground
  let groundSwatch = null
  for (const s of swatches) {
    if (s.population < 0.05 || lightnessOf(s.hex) < 0.9) continue
    if (!groundSwatch || lightnessOf(s.hex) > lightnessOf(groundSwatch.hex)) groundSwatch = s
  }
  let ground
  if (groundSwatch) ground = groundSwatch.hex
  else {
    const { C, h } = toOklch(dominant.hex)
    ground = fromOklch(0.95, Math.min(C, 0.02), h)
  }

  // ink
  const inkSwatch = swatches.reduce((a, b) => (lightnessOf(b.hex) < lightnessOf(a.hex) ? b : a))
  const ink = ensureContrast(inkSwatch.hex, ground, INK_RATIO)

  // accent and nowFill. A colour that already reads as text on the ground
  // becomes the accent; one that does not (a bright cyan, a pale tint) is
  // DEMOTED to the "on now" fill, where ink sits on top of it, rather than
  // being darkened into something the poster never used. On Vol 17 that keeps
  // the plum as the accent and the poster's signature cyan as the fill.
  const candidates = swatches
    .filter(s => s !== groundSwatch && s !== inkSwatch)
    .filter(s => s.population >= 0.02 && chromaOf(s.hex) >= MIN_ACCENT_CHROMA)
    .sort((a, b) => chromaOf(b.hex) - chromaOf(a.hex))
  const readsAsText = s => contrastRatio(s.hex, ground) >= AA_TEXT
  // None reads as text: take the one CLOSEST to reading (least change), not
  // the most chromatic, which is usually the brightest and needs the most
  // darkening (a full-size Vol 17 sampled in Chromium turned its cyan teal).
  const closestToText = [...candidates].sort((a, b) => contrastRatio(b.hex, ground) - contrastRatio(a.hex, ground))[0]
  const accentSwatch = candidates.find(readsAsText) || closestToText || null
  const accent = accentSwatch ? ensureContrast(accentSwatch.hex, ground, AA_TEXT) : ink

  // nowFill: a background behind ink text
  const rest = candidates.filter(s => s !== accentSwatch)
  const fillSwatch = rest.find(s => !readsAsText(s)) || rest[0] || accentSwatch
  const fillBase = fillSwatch ? fillSwatch.hex : ink
  let nowFill = ensureContrast(fillBase, ink, AA_TEXT)
  if (contrastRatio(nowFill, ground) < 1.1) {
    nowFill = ensureContrast(withLightness(nowFill, lightnessOf(nowFill) - 0.06), ink, AA_TEXT)
  }

  const light = { ground, ink, accent, nowFill }

  // dark variant, from the poster's own ink
  const dGround = withLightness(light.ink, 0.18)
  const dInk = ensureContrast(light.ground, dGround, INK_RATIO)
  const dAccent = ensureContrast(light.accent, dGround, AA_TEXT)
  const dFill = ensureContrast(withLightness(light.nowFill, 0.32), dInk, AA_TEXT)

  return {
    v: 1,
    source: 'poster',
    poster,
    light,
    dark: { ground: dGround, ink: dInk, accent: dAccent, nowFill: dFill },
  }
}

const hasExactKeys = (obj, keys) =>
  obj !== null &&
  typeof obj === 'object' &&
  !Array.isArray(obj) &&
  Object.keys(obj).length === keys.length &&
  keys.every(k => Object.hasOwn(obj, k))

const isHttpsUrl = value => {
  if (typeof value !== 'string' || value.length > 500) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

// Mirrors functions/utils/themeColors.js isValidThemeColors exactly; the two
// sides cannot share code across the build boundary.
export function isValidThemeColours(value) {
  // The house theme chosen for a poster (see functions/utils/themeColors.js).
  if (value?.source === 'none') {
    return hasExactKeys(value, ['v', 'source', 'poster']) && value.v === 1 && isHttpsUrl(value.poster)
  }
  if (!hasExactKeys(value, ['v', 'source', 'poster', 'light', 'dark'])) return false
  if (value.v !== 1 || !['poster', 'manual'].includes(value.source) || !isHttpsUrl(value.poster)) return false
  return ['light', 'dark'].every(
    k => hasExactKeys(value[k], ROLES) && ROLES.every(r => typeof value[k][r] === 'string' && HEX_RE.test(value[k][r]))
  )
}

/** Render-time safety net: returns a copy whose text roles pass contrast again, or null if malformed. */
export function readableThemeColours(value) {
  // "none" is valid but has no colours: the page uses the house theme.
  if (!isValidThemeColours(value) || value.source === 'none') return null
  const fix = variant => {
    // Stored hex may be upper-case (both validators accept it); emit lower.
    const [ground, ink, accent, nowFill] = ROLES.map(role => variant[role].toLowerCase())
    const fixedInk = ensureContrast(ink, ground, INK_RATIO)
    return {
      ground,
      ink: fixedInk,
      accent: ensureContrast(accent, ground, AA_TEXT),
      nowFill: ensureContrast(nowFill, fixedInk, AA_TEXT),
    }
  }
  return { v: value.v, source: value.source, poster: value.poster, light: fix(value.light), dark: fix(value.dark) }
}

// Large enough that the swatches do not depend on how a browser resamples a
// 1440x1800 poster (96 px gave Chromium and Pillow different accents).
const LONG_SIDE = 160
// One colour over this share of the pixels is not a poster: it is what a
// browser that blocks canvas reads (Firefox resistFingerprinting and the like)
// hands back instead of throwing.
const BLANK_SHARE = 0.98

/** Browser only: a poster Blob -> its theme colours. Throws when it cannot read real pixels. */
export async function extractPaletteFromImage(source, poster) {
  const ownBitmap = source instanceof globalThis.Blob
  const bitmap = ownBitmap ? await globalThis.createImageBitmap(source) : source
  try {
    const w = bitmap.width || bitmap.naturalWidth
    const h = bitmap.height || bitmap.naturalHeight
    const scale = Math.min(1, LONG_SIDE / Math.max(w, h))
    const cw = Math.max(1, Math.round(w * scale))
    const ch = Math.max(1, Math.round(h * scale))
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('This browser could not prepare the image for reading.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, cw, ch)
    const swatches = quantize(ctx.getImageData(0, 0, cw, ch).data)
    if (swatches.length === 0 || swatches[0].population > BLANK_SHARE) {
      throw new Error("Could not read the poster's pixels (the browser may be blocking image reading).")
    }
    return mapPaletteRoles(swatches, poster)
  } finally {
    if (ownBitmap) bitmap.close?.()
  }
}
