import { getAdapter } from './games/registry'
import { rulesForFormat } from './games/rules'
import type { Binder, Card, Deck, DeckZoneRule } from './types'

/**
 * Moving copies out of a binder: into another binder, or into a deck (pulling cards from a binder to
 * build with them). A move takes the copies out of the binder it came from; the collection itself is
 * untouched either way, since the cards are still owned.
 */

/** The zone a card goes in when added to a deck: the first one it fits that isn't manual-only, like the card browser's click. */
export function zoneForCard(deck: Deck, card: Card): DeckZoneRule | undefined {
  return rulesForFormat(getAdapter(deck.gameId), deck.formatId).zones.find((z) => !z.freeText && !z.manualOnly && z.match(card))
}

/** Copies still in `binder` after taking `quantity` of `cardId` out (never below 0). */
export function takeFromBinder(binder: Binder, cardId: string, quantity: number): Binder {
  const cards = { ...binder.cards }
  const left = (cards[cardId] ?? 0) - quantity
  if (left > 0) cards[cardId] = left
  else delete cards[cardId]
  return { ...binder, cards }
}

export function addToBinder(binder: Binder, cardId: string, quantity: number): Binder {
  return { ...binder, cards: { ...binder.cards, [cardId]: (binder.cards[cardId] ?? 0) + quantity } }
}

export function addToDeck(deck: Deck, zoneId: string, cardId: string, quantity: number): Deck {
  const entries = deck.zones[zoneId] ?? []
  const existing = entries.find((e) => e.cardId === cardId)
  const next = existing
    ? entries.map((e) => (e.cardId === cardId ? { ...e, quantity: e.quantity + quantity } : e))
    : [...entries, { cardId, quantity }]
  return { ...deck, zones: { ...deck.zones, [zoneId]: next } }
}

/** Why a card can't be moved into this deck, or null when it can. */
export function deckMoveProblem(deck: Deck, card: Card): string | null {
  if (deck.gameId !== card.gameId) return `"${deck.name}" is a ${getAdapter(deck.gameId).shortName} deck.`
  if (deck.locked) return `"${deck.name}" is locked. Unlock it to add cards.`
  if (!zoneForCard(deck, card)) return `${card.name} can't go in any of "${deck.name}"'s zones.`
  return null
}

/** The deck after taking `quantity` copies of `cardId` out of one zone (never below 0). */
export function takeFromDeck(deck: Deck, zoneId: string, cardId: string, quantity: number): Deck {
  const entries = (deck.zones[zoneId] ?? []).flatMap((e) => {
    if (e.cardId !== cardId) return [e]
    const left = e.quantity - quantity
    return left > 0 ? [{ ...e, quantity: left }] : []
  })
  return { ...deck, zones: { ...deck.zones, [zoneId]: entries } }
}

/** Where copies move from or to. A deck source names its zone; a deck target uses zoneForCard. */
export type MoveEnd = { kind: 'binder'; id: string } | { kind: 'deck'; id: string; zoneId?: string }
