import { getAdapter } from './games/registry'
import { rulesForFormat } from './games/rules'
import type { Card, Deck, DeckSummary } from './types'

/**
 * The readable digest saved on a deck as `deck.summary` (see types.ts), for apps that only see the
 * synced deck blob and not this app's card data - Pairings shows it for a deck imported from here.
 * Returns null when the deck has cards this catalog doesn't know (not loaded yet, or not synced),
 * so a half-known deck never overwrites a good summary with a wrong one.
 */
export function summarizeDeck(deck: Deck, cardsById: Map<string, Card>, formatLabel: string | null): DeckSummary | null {
  let cardCount = 0
  for (const entries of Object.values(deck.zones)) {
    for (const { cardId, quantity } of entries) {
      if (!cardsById.has(cardId)) return null
      cardCount += quantity
    }
  }
  const identityZoneId = rulesForFormat(getAdapter(deck.gameId), deck.formatId).identityZoneId
  const identity = identityZoneId ? (deck.zones[identityZoneId] ?? []).map((e) => cardsById.get(e.cardId) as Card) : []
  const colors: string[] = []
  for (const card of identity) {
    for (const color of card.colorIdentity ?? card.colors) if (!colors.includes(color)) colors.push(color)
  }
  return {
    leader: identity.length ? identity.map((c) => c.name).join(' / ') : null,
    colors,
    cardCount,
    formatLabel,
  }
}

/** The deck with a fresh summary, or unchanged (keeping any older summary) when one can't be worked out. */
export function withSummary(deck: Deck, cardsById: Map<string, Card>, formatLabel: string | null): Deck {
  const summary = summarizeDeck(deck, cardsById, formatLabel)
  return summary ? { ...deck, summary } : deck
}
