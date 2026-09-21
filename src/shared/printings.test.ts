import { describe, expect, it } from 'vitest'
import { choosePrinting, isAlternateArt, rarityRank } from './printings'
import { parseDecklistText } from './importDeck'
import { riftboundAdapter } from './games/riftbound'
import { pokemonAdapter } from './games/pokemon'
import { onepieceAdapter } from './games/onepiece'
import { catalogOf, makeCard } from './testFixtures'

describe('rarityRank', () => {
  it('orders the rarity names the four games use from plain to special', () => {
    const order = ['Common', 'Uncommon', 'Rare', 'Epic', 'Mythic', 'Showcase', 'Promo']
    expect(order.map(rarityRank)).toEqual([...order.map(rarityRank)].sort((a, b) => a - b))
    expect(rarityRank('C')).toBeLessThan(rarityRank('SR'))
    expect(rarityRank('SR')).toBeLessThan(rarityRank('SEC'))
    expect(rarityRank('Rare Holo')).toBeLessThan(rarityRank('Illustration Rare'))
    expect(rarityRank('Illustration Rare')).toBeLessThan(rarityRank('Special Illustration Rare'))
  })
  it('puts unknown or missing rarities in the middle, below the special ones and above Common', () => {
    expect(rarityRank(null)).toBeGreaterThan(rarityRank('Common'))
    expect(rarityRank('Brand New Rarity')).toBeLessThan(rarityRank('Promo'))
  })
})

describe('isAlternateArt', () => {
  it('recognises One Piece parallels, Riftbound alternate numbering and Showcase printings', () => {
    expect(isAlternateArt(makeCard('onepiece', { name: 'A', sourceId: 'OP01-003', id: 'onepiece:OP01-003_p1' }))).toBe(true)
    expect(isAlternateArt(makeCard('onepiece', { name: 'A', sourceId: 'OP01-003' }))).toBe(false)
    expect(isAlternateArt(makeCard('riftbound', { name: 'B', sourceId: 'unl-229*-219' }))).toBe(true)
    expect(isAlternateArt(makeCard('riftbound', { name: 'B', sourceId: 'unl-100-219', rarity: 'Showcase' }))).toBe(true)
    expect(isAlternateArt(makeCard('riftbound', { name: 'B', sourceId: 'opp-100-219', rarity: 'Promo' }))).toBe(true)
    expect(isAlternateArt(makeCard('riftbound', { name: 'B', sourceId: 'unl-100-219', rarity: 'Common' }))).toBe(false)
  })
})

describe('choosePrinting', () => {
  // The catalog order that caused the bug: the Promo is listed before the regular Common.
  const promo = makeCard('riftbound', { name: 'Voracious Gromp', sourceId: 'opp-100-219', rarity: 'Promo', setCode: 'OPP' })
  const common = makeCard('riftbound', { name: 'Voracious Gromp', sourceId: 'unl-100-219', rarity: 'Common', setCode: 'UNL' })
  const showcase = makeCard('riftbound', { name: 'Voracious Gromp', sourceId: 'unl-100*-219', rarity: 'Showcase', setCode: 'UNL' })

  it('takes the regular, lowest-rarity printing, not whichever comes first', () => {
    expect(choosePrinting([promo, showcase, common])).toBe(common)
    expect(choosePrinting([showcase, promo])).toBe(showcase) // rank: Showcase (6) < Promo (7)
  })
  it('falls back to the catalog order for equally plain printings, and handles empty lists', () => {
    const a = makeCard('pokemon', { name: 'X', rarity: 'Common' })
    const b = makeCard('pokemon', { name: 'X', rarity: 'Common' })
    expect(choosePrinting([a, b])).toBe(a)
    expect(choosePrinting([])).toBeUndefined()
    expect(choosePrinting(undefined)).toBeUndefined()
  })
  it('prefers a printing you own, even a fancy one', () => {
    expect(choosePrinting([promo, common], { owned: (c) => (c === promo ? 2 : 0) })).toBe(promo)
    expect(choosePrinting([promo, common], { owned: () => 0 })).toBe(common)
  })
  it('prefers a printing that is legal in the format over one that is not', () => {
    const rotated = makeCard('onepiece', { name: 'Perona', sourceId: 'OP01-077', rarity: 'C' })
    const current = makeCard('onepiece', { name: 'Perona', sourceId: 'OP09-034', rarity: 'SR' })
    expect(choosePrinting([rotated, current], { legal: (c) => c === current })).toBe(current)
    expect(choosePrinting([rotated, current])).toBe(rotated)
  })
  it('lets legality beat ownership, which beats plainness', () => {
    const illegalOwned = makeCard('onepiece', { name: 'P', sourceId: 'A', rarity: 'C' })
    const legalAlt = makeCard('onepiece', { name: 'P', sourceId: 'B', rarity: 'C', id: 'onepiece:B_p1' })
    expect(choosePrinting([illegalOwned, legalAlt], { legal: (c) => c === legalAlt, owned: (c) => (c === illegalOwned ? 1 : 0) })).toBe(legalAlt)
  })
})

describe('decklist import picks the regular printing (the bug)', () => {
  it('Riftbound: "4 Voracious Gromp" no longer lands on the Promo listed first', () => {
    const promo = makeCard('riftbound', { name: 'Voracious Gromp', sourceId: 'opp-100-219', rarity: 'Promo', category: 'Unit' })
    const common = makeCard('riftbound', { name: 'Voracious Gromp', sourceId: 'unl-100-219', rarity: 'Common', category: 'Unit' })
    const catalog = catalogOf([promo, common])
    expect(parseDecklistText('4 Voracious Gromp', riftboundAdapter, catalog).zones.main).toEqual([{ cardId: common.id, quantity: 4 }])
    // …but a list that names the promo's number still gets the promo, and owning it makes a name-only line use it.
    expect(parseDecklistText('4 opp-100-219 Voracious Gromp', riftboundAdapter, catalog).zones.main).toEqual([{ cardId: promo.id, quantity: 4 }])
    expect(parseDecklistText('4 Voracious Gromp', riftboundAdapter, catalog, undefined, { owned: (c) => (c === promo ? 4 : 0) }).zones.main).toEqual([{ cardId: promo.id, quantity: 4 }])
  })

  it('Pokémon: name-only lines take the plain printing, not the first / fanciest', () => {
    const fullArt = makeCard('pokemon', { name: "Professor's Research", rarity: 'Ultra Rare', category: 'Trainer', setCode: 'SVI', number: '190' })
    const regular = makeCard('pokemon', { name: "Professor's Research", rarity: 'Uncommon', category: 'Trainer', setCode: 'SVI', number: '189' })
    const catalog = catalogOf([fullArt, regular])
    expect(parseDecklistText("4 Professor's Research", pokemonAdapter, catalog).zones.main).toEqual([{ cardId: regular.id, quantity: 4 }])
    expect(parseDecklistText("4 Professor's Research SVI 190", pokemonAdapter, catalog).zones.main).toEqual([{ cardId: fullArt.id, quantity: 4 }])
  })

  it('One Piece: a card number resolves to the regular printing over its parallel', () => {
    const base = makeCard('onepiece', { name: 'Perona', sourceId: 'OP01-077', category: 'Character', rarity: 'UC' })
    const parallel = makeCard('onepiece', { name: 'Perona', sourceId: 'OP01-077', id: 'onepiece:OP01-077_p1', category: 'Character', rarity: 'UC' })
    expect(parseDecklistText('4 OP01-077', onepieceAdapter, catalogOf([parallel, base])).zones.main).toEqual([{ cardId: base.id, quantity: 4 }])
  })
})
