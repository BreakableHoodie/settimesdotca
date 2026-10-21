// The event page wears its poster (#1248). A stored palette becomes CSS custom
// properties set on the page's wrapper, overriding the theme tokens every
// Tailwind utility reads (`var(--color-…)` resolves where it is USED, so
// redefining a token on an ancestor re-colours everything inside). No component
// needs to know a palette exists.
//
// Every colour reaching CSS is a #rrggbb that passed isValidThemeColours, then
// readableThemeColours, then the contrast rules below, so a stored palette can
// neither inject CSS nor make text unreadable.
import { AA_TEXT, ensureContrast, mix } from './colour'
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
  // accent-400 is TEXT on a 20% accent tint (bg-accent-500/20) as well as on
  // the ground, so it must pass on the tint, the harder of the two.
  const accentText = ensureContrast(accent, mix(ground, accent, 0.2), AA_TEXT)
  // accent-500/600 are FILLS under ground-coloured text (text-bg-navy).
  const accentFill = ensureContrast(accent, ground, AA_TEXT)
  const accentFillDeep = ensureContrast(mix(accentFill, ink, 0.25), ground, AA_TEXT)
  const card = [tone(0.04), tone(0.08)]
  return {
    '--color-bg-navy': ground,
    '--color-bg-dark': tone(0.03),
    '--color-bg-purple': tone(0.06),
    '--color-bg-darker': tone(0.12),
    '--color-text-primary': ink,
    '--color-text-secondary': ensureContrast(tone(0.82), ground, 7),
    '--color-text-tertiary': ensureContrast(tone(0.65), ground, AA_TEXT),
    '--color-text-disabled': ensureContrast(tone(0.45), ground, 3),
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
