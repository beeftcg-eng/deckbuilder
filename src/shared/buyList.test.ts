import { describe, expect, it } from 'vitest'
import { buyList, cheapestPrinting, massEntryText, withCheapestPrintings } from './buyList'
import { poolKey } from './collection'
import { catalogOf, makeCard, makeDeck } from './testFixtures'

const boltPricey = makeCard('mtg', { name: 'Lightning Bolt', setCode: 'SLD', number: '901', price: 12, text: 'Deal 3 damage to any target.', rarity: 'Rare' })
const boltCheap = makeCard('mtg', { name: 'Lightning Bolt', setCode: '2XM', number: '129', price: 0.9, text: 'Deal 3 damage to any target.', rarity: 'Uncommon' })
const boltUnpriced = makeCard('mtg', { name: 'Lightning Bolt', setCode: 'LEA', number: '161', price: null, text: 'Deal 3 damage to any target.' })
const island = makeCard('mtg', { name: 'Island', price: 0.1 })
const mystery = makeCard('mtg', { name: 'Mystery Card', price: null })
const mtg = [boltPricey, boltCheap, boltUnpriced, island, mystery]

describe('cheapestPrinting', () => {
  it('picks the cheapest priced printing of the same card', () => {
    expect(cheapestPrinting(boltPricey, mtg)).toBe(boltCheap)
    expect(cheapestPrinting(boltUnpriced, mtg)).toBe(boltCheap)
    expect(cheapestPrinting(mystery, mtg)).toBe(mystery)
  })

  it('doesn’t swap in a different card that shares the name (Pokémon)', () => {
    const pikachuA = makeCard('pokemon', { name: 'Pikachu', price: 3, text: 'Thunder Shock 20' })
    const pikachuB = makeCard('pokemon', { name: 'Pikachu', price: 0.1, text: 'Gnaw 10' })
    expect(cheapestPrinting(pikachuA, [pikachuA, pikachuB])).toBe(pikachuA)
  })

  it('prefers the regular printing when the price ties', () => {
    const regular = makeCard('onepiece', { sourceId: 'OP01-001', name: 'Zoro', price: 1, rarity: 'L' })
    const parallel = makeCard('onepiece', { id: 'onepiece:OP01-001_p1', sourceId: 'OP01-001', name: 'Zoro', price: 1, rarity: 'L' })
    expect(cheapestPrinting(parallel, [parallel, regular])).toBe(regular)
  })
})

describe('buyList', () => {
  const deck = makeDeck('mtg', { main: [[boltPricey, 4], [island, 10], [mystery, 2]] })
  const cardsById = catalogOf(mtg)

  it('lists what you don’t own at the cheapest printings, with what that saves', () => {
    const list = buyList(deck, cardsById, mtg, new Map([[poolKey(boltCheap), 1]]), 'cheapest')
    expect(list.rows.map((r) => [r.card.id, r.quantity])).toEqual([
      [boltCheap.id, 3],
      [island.id, 10],
      [mystery.id, 2],
    ])
    expect(list.total).toBeCloseTo(3 * 0.9 + 10 * 0.1)
    expect(list.unpricedCopies).toBe(2)
    expect(list.deckPrintingsTotal).toBeCloseTo(3 * 12 + 10 * 0.1)
  })

  it('keeps the deck’s own printings when asked', () => {
    const list = buyList(deck, cardsById, mtg, new Map(), 'deck')
    expect(list.rows[0]).toMatchObject({ card: boltPricey, quantity: 4 })
    expect(list.total).toBeCloseTo(4 * 12 + 1)
  })

  it('writes TCGplayer Mass Entry lines, with the set for Magic and without printing notes elsewhere', () => {
    const rows = buyList(deck, cardsById, mtg, new Map(), 'cheapest').rows
    expect(massEntryText(rows).split('\n')[0]).toBe('4 Lightning Bolt [2XM]')
    const alt = makeCard('riftbound', { name: 'Poppy - Paragon (Alternate Art)', price: 2 })
    expect(massEntryText([{ card: alt, deckCard: alt, quantity: 1, unitPrice: 2 }])).toBe('1 Poppy - Paragon')
  })
})

describe('withCheapestPrintings', () => {
  const cardsById = catalogOf(mtg)

  it('moves each card to its cheapest printing, merging copies that land on the same one', () => {
    const deck = makeDeck('mtg', { main: [[boltPricey, 2], [island, 10], [boltCheap, 1]] })
    const result = withCheapestPrintings(deck, cardsById, mtg, () => 0)
    expect(result.deck.zones.main).toEqual([
      { cardId: boltCheap.id, quantity: 3 },
      { cardId: island.id, quantity: 10 },
    ])
    expect(result.changedCopies).toBe(2)
    expect(result.before).toBeCloseTo(2 * 12 + 1 + 0.9)
    expect(result.after).toBeCloseTo(3 * 0.9 + 1)
  })

  it('keeps a printing you own and skips replacements that aren’t legal', () => {
    const deck = makeDeck('mtg', { main: [[boltPricey, 4]] })
    expect(withCheapestPrintings(deck, cardsById, mtg, (id) => (id === boltPricey.id ? 1 : 0)).changedCopies).toBe(0)
    const kept = withCheapestPrintings(deck, cardsById, mtg, () => 0, (c) => c.id !== boltCheap.id)
    expect(kept.deck).toBe(deck)
  })
})
