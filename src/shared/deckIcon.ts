import type { Card, Deck } from './types'
import type { GameAdapter } from './games/types'
import { rulesForFormat } from './games/rules'

function isInDeck(deck: Deck, cardId: string): boolean {
  return Object.values(deck.zones).some((entries) => entries.some((e) => e.cardId === cardId && e.quantity > 0))
}

/**
 * The card that stands for a deck in the deck list, so decks can be told apart at a glance:
 *  1. the card you picked as its icon (as long as it's still in the deck);
 *  2. otherwise the deck's face — its Leader / Legend / Commander, then the first card that isn't a
 *     basic land or Energy, in zone order — so decks you built before icons existed get one for free.
 * Null when the deck has no cards yet, or its game's card data isn't loaded.
 */
export function resolveDeckIcon(deck: Deck, adapter: GameAdapter, cardsById: Map<string, Card>): Card | null {
  if (deck.iconCardId && isInDeck(deck, deck.iconCardId)) {
    const chosen = cardsById.get(deck.iconCardId)
    if (chosen) return chosen
  }

  let fallback: Card | null = null
  for (const zone of rulesForFormat(adapter, deck.formatId).zones) {
    if (zone.freeText) continue
    for (const { cardId, quantity } of deck.zones[zone.id] ?? []) {
      const card = cardsById.get(cardId)
      if (!card || quantity <= 0) continue
      fallback ??= card
      if (adapter.copyLimitFor?.(card) !== Infinity) return card // not a basic land / basic Energy
    }
  }
  return fallback
}
