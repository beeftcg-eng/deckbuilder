import { describe, expect, it } from 'vitest'
import { RARITY_COLORS, rarityColorClass } from './rarityColor'
import { THEMES, contrastRatio } from './themes'

describe('rarityColorClass', () => {
  it('gives Yu-Gi-Oh premium rarities their own colors instead of one shared yellow', () => {
    const cases: [string, string][] = [
      ['Secret Rare', 'top'], ['Prismatic Secret Rare', 'top'], ['Ultra Secret Rare', 'top'], ['Mythic', 'top'],
      ['Quarter Century Secret Rare', 'qcsr'], ['Starlight Rare', 'starlight'], ['10000 Secret Rare', 'starlight'],
      ['Ghost Rare', 'ghost'], ['Gold Secret Rare', 'gold'], ['Premium Gold Rare', 'gold'], ["Collector's Rare", 'collector'],
      ['Ultimate Rare', 'ultimate'], ['Platinum Secret Rare', 'platinum'], ['Ultra Rare', 'high'], ['Super Rare', 'upper-mid'],
      ['Rare', 'mid'], ['Common', 'common'],
    ]
    for (const [rarity, tier] of cases) expect([rarity, rarityColorClass(rarity)]).toEqual([rarity, `rarity-color-${tier}`])
    expect(rarityColorClass(null)).toBe('rarity-color-none')
  })

  it('every premium tier has a different color', () => {
    const dark = Object.values(RARITY_COLORS).map((c) => c.dark)
    expect(new Set(dark).size).toBe(dark.length)
  })

  it('every rarity color is readable on every theme (4.5:1 on each background)', () => {
    for (const theme of THEMES) {
      const c = theme.colors
      for (const [tier, color] of Object.entries(RARITY_COLORS)) {
        for (const surface of [c.bg, c.bgElevated, c.bgElevated2]) {
          const ratio = contrastRatio(color[theme.scheme], surface)
          expect(ratio, `${tier} on ${theme.id} ${surface}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })
})
