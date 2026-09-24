import { describe, expect, it } from 'vitest'
import { addToBinder, addToDeck, deckMoveProblem, takeFromBinder, takeFromDeck, zoneForCard } from './cardMoves'
import { makeCard, makeDeck } from './testFixtures'
import type { Binder } from './types'

const binder = (cards: Record<string, number>): Binder => ({ id: 'b', name: 'Staples', cards, createdAt: 'c', updatedAt: 'u' })

describe('card moves', () => {
  it('takes copies out of a binder, dropping the card at zero', () => {
    expect(takeFromBinder(binder({ a: 3 }), 'a', 2).cards).toEqual({ a: 1 })
    expect(takeFromBinder(binder({ a: 3 }), 'a', 3).cards).toEqual({})
    expect(takeFromBinder(binder({ a: 1 }), 'a', 5).cards).toEqual({})
  })
  it('adds copies to a binder and a deck zone', () => {
    expect(addToBinder(binder({ a: 1 }), 'a', 2).cards).toEqual({ a: 3 })
    expect(addToBinder(binder({}), 'b', 1).cards).toEqual({ b: 1 })
    const spell = makeCard('yugioh', { name: 'Pot of Prosperity', category: 'Spell' })
    const deck = { ...makeDeck('yugioh', { main: [[spell, 1]] }), formatId: 'tcg' }
    expect(addToDeck(deck, 'main', spell.id, 2).zones.main).toEqual([{ cardId: spell.id, quantity: 3 }])
  })
  it('puts a card in the zone the browser would, and says when it cannot go in', () => {
    const fusion = makeCard('yugioh', { name: 'Blue-Eyes Ultimate Dragon', category: 'Monster', subtypes: ['Dragon', 'Fusion', 'Extra Deck'] })
    const spell = makeCard('yugioh', { name: 'Pot of Prosperity', category: 'Spell' })
    const deck = { ...makeDeck('yugioh', {}), formatId: 'tcg' }
    expect(zoneForCard(deck, spell)?.id).toBe('main')
    expect(zoneForCard(deck, fusion)?.id).toBe('extra')
    expect(deckMoveProblem(deck, spell)).toBeNull()
    expect(deckMoveProblem({ ...deck, locked: true }, spell)).toMatch(/locked/)
    expect(deckMoveProblem({ ...makeDeck('riftbound', {}), name: 'Jinx' }, spell)).toMatch(/Riftbound deck/)
  })
})

describe('takeFromDeck', () => {
  it('takes copies out of one zone, dropping the entry at zero', () => {
    const spell = makeCard('yugioh', { name: 'Pot of Prosperity', category: 'Spell' })
    const deck = { ...makeDeck('yugioh', { main: [[spell, 3]], sideboard: [[spell, 1]] }), formatId: 'tcg' }
    expect(takeFromDeck(deck, 'main', spell.id, 2).zones.main).toEqual([{ cardId: spell.id, quantity: 1 }])
    expect(takeFromDeck(deck, 'main', spell.id, 3).zones.main).toEqual([])
    expect(takeFromDeck(deck, 'main', spell.id, 3).zones.sideboard).toEqual([{ cardId: spell.id, quantity: 1 }])
  })
})
