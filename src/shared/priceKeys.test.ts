import { describe, expect, it } from 'vitest'
import { riftboundKey, riftboundKeys, normalizeNumber, pokemonKey, pokemonKeys, pokemonPromoKey, splitYugiohCode, yugiohExactKey, yugiohKey, yugiohKeys } from './priceKeys'
import { applyPriceFile } from './priceFiles'
import { makeCard } from './testFixtures'

describe('price keys', () => {
  it('normalises collector numbers', () => {
    expect(normalizeNumber('001/165')).toBe('1')
    expect(normalizeNumber('SWSH048')).toBe('swsh48')
    expect(normalizeNumber('TG12')).toBe('tg12')
    expect(normalizeNumber('215')).toBe('215')
  })

  it('matches Pokémon sets by code or id, however TCGplayer spells them', () => {
    expect(pokemonKey('SWSH08', '001/264')).toBe(pokemonKey('swsh8', '1'))
    expect(pokemonKey('SWSH12: TG', 'TG05')).toBe(pokemonKey('swsh12tg', 'TG5'))
    expect(pokemonKey('JTG', '074/159')).toBe(pokemonKey('JTG', '74'))
    expect(pokemonKeys('PR-SW', 'swshp', 'SWSH048')).toContain(pokemonPromoKey('SWSH048'))
    expect(pokemonPromoKey('48')).toBeNull()
  })

  it('matches Yu-Gi-Oh! codes with or without the region, exact code first', () => {
    expect(yugiohKey('LOB', 'EN001')).toBe(yugiohKey('LOB', '001'))
    expect(yugiohKey('LOB', 'E001', 'Ultra Rare')).toBe('LOB-1|ultrarare')
    expect(yugiohExactKey('LOB', '001')).not.toBe(yugiohExactKey('LOB', 'E001'))
    expect(yugiohKeys('LOB', '001', 'Ultra Rare')[0]).toBe(yugiohExactKey('LOB', '001', 'Ultra Rare'))
    expect(splitYugiohCode('MP21-EN144')).toEqual(['MP21', 'EN144'])
    expect(splitYugiohCode('not a code')).toBeNull()
  })

  it('matches Riftbound by product id, else set + printed number with its variant suffix', () => {
    expect(riftboundKeys('705998', 'ven-021-166')).toEqual(['705998'])
    expect(riftboundKeys(undefined, 'ven-021a-166')).toEqual([riftboundKey('VEN', '021a/166')])
  })

  it('applies the first price found and leaves the rest alone', () => {
    const a = makeCard('pokemon', { name: 'A', price: 1 })
    const b = makeCard('pokemon', { name: 'B', price: 2 })
    const out = applyPriceFile([a, b], { prices: { x: 9, y: 0 } }, (c) => (c.name === 'A' ? ['missing', 'x'] : ['y']))
    expect(out.map((c) => c.price)).toEqual([9, 2])
    expect(applyPriceFile([a], null, () => ['x'])[0]).toBe(a)
  })

  it('applies foil prices beside the regular ones', () => {
    const a = makeCard('pokemon', { name: 'A', price: 1, foilPrice: 3 })
    const [priced] = applyPriceFile([a], { prices: { x: 2 }, foilPrices: { x: 6 } }, () => ['x'])
    expect([priced.price, priced.foilPrice]).toEqual([2, 6])
    // A file from before foil prices keeps the card's own.
    expect(applyPriceFile([a], { prices: { x: 2 } }, () => ['x'])[0].foilPrice).toBe(3)
  })
})
