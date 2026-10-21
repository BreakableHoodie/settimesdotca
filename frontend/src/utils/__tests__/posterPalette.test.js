import { describe, expect, it } from 'vitest'
import { AA_TEXT, contrastRatio, toOklch } from '../colour'
import { isValidThemeColours, mapPaletteRoles, quantize, readableThemeColours } from '../posterPalette'

const buildPixels = runs => {
  const total = runs.reduce((n, [, count]) => n + count, 0)
  const data = new Uint8ClampedArray(total * 4)
  let i = 0
  for (const [[r, g, b, a = 255], count] of runs) {
    for (let k = 0; k < count; k++) {
      data.set([r, g, b, a], i)
      i += 4
    }
  }
  return data
}

const CASES = {
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
  'near-black poster': [
    { hex: '#0a0a0a', population: 0.94 },
    { hex: '#ffffff', population: 0.06 },
  ],
  'monochrome grey poster': [
    { hex: '#e0e0e0', population: 0.4 },
    { hex: '#808080', population: 0.35 },
    { hex: '#202020', population: 0.25 },
  ],
  'single swatch': [{ hex: '#336699', population: 1 }],
  'no light swatch': [
    { hex: '#7a1f3d', population: 0.6 },
    { hex: '#e8a33d', population: 0.3 },
    { hex: '#2b2b6b', population: 0.1 },
  ],
}

const expectContract = result => {
  expect(result).not.toBeNull()
  expect(isValidThemeColours(result)).toBe(true)
  for (const variant of [result.light, result.dark]) {
    expect(contrastRatio(variant.ink, variant.ground)).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(variant.accent, variant.ground)).toBeGreaterThanOrEqual(AA_TEXT)
    expect(contrastRatio(variant.ink, variant.nowFill)).toBeGreaterThanOrEqual(AA_TEXT)
    for (const colour of Object.values(variant)) expect(colour).toMatch(/^#[0-9a-f]{6}$/)
  }
}

describe('quantize', () => {
  it('splits a two-colour image with the right populations', () => {
    const swatches = quantize(
      buildPixels([
        [[255, 0, 0], 70],
        [[0, 0, 255], 30],
      ])
    )
    expect(swatches).toHaveLength(2)
    expect(swatches[0].hex).toBe('#ff0000')
    expect(swatches[0].population).toBeCloseTo(0.7, 2)
    expect(swatches[1].hex).toBe('#0000ff')
    expect(swatches[1].population).toBeCloseTo(0.3, 2)
  })

  it('ignores transparent pixels', () => {
    const swatches = quantize(
      buildPixels([
        [[255, 0, 0, 255], 10],
        [[0, 255, 0, 0], 90],
      ])
    )
    expect(swatches).toEqual([{ hex: '#ff0000', population: 1 }])
  })

  it('returns [] for empty and all-transparent input', () => {
    expect(quantize(new Uint8ClampedArray(0))).toEqual([])
    expect(quantize(buildPixels([[[1, 2, 3, 0], 5]]))).toEqual([])
  })

  it('returns one swatch for a single-colour image', () => {
    expect(quantize(buildPixels([[[10, 20, 30], 50]]))).toEqual([{ hex: '#0a141e', population: 1 }])
  })

  it('respects maxColours and sorts by population', () => {
    const swatches = quantize(
      buildPixels([
        [[255, 0, 0], 40],
        [[0, 255, 0], 30],
        [[0, 0, 255], 20],
        [[255, 255, 0], 10],
      ]),
      { maxColours: 3 }
    )
    expect(swatches).toHaveLength(3)
    expect(swatches.map(s => s.population)).toEqual([...swatches.map(s => s.population)].sort((a, b) => b - a))
    expect(swatches.reduce((n, s) => n + s.population, 0)).toBeCloseTo(1, 6)
  })
})

