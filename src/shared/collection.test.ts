import { describe, expect, it } from 'vitest'
import { buildPoolIndex, missingForDeck, poolKey, totalPrice } from './collection'
import { computeDeckStats } from './deckStats'
import { catalogOf, makeCard, makeDeck } from './testFixtures'

describe('poolKey', () => {
  it('pools Pokémon printings by name', () => {
    const a = makeCard('pokemon', { name: "Professor's Research", sourceId: 'sv1-189' })
    const b = makeCard('pokemon', { name: 'Professor’s Research', sourceId: 'cpa-62' })
    expect(poolKey(a)).toBe(poolKey(b))
  })

  it('keeps One Piece reprints with different numbers apart but merges alt arts of one number', () => {
    const base = makeCard('onepiece', { name: 'Charlotte Brulee', sourceId: 'OP08-066' })
    const alt = makeCard('onepiece', { name: 'Charlotte Brulee', sourceId: 'OP08-066', id: 'onepiece:OP08-066_p1' })
    const starter = makeCard('onepiece', { name: 'Charlotte Brulee', sourceId: 'ST34-003' })
    expect(poolKey(base)).toBe(poolKey(alt))
    expect(poolKey(base)).not.toBe(poolKey(starter))
  })
})

describe('missingForDeck', () => {
  const research = makeCard('pokemon', { name: "Professor's Research", sourceId: 'sv1-189', price: 0.5 })
  const researchAlt = makeCard('pokemon', { name: "Professor's Research", sourceId: 'cpa-62', price: 0.25 })
  const pikachu = makeCard('pokemon', { name: 'Pikachu', sourceId: 'sv1-25' })
  const catalog = catalogOf([research, researchAlt, pikachu])
  const deck = makeDeck('pokemon', { main: [[research, 3], [pikachu, 2]] })
  const lookup = (id: string) => catalog.get(id)

  it('subtracts owned copies of any printing of the same card', () => {
    const owned = buildPoolIndex([{ cardId: researchAlt.id, quantity: 2 }], lookup)
    const missing = missingForDeck(deck, catalog, owned)
    expect(missing.map((m) => [m.card.name, m.quantity])).toEqual([["Professor's Research", 1], ['Pikachu', 2]])
  })

  it('also subtracts copies already covered (e.g. on the wishlist)', () => {
    const owned = buildPoolIndex([{ cardId: research.id, quantity: 1 }], lookup)
    const wishlisted = buildPoolIndex([{ cardId: research.id, quantity: 1 }, { cardId: pikachu.id, quantity: 5 }], lookup)
    const missing = missingForDeck(deck, catalog, owned, wishlisted)
    expect(missing.map((m) => [m.card.name, m.quantity])).toEqual([["Professor's Research", 1]])
  })

  it('reports nothing when everything is owned', () => {
    const owned = buildPoolIndex([{ cardId: research.id, quantity: 3 }, { cardId: pikachu.id, quantity: 2 }], lookup)
    expect(missingForDeck(deck, catalog, owned)).toEqual([])
  })

  it('totals prices and counts copies with no price separately', () => {
    expect(totalPrice([{ card: research, quantity: 2 }, { card: pikachu, quantity: 3 }])).toEqual({ total: 1, unpricedCopies: 3 })
  })
})

describe('computeDeckStats', () => {
  const leader = makeCard('onepiece', { name: 'Leader', category: 'Leader', cost: null, colors: ['Red'] })
  const cheap = makeCard('onepiece', { name: 'Cheap', category: 'Character', cost: '1', colors: ['Red'], price: 1 })
  const pricey = makeCard('onepiece', { name: 'Pricey', category: 'Character', cost: '5', colors: ['Red', 'Blue'], price: 2 })
  const event = makeCard('onepiece', { name: 'Event', category: 'Event', cost: '-', colors: ['Blue'] })
  const catalog = catalogOf([leader, cheap, pricey, event])
  const deck = makeDeck('onepiece', { leader: [[leader, 1]], main: [[cheap, 4], [pricey, 2], [event, 1]] })
  const stats = computeDeckStats(deck, catalog)

  it('counts every zone but builds the curve from the main zone only', () => {
    expect(stats.totalCards).toBe(8)
    expect(stats.curve.map((c) => c.count)).toEqual([0, 4, 0, 0, 0, 2])
    expect(stats.averageCost).toBeCloseTo((4 * 1 + 2 * 5) / 6)
  })

  it('breaks down by category and color, and sums known prices', () => {
    expect(stats.byCategory[0]).toEqual(['Character', 6])
    expect(Object.fromEntries(stats.byColor)).toEqual({ Red: 7, Blue: 3 })
    expect(stats.price).toEqual({ total: 8, unpricedCopies: 2 })
  })

  it('handles a deck with no costs', () => {
    const empty = computeDeckStats(makeDeck('onepiece', { leader: [[leader, 1]] }), catalog)
    expect(empty.curve).toEqual([])
    expect(empty.averageCost).toBeNull()
  })
})
