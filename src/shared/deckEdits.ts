import type { Deck } from './types'

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