describe('mapPaletteRoles', () => {
  it('returns null for no swatches', () => {
    expect(mapPaletteRoles([])).toBeNull()
  })

  for (const [name, swatches] of Object.entries(CASES)) {
    it(`meets the full contrast contract: ${name}`, () => {
      const result = mapPaletteRoles(swatches)
      expectContract(result)
      expect(result.v).toBe(1)
      expect(result.source).toBe('poster')
    })
  }

  it('does not use the failing cyan as-is for text (Vol 17)', () => {
    const { light } = mapPaletteRoles(CASES['Vol 17-like'])
    expect(light.accent).not.toBe('#13b6e4')
    expect(contrastRatio('#13b6e4', light.ground)).toBeLessThan(AA_TEXT)
    expect(contrastRatio(light.accent, light.ground)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  // The approved mockup's rule: a colour that reads as text is the accent; one
  // that does not is demoted to the fill, not darkened into a colour the poster
  // never used. Checked on all 19 production posters before it was pinned.
  it('demotes a colour that fails as text to the on-now fill (Vol 17: plum accent, cyan fill)', () => {
    const { light } = mapPaletteRoles(CASES['Vol 17-like'])
    expect(light.accent).toBe('#6f4d5f')
    expect(light.nowFill).toBe('#13b6e4')
  })

  it('keeps the on-now fill visibly different from the ground', () => {
    for (const name of ['Vol 18-like', 'Vol 17-like']) {
      const { light } = mapPaletteRoles(CASES[name])
      expect(contrastRatio(light.nowFill, light.ground)).toBeGreaterThanOrEqual(1.1)
    }
  })

  it('uses the light swatch as ground when it is light enough, else a paper tint', () => {
    expect(mapPaletteRoles(CASES['Vol 18-like']).light.ground).toBe('#f7eef0')
    const tinted = mapPaletteRoles(CASES['no light swatch']).light.ground
    expect(toOklch(tinted).C).toBeLessThanOrEqual(0.025)
    expect(toOklch(tinted).L).toBeGreaterThan(0.93)
  })

  it('falls back to ink as accent on a monochrome poster', () => {
    const { light } = mapPaletteRoles(CASES['monochrome grey poster'])
    expect(light.accent).toBe(light.ink)
  })

  it('builds the dark variant from the poster ink', () => {
    const { dark } = mapPaletteRoles(CASES['Vol 18-like'])
    expect(contrastRatio(dark.ground, '#000000')).toBeLessThan(2)
  })
})

describe('isValidThemeColours', () => {
  const good = () => mapPaletteRoles(CASES['Vol 18-like'])

  it('accepts a mapped palette and source "manual"', () => {
    expect(isValidThemeColours(good())).toBe(true)
    expect(isValidThemeColours({ ...good(), source: 'manual' })).toBe(true)
  })

  it('rejects an extra top-level key, an extra variant key, and a missing key', () => {
    expect(isValidThemeColours({ ...good(), extra: 1 })).toBe(false)
    const withExtra = good()
    withExtra.light.extra = '#000000'
    expect(isValidThemeColours(withExtra)).toBe(false)
    const missing = good()
    delete missing.dark.nowFill
    expect(isValidThemeColours(missing)).toBe(false)
    const noDark = good()
    delete noDark.dark
    expect(isValidThemeColours(noDark)).toBe(false)
  })

  it('rejects v: 2, a non-hex colour and an unknown source', () => {
    expect(isValidThemeColours({ ...good(), v: 2 })).toBe(false)
    const bad = good()
    bad.light.accent = 'red'
    expect(isValidThemeColours(bad)).toBe(false)
    const short = good()
    short.light.accent = '#fff'
    expect(isValidThemeColours(short)).toBe(false)
    expect(isValidThemeColours({ ...good(), source: 'other' })).toBe(false)
  })

  it('accepts upper-case hex, as the server does (the two homes agree)', () => {
    const upper = good()
    upper.light.ink = upper.light.ink.toUpperCase()
    expect(isValidThemeColours(upper)).toBe(true)
  })

  it('rejects non-objects', () => {
    for (const v of [null, undefined, 'x', 3, [], true]) expect(isValidThemeColours(v)).toBe(false)
  })
})

describe('readableThemeColours', () => {
  it('repairs a hand-edited palette with yellow accent on white', () => {
    const edited = {
      v: 1,
      source: 'manual',
      light: { ground: '#ffffff', ink: '#222222', accent: '#ffff00', nowFill: '#ffff99' },
      dark: { ground: '#111111', ink: '#222222', accent: '#222233', nowFill: '#000000' },
    }
    expect(contrastRatio('#ffff00', '#ffffff')).toBeLessThan(AA_TEXT)
    const out = readableThemeColours(edited)
    expectContract(out)
    expect(out.source).toBe('manual')
    expect(edited.light.accent).toBe('#ffff00')
  })

  it('leaves an already-readable palette unchanged', () => {
    const palette = mapPaletteRoles(CASES['Vol 17-like'])
    expect(readableThemeColours(palette)).toEqual(palette)
  })

  it('returns null for garbage', () => {
    for (const v of [null, {}, 'x', { v: 1 }]) expect(readableThemeColours(v)).toBeNull()
  })
})
