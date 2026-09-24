import { describe, expect, it } from 'vitest'
import { moveOneCopy, sortDeckCards, withQuantity } from './deckEdits'
import { catalogOf, makeCard, makeDeck } from './testFixtures'

interface Entry {
  cardId: string
  quantity: number
}
const entries: Entry[] = [
  { cardId: 'a', quantity: 1 },
  { cardId: 'b', quantity: 2 },
  { cardId: 'c', quantity: 3 },
]
const is = (id: string) => (e: Entry) => e.cardId === id
const make = (id: string) => () => ({ cardId: id, quantity: 0 })

describe('withQuantity', () => {
  it('changes an existing entry without moving it', () => {
    expect(withQuantity(entries, is('a'), make('a'), 4)).toEqual([
      { cardId: 'a', quantity: 4 },
      { cardId: 'b', quantity: 2 },
      { cardId: 'c', quantity: 3 },
    ])
  })

  it('appends an entry that is not there yet', () => {
    expect(withQuantity(entries, is('d'), make('d'), 2).map((e) => [e.cardId, e.quantity])).toEqual([['a', 1], ['b', 2], ['c', 3], ['d', 2]])
  })

  it('removes an entry at quantity 0 (or below) and leaves the others in order', () => {
    expect(withQuantity(entries, is('b'), make('b'), 0).map((e) => e.cardId)).toEqual(['a', 'c'])
    expect(withQuantity(entries, is('b'), make('b'), -1).map((e) => e.cardId)).toEqual(['a', 'c'])
  })

  it('does not mutate its input', () => {
    const copy = structuredClone(entries)
    withQuantity(entries, is('a'), make('a'), 9)
    expect(entries).toEqual(copy)
  })
})

describe('moveOneCopy', () => {
  const a = makeCard('mtg', { name: 'A' })
  const b = makeCard('mtg', { name: 'B' })

  it('moves one copy and leaves the rest where they were', () => {
    const deck = makeDeck('mtg', { main: [[a, 3], [b, 1]], sideboard: [[a, 1]] })
    const moved = moveOneCopy(deck, 'main', 'sideboard', a.id)
    expect(moved.zones.main).toEqual([{ cardId: a.id, quantity: 2 }, { cardId: b.id, quantity: 1 }])
    expect(moved.zones.sideboard).toEqual([{ cardId: a.id, quantity: 2 }])
  })

  it('creates the entry in the target zone and removes the source entry when it was the last copy', () => {
    const deck = makeDeck('mtg', { main: [[a, 1], [b, 1]] })
    const moved = moveOneCopy(deck, 'main', 'commander', a.id)
    expect(moved.zones.main).toEqual([{ cardId: b.id, quantity: 1 }])
    expect(moved.zones.commander).toEqual([{ cardId: a.id, quantity: 1 }])
  })

  it('does nothing if the card is not in the source zone, and never mutates the original', () => {
    const deck = makeDeck('mtg', { main: [[a, 2]] })
    const before = structuredClone(deck)
    expect(moveOneCopy(deck, 'sideboard', 'main', a.id)).toBe(deck)
    moveOneCopy(deck, 'main', 'sideboard', a.id)
    expect(deck).toEqual(before)
  })
})

describe('sortDeckCards', () => {
  const op = (name: string, category: string, cost: string | null) => makeCard('onepiece', { name, category, cost })
  const leader = op('Buggy', 'Leader', null)
  const zoro = op('Zoro', 'Character', '3')
  const ace = op('Ace', 'Character', '5')
  const nami = op('Nami', 'Character', '1')
  const gum = op('Gum-Gum Pistol', 'Event', '1')
  const cards = catalogOf([leader, zoro, ace, nami, gum])
  const deck = makeDeck('onepiece', { leader: [[leader, 1]], main: [[ace, 4], [gum, 2], [zoro, 3], [nami, 4]] })
  const order = (d: typeof deck) => d.zones.main.map((e) => cards.get(e.cardId)!.name)

  it('sorts by cost, then name', () => {
    expect(order(sortDeckCards(deck, 'cost', cards))).toEqual(['Gum-Gum Pistol', 'Nami', 'Zoro', 'Ace'])
  })

  it('sorts by name', () => {
    expect(order(sortDeckCards(deck, 'name', cards))).toEqual(['Ace', 'Gum-Gum Pistol', 'Nami', 'Zoro'])
  })

  it("sorts by the game's type order, then cost", () => {
    expect(order(sortDeckCards(deck, 'type', cards, ['Leader', 'Character', 'Event']))).toEqual(['Nami', 'Zoro', 'Ace', 'Gum-Gum Pistol'])
  })

  it('keeps quantities and leaves cards missing from the catalog at the end', () => {
    const withUnknown = { ...deck, zones: { ...deck.zones, main: [{ cardId: 'onepiece:gone', quantity: 2 }, ...deck.zones.main] } }
    const sorted = sortDeckCards(withUnknown, 'name', cards)
    expect(sorted.zones.main.at(-1)).toEqual({ cardId: 'onepiece:gone', quantity: 2 })
    expect(sorted.zones.main.find((e) => e.cardId === ace.id)?.quantity).toBe(4)
  })

  it('returns the same deck when already in order', () => {
    const sorted = sortDeckCards(deck, 'name', cards)
    expect(sortDeckCards(sorted, 'name', cards)).toBe(sorted)
  })
})
