import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME_ID, THEMES, contrastRatio, getTheme, isThemeId, themeVariables } from './themes'

describe('themes', () => {
  it('has unique ids, and the default is the app’s original look', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length)
    expect(THEMES.map((t) => t.id)).toContain(DEFAULT_THEME_ID)
    expect(getTheme(DEFAULT_THEME_ID).colors.bg).toBe('#14151a')
  })

  it('validates ids and falls back to the default for unknown ones', () => {
    expect(isThemeId('forest')).toBe(true)
    expect(isThemeId('nope')).toBe(false)
    expect(isThemeId(undefined)).toBe(false)
    expect(getTheme('nope').id).toBe(DEFAULT_THEME_ID)
    expect(getTheme(null).id).toBe(DEFAULT_THEME_ID)
  })

  it('sets every CSS variable the stylesheet uses, with real colours', () => {
    for (const theme of THEMES) {
      const vars = themeVariables(theme)
      expect(Object.keys(vars).sort()).toEqual(
        ['--accent', '--accent-dim', '--accent-text', '--bg', '--bg-elevated', '--bg-elevated-2', '--border', '--border-strong', '--danger', '--danger-dim', '--success', '--text', '--text-dim', '--warning'],
      )
      for (const [name, value] of Object.entries(vars)) expect(value, `${theme.id} ${name}`).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/)
    }
  })

  describe.each(THEMES.map((t) => [t.label, t] as const))('%s is readable', (_label, theme) => {
    const c = theme.colors
    it('main text on every surface', () => {
      for (const surface of [c.bg, c.bgElevated, c.bgElevated2]) expect(contrastRatio(c.text, surface)).toBeGreaterThanOrEqual(7)
    })
    it('dim text on every surface', () => {
      for (const surface of [c.bg, c.bgElevated, c.bgElevated2]) expect(contrastRatio(c.textDim, surface)).toBeGreaterThanOrEqual(4.5)
    })
    it('text on the accent colour (buttons, badges)', () => {
      expect(contrastRatio(c.accentText, c.accent)).toBeGreaterThanOrEqual(4.5)
    })
    it('text on the dimmed accent (active tab / selected deck)', () => {
      expect(contrastRatio(c.text, c.accentDim)).toBeGreaterThanOrEqual(4.5)
    })
    it('accent, danger, success and warning stand out from the background', () => {
      for (const colour of [c.accent, c.danger, c.success, c.warning]) expect(contrastRatio(colour, c.bg)).toBeGreaterThanOrEqual(3)
    })
    it('text on the danger background', () => {
      expect(contrastRatio(c.danger, c.dangerDim)).toBeGreaterThanOrEqual(3)
    })
  })

  it('contrastRatio matches the WCAG definition', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
  })
})
