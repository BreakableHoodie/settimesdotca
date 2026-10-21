import { describe, expect, it } from 'vitest'
import { AA_TEXT, contrastRatio, mix } from '../colour'
import { mapPaletteRoles } from '../posterPalette'
import { applicablePalette, eventPageStyle, posterThemeVariables } from '../posterTheme'

const POSTER = 'https://band-photos.settimes.ca/event-posters/vol18.jpg'
const SWATCHES = {
  'Vol 18-like': [
    { hex: '#f7eef0', population: 0.55 },
    { hex: '#1a1819', population: 0.2 },
    { hex: '#924d7a', population: 0.15 },
    { hex: '#dce9f2', population: 0.1 },
  ],
  'Vol 17-like': [
    { hex: '#f4e9ed', population: 0.5 },
    { hex: '#242c3c', population: 0.25 },
    { hex: '#13b6e4', population: 0.15 },
    { hex: '#6f4d5f', population: 0.1 },
  ],
  'near-black': [
    { hex: '#0a0a0a', population: 0.94 },
    { hex: '#ffffff', population: 0.06 },
  ],
  'loud green and pink': [
    { hex: '#e8f2e5', population: 0.4 },
    { hex: '#030504', population: 0.3 },
    { hex: '#dc2065', population: 0.2 },
    { hex: '#34840f', population: 0.1 },
  ],
}
const HEX = /^#[0-9a-f]{6}$/

describe('posterThemeVariables: the page stays readable for any poster', () => {
  for (const [name, swatches] of Object.entries(SWATCHES)) {
    const palette = mapPaletteRoles(swatches, POSTER)
    for (const variant of ['light', 'dark']) {
      it(`${name}, ${variant}`, () => {
        const v = posterThemeVariables(palette[variant])
        const ground = v['--color-bg-navy']
        expect(contrastRatio(v['--color-text-primary'], ground)).toBeGreaterThanOrEqual(7)
        expect(contrastRatio(v['--color-text-secondary'], ground)).toBeGreaterThanOrEqual(7)
        expect(contrastRatio(v['--color-text-tertiary'], ground)).toBeGreaterThanOrEqual(AA_TEXT)
        // accent text on the ground AND on its own 20% tint (bg-accent-500/20)
        expect(contrastRatio(v['--color-accent-400'], ground)).toBeGreaterThanOrEqual(AA_TEXT)
        expect(
          contrastRatio(v['--color-accent-400'], mix(ground, v['--color-accent-500'], 0.2))
        ).toBeGreaterThanOrEqual(
          AA_TEXT - 0.05 // the tint is an approximation of the composited 20% fill
        )
        // ground-coloured text on the accent fills (text-bg-navy on bg-accent-500)
        expect(contrastRatio(ground, v['--color-accent-500'])).toBeGreaterThanOrEqual(AA_TEXT)
        expect(contrastRatio(ground, v['--color-accent-600'])).toBeGreaterThanOrEqual(AA_TEXT)
        // nothing but hex colours (or gradients built only from them) reaches CSS
        for (const [key, value] of Object.entries(v)) {
          if (key.startsWith('--background-image')) {
            expect(value.replace(/#[0-9a-f]{6}(26)?/g, '')).toMatch(/^(linear|radial)-gradient\([a-z0-9 ,%.]*\)$/)
          } else {
            expect(value).toMatch(HEX)
          }
        }
      })
    }
  }
})

describe('applicablePalette', () => {
  const palette = mapPaletteRoles(SWATCHES['Vol 18-like'], POSTER)

  it('applies a palette read from the poster the event still has', () => {
    expect(applicablePalette({ poster_url: POSTER, theme_colors: JSON.stringify(palette) })).not.toBeNull()
  })

  it('ignores a poster palette from a poster the event no longer has', () => {
    expect(
      applicablePalette({
        poster_url: 'https://band-photos.settimes.ca/event-posters/new.jpg',
        theme_colors: JSON.stringify(palette),
      })
    ).toBeNull()
  })

  it('applies a hand-picked palette whatever the poster', () => {
    const manual = { ...palette, source: 'manual' }
    expect(applicablePalette({ poster_url: null, theme_colors: JSON.stringify(manual) })).not.toBeNull()
  })

  it.each([
    ['no palette', null],
    ['malformed JSON', '{'],
    ['the legacy shape', '{"primary":"#000000"}'],
  ])('is null for %s (the house theme)', (_label, stored) => {
    expect(applicablePalette({ poster_url: POSTER, theme_colors: stored })).toBeNull()
    expect(eventPageStyle({ poster_url: POSTER, theme_colors: stored }, true)).toBeNull()
  })

  it('picks the variant from the fan theme', () => {
    const event = { poster_url: POSTER, theme_colors: JSON.stringify(palette) }
    expect(eventPageStyle(event, true)['--color-bg-navy']).toBe(palette.light.ground)
    expect(eventPageStyle(event, false)['--color-bg-navy']).toBe(palette.dark.ground)
  })
})
