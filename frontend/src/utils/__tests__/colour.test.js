import { describe, expect, it } from 'vitest'
import {
  AA_LARGE_TEXT,
  AA_TEXT,
  contrastRatio,
  ensureContrast,
  mix,
  parseHex,
  relativeLuminance,
  toHex,
  toOklch,
  withLightness,
} from '../colour'

const hueDistance = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

describe('parseHex / toHex', () => {
  it('parses long and short forms, case-insensitively', () => {
    expect(parseHex('#FF8000')).toEqual([255, 128, 0])
    expect(parseHex('#f80')).toEqual([255, 136, 0])
  })

  it('returns null for anything else', () => {
    for (const bad of ['', 'ff8000', '#ff80', '#gggggg', '#ff800000', null, undefined, 42]) {
      expect(parseHex(bad)).toBeNull()
    }
  })

  it('clamps and rounds', () => {
    expect(toHex([300, -5, 127.6])).toBe('#ff0080')
  })
})

describe('contrast', () => {
  it('black on white is 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2)
  })

  it('is symmetric and >= 1', () => {
    expect(contrastRatio('#123456', '#fedcba')).toBeCloseTo(contrastRatio('#fedcba', '#123456'), 10)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
  })

  it('matches the known #767676 on white pair', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
  })

  it('has WCAG luminance endpoints', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6)
    expect(AA_TEXT).toBe(4.5)
    expect(AA_LARGE_TEXT).toBe(3)
  })
})

describe('ensureContrast', () => {
  it('returns a passing colour unchanged', () => {
    expect(ensureContrast('#1a1819', '#ffffff', 7)).toBe('#1a1819')
  })

  it('darkens a failing colour on a light ground, keeping its hue', () => {
    const input = '#13b6e4'
    const out = ensureContrast(input, '#f4e9ed', AA_TEXT)
    expect(contrastRatio(out, '#f4e9ed')).toBeGreaterThanOrEqual(AA_TEXT)
    expect(toOklch(out).L).toBeLessThan(toOklch(input).L)
    expect(hueDistance(toOklch(out).h, toOklch(input).h)).toBeLessThan(10)
  })

  it('lightens a failing colour on a dark ground, keeping its hue', () => {
    const input = '#924d7a'
    const out = ensureContrast(input, '#1a1819', AA_TEXT)
    expect(contrastRatio(out, '#1a1819')).toBeGreaterThanOrEqual(AA_TEXT)
    expect(toOklch(out).L).toBeGreaterThan(toOklch(input).L)
    expect(hueDistance(toOklch(out).h, toOklch(input).h)).toBeLessThan(10)
  })

  it('terminates and returns the better of black/white when the target is unreachable', () => {
    const out = ensureContrast('#808080', '#777777', 21)
    expect(['#000000', '#ffffff']).toContain(out)
    expect(out).toBe(contrastRatio('#000000', '#777777') > contrastRatio('#ffffff', '#777777') ? '#000000' : '#ffffff')
  })

  it('reaches pure black when needed against white at 21', () => {
    expect(ensureContrast('#888888', '#ffffff', 21)).toBe('#000000')
  })
})

describe('withLightness / mix', () => {
  it('sets OKLCH lightness and stays in gamut', () => {
    const out = withLightness('#13b6e4', 0.95)
    expect(toOklch(out).L).toBeGreaterThan(0.93)
    expect(toOklch(out).L).toBeLessThan(0.97)
    expect(parseHex(withLightness('#ff0000', 0.9))).not.toBeNull()
  })

  it('mixes endpoints and midpoint', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
    const mid = toOklch(mix('#000000', '#ffffff', 0.5))
    expect(mid.L).toBeCloseTo(0.5, 1)
  })
})
