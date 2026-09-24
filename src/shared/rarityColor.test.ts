import { describe, expect, it } from 'vitest'
import { RARITY_COLORS, rarityColorClass } from './rarityColor'
import { THEMES, contrastRatio } from './themes'

describe('rarityColorClass', () => {
  it('gives Yu-Gi-Oh premium rarities their own colors instead of one shared yellow', () => {
    const cases: [string, string][] = [
      ['Secret Rare', 'top'], ['Prismatic Secret Rare', 'prismatic'], ['Ultra Secret Rare', 'top'], ['Mythic', 'top'],
      ['Quarter Century Secret Rare', 'qcsr'], ['Starlight Rare', 'starlight'], ['10000 Secret Rare', 'starlight'],
      ['Ghost Rare', 'ghost'], ['Gold Secret Rare', 'gold-secret'], ['Premium Gold Rare', 'premium-gold'], ['Gold Rare', 'gold'], ["Collector's Rare", 'collector'],
      ['Ultimate Rare', 'ultimate'], ['Platinum Secret Rare', 'platinum'], ['PLatinum Secret Rare', 'platinum'], ['Platinum Rare', 'platinum-rare'],
      ['Duel Terminal Normal Parallel Rare', 'parallel'], ['Ultra Parallel Rare', 'parallel'], ['Starfoil Rare', 'starfoil'], ['Starfoil', 'starfoil'],
      ['Shatterfoil Rare', 'shatterfoil'], ['Mosaic Rare', 'mosaic'], ['Short Print', 'short-print'], ['Super Short Print', 'short-print'],
      ['Grand Master Rare', 'grand-master'], ["Ultra Rare (Pharaoh's Rare)", 'pharaoh'], ['Extra Secret Rare', 'extra-secret'], ['Ghost/Gold Rare', 'ghost'],
      ['Ultra Rare', 'high'], ['Super Rare', 'upper-mid'], ['Rare', 'mid'], ['Common', 'common'],
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
