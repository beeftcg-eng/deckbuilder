import type { Card, Deck } from './types'
import { compareByCostThenName } from './deckView'

/**
 * Returns `entries` with one item's quantity set. An existing item keeps its
 * position (so a deck entry doesn't jump to the bottom of its zone each time
 * you click +/−, which made a second click land on a different card); a new
 * one is appended; a quantity of 0 or less removes it.
 */
export function withQuantity<T extends { quantity: number }>(entries: T[], matches: (entry: T) => boolean, create: () => T, quantity: number): T[] {
  if (quantity <= 0) return entries.filter((e) => !matches(e))
  const index = entries.findIndex(matches)
  if (index === -1) return [...entries, { ...create(), quantity }]
  return entries.map((e, i) => (i === index ? { ...e, quantity } : e))
}

/**
 * Moves one copy of a card from one zone to another (main deck ⇄ sideboard, main ⇄ commander),
 * as a single edit so it undoes in one step. Returns the deck unchanged if it isn't in the source zone.
 */
export function moveOneCopy(deck: Deck, fromZoneId: string, toZoneId: string, cardId: string): Deck {
  const from = deck.zones[fromZoneId] ?? []
  const source = from.find((e) => e.cardId === cardId)
  if (!source) return deck
  const to = deck.zones[toZoneId] ?? []
  const already = to.find((e) => e.cardId === cardId)?.quantity ?? 0
  const matches = (e: { cardId: string }) => e.cardId === cardId
  const create = () => ({ cardId, quantity: 0 })
  return {
    ...deck,
    zones: {
      ...deck.zones,
      [fromZoneId]: withQuantity(from, matches, create, source.quantity - 1),
      [toZoneId]: withQuantity(to, matches, create, already + 1),
    },
  }
}

export type DeckCardSort = 'type' | 'cost' | 'name'

export const DECK_CARD_SORTS: readonly DeckCardSort[] = ['type', 'cost', 'name']

/**
 * Re-orders the cards in every zone once (the deck keeps that order afterwards, and can still be dragged).
 * 'cost' and 'type' break ties by name (compareByCostThenName); 'type' follows the game's own type order, types it
 * doesn't list going after those that it does, alphabetically. The sort is stable, so printings of one card stay in
 * the order they were in. Cards missing from the catalog keep their order at the end of their zone. Returns the
 * deck unchanged if nothing moved.
 */
export function sortDeckCards(deck: Deck, sort: DeckCardSort, cardsById: Map<string, Card>, typeOrder: readonly string[] = []): Deck {
  const typeRank = (card: Card) => {
    const index = typeOrder.indexOf(card.category)
    return index === -1 ? typeOrder.length : index
  }
  const compare = (a: Card, b: Card): number => {
    if (sort === 'name') return a.name.localeCompare(b.name)
    if (sort === 'type') return typeRank(a) - typeRank(b) || a.category.localeCompare(b.category) || compareByCostThenName(a, b)
    return compareByCostThenName(a, b)
  }
  let changed = false
  const zones: Deck['zones'] = {}
  for (const [zoneId, entries] of Object.entries(deck.zones)) {
    const known = entries.filter((e) => cardsById.has(e.cardId))
    const unknown = entries.filter((e) => !cardsById.has(e.cardId))
    const sorted = [...known.sort((a, b) => compare(cardsById.get(a.cardId)!, cardsById.get(b.cardId)!)), ...unknown]
    if (sorted.some((e, i) => e !== entries[i])) changed = true
    zones[zoneId] = sorted
  }
  return changed ? { ...deck, zones } : deck
}
