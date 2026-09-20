import type { Card, Deck, GameId } from './types'
import { getAdapter } from './games/registry'

export function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * What counts as "the same card" when comparing what a deck needs against
 * what you own: the same rule the copy limit uses (see DeckRules.copyLimitBy),
 * so owning any printing of Professor's Research covers a deck slot for it,
 * and One Piece reprints with a different card number stay separate.
 */
export function poolKey(card: Card): string {
  const by = getAdapter(card.gameId).deckRules.copyLimitBy
  return `${card.gameId}:${by === 'sourceId' ? card.sourceId : normalizeName(card.name)}`
}

interface QuantityItem {
  cardId: string
  quantity: number
}

/**
 * Totals `items` per pool key. Ids that aren't in the loaded catalog (the
 * game hasn't been synced yet) fall back to their own id so they still count
 * for themselves.
 */
export function buildPoolIndex(items: QuantityItem[], lookup: (cardId: string) => Card | undefined): Map<string, number> {
  const index = new Map<string, number>()
  for (const { cardId, quantity } of items) {
    if (quantity <= 0) continue
    const card = lookup(cardId)
    const key = card ? poolKey(card) : `id:${cardId}`
    index.set(key, (index.get(key) ?? 0) + quantity)
  }
  return index
}

export function gameIdOfCardId(cardId: string): GameId | null {
  const prefix = cardId.slice(0, cardId.indexOf(':'))
  return prefix === 'pokemon' || prefix === 'onepiece' || prefix === 'riftbound' ? prefix : null
}

export interface DeckNeed {
  /** First printing of this card seen in the deck — the one to wishlist or mark owned. */
  card: Card
  needed: number
}

/** Copies the deck uses per pool, across every zone. */
export function neededByPool(deck: Deck, cardsById: Map<string, Card>): Map<string, DeckNeed> {
  const needs = new Map<string, DeckNeed>()
  for (const entries of Object.values(deck.zones)) {
    for (const { cardId, quantity } of entries) {
      const card = cardsById.get(cardId)
      if (!card || quantity <= 0) continue
      const key = poolKey(card)
      const existing = needs.get(key)
      if (existing) existing.needed += quantity
      else needs.set(key, { card, needed: quantity })
    }
  }
  return needs
}

export interface MissingCard {
  card: Card
  quantity: number
}

/**
 * What's still to get for a deck: copies needed minus copies owned, minus
 * copies already `covered` some other way (e.g. sitting on the wishlist).
 */
export function missingForDeck(
  deck: Deck,
  cardsById: Map<string, Card>,
  owned: Map<string, number>,
  covered: Map<string, number> = new Map(),
): MissingCard[] {
  const missing: MissingCard[] = []
  for (const [key, { card, needed }] of neededByPool(deck, cardsById)) {
    const quantity = needed - (owned.get(key) ?? 0) - (covered.get(key) ?? 0)
    if (quantity > 0) missing.push({ card, quantity })
  }
  return missing
}

export interface PriceTotal {
  total: number
  /** Copies with no known price, which the total leaves out. */
  unpricedCopies: number
}

export function totalPrice(items: { card: Card; quantity: number }[]): PriceTotal {
  let total = 0
  let unpricedCopies = 0
  for (const { card, quantity } of items) {
    if (card.price != null) total += card.price * quantity
    else unpricedCopies += quantity
  }
  return { total, unpricedCopies }
}

export function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`
}
