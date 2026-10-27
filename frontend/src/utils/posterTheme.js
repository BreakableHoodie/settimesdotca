// The event page wears its poster (#1248). A stored palette becomes CSS custom
// properties set on the page's wrapper, overriding the theme tokens every
// Tailwind utility reads (`var(--color-…)` resolves where it is USED, so
// redefining a token on an ancestor re-colours everything inside). No component
// needs to know a palette exists.
//
// Every colour reaching CSS is a #rrggbb that passed isValidThemeColours, then
// readableThemeColours, then the contrast rules below, so a stored palette can
// neither inject CSS nor make text unreadable.
import { AA_TEXT, composite, ensureContrast, mix, relativeLuminance } from './colour'

// The strongest accent-500 tint that carries accent-400 text: hover:bg-accent-500/30.
const MAX_TEXT_TINT_ALPHA = 0.3
// Chrome paints Tailwind's color-mix(in oklab, ..., transparent) tint about two
// sRGB units darker than the exact composite, so a 4.5 target measured 4.47 on
// screen (#1396). The margin keeps the painted result at AA.
const TINT_CONTRAST_MARGIN = 0.15
import { readableThemeColours } from './posterPalette'

/**
 * The palette that applies to this event, or null for the house theme:
 * malformed, absent, or read from a poster that is no longer the event's (a
 * hand-picked "manual" palette applies whatever the poster).
 */
export function applicablePalette(eventData) {
  const stored = eventData?.theme_colors
  if (!stored) return null
  let parsed
  try {
    parsed = typeof stored === 'string' ? JSON.parse(stored) : stored
  } catch {
    return null
  }
  const readable = readableThemeColours(parsed)
  if (!readable) return null
  if (readable.source === 'poster' && readable.poster !== eventData.poster_url) return null
  return readable
}

/**
 * CSS custom properties for one variant ({ ground, ink, accent, nowFill }).
 * Derived tones are mixed between ink and ground and re-checked, because the
 * theme's own tokens were tuned per theme and these must hold for any poster.
 */
export function posterThemeVariables({ ground, ink, accent, nowFill }) {
  const tone = t => mix(ground, ink, t)
  // accent-500/600 are FILLS under ground-coloured text (text-bg-navy).
  const accentFill = ensureContrast(accent, ground, AA_TEXT)
  // accent-400 is TEXT on the ground and on accent-500 tints, up to /30 on
  // hover. Checked against the strongest tint AS PAINTED: accent-500 at that
  // alpha composited over the ground in sRGB. The old check mixed the raw
  // accent in OKLab and let tints render at 3.9-4.4:1 (#1396).
  // The direction comes from the GROUND: text moved away from the ground
  // passes on the ground and on every weaker tint once it passes the
  // strongest. Choosing it from the tint picked white on a mid-grey ground
  // (2.6:1 there) when no colour could pass both (CodeRabbit, #1396).
  const accentText = ensureContrast(
    accent,
    composite(accentFill, ground, MAX_TEXT_TINT_ALPHA),
    AA_TEXT + TINT_CONTRAST_MARGIN,
    relativeLuminance(ground) > 0.18
  )
  const accentFillDeep = ensureContrast(mix(accentFill, ink, 0.25), ground, AA_TEXT)
  const card = [tone(0.04), tone(0.08)]
  // Text sits on the tinted surfaces as well as the ground, so derived tones are
  // checked against the most ink-ward one (bg-darker); passing there passes on
  // every lighter surface and the ground. Against the ground alone, the real
  // Vol 18 light palette put tertiary text on bg-surface at 4.1:1.
  const hardestSurface = tone(0.12)
  return {
    '--color-bg-navy': ground,
    '--color-bg-dark': tone(0.03),
    '--color-bg-purple': tone(0.06),
    '--color-bg-darker': hardestSurface,
    '--color-text-primary': ink,
    '--color-text-secondary': ensureContrast(tone(0.82), hardestSurface, 7),
    '--color-text-tertiary': ensureContrast(tone(0.65), hardestSurface, AA_TEXT),
    '--color-text-disabled': ensureContrast(tone(0.45), hardestSurface, 3),
    '--color-text-inverse': ground,
    '--color-surface': tone(0.05),
    '--color-surface-hover': tone(0.1),
    '--color-border': tone(0.2),
    '--color-accent-300': accentText,
    '--color-accent-400': accentText,
    '--color-accent-500': accentFill,
    '--color-accent-600': accentFillDeep,
    '--color-poster-now': nowFill,
    '--background-image-gradient-accent': `linear-gradient(135deg, ${accentFill} 0%, ${accentFillDeep} 100%)`,
    '--background-image-gradient-card': `linear-gradient(145deg, ${card[0]} 0%, ${card[1]} 100%)`,
    '--background-image-gradient-dark': `linear-gradient(180deg, ${ground} 0%, ${tone(0.06)} 100%)`,
    '--background-image-gradient-glow': `radial-gradient(ellipse at center, ${accentFill}26 0%, transparent 70%)`,
  }
}

/** The style for the event page wrapper, or null for the house theme. */
export function eventPageStyle(eventData, isLight) {
  const palette = applicablePalette(eventData)
  if (!palette) return null
  return posterThemeVariables(isLight ? palette.light : palette.dark)
}
