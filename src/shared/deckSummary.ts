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
    listHash: deckListHash(deck),
  }
}

/**
 * A short fingerprint of the deck's card list (every zone's cards and quantities, in any order).
 * Pairings compares it with the one it last synced: a change starts a new version of the deck
 * there, so results can be told apart by list, and Brewhouse reminds you to sync until it matches.
 * Needs no card data, so it stays current even before a game's cards are loaded.
 */
export function deckListHash(deck: Deck): string {
  const lines: string[] = []
  for (const [zoneId, entries] of Object.entries(deck.zones ?? {})) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (entry && typeof entry.cardId === 'string' && entry.quantity > 0) lines.push(`${zoneId}|${entry.cardId}|${entry.quantity}`)
    }
  }
  const text = lines.sort().join('\n')
  // Two 32-bit FNV-1a passes with different seeds: 16 hex characters, plenty for one person's decks.
  const fnv = (seed: number) => {
    let h = seed >>> 0
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    return h.toString(16).padStart(8, '0')
  }
  return fnv(0x811c9dc5) + fnv(0x2f2e9c3b)
}

/** The deck with a fresh summary, or unchanged (keeping any older summary) when one can't be worked out. */
export function withSummary(deck: Deck, cardsById: Map<string, Card>, formatLabel: string | null): Deck {
  const summary = summarizeDeck(deck, cardsById, formatLabel)
  return summary ? { ...deck, summary } : withListHash(deck)
}

/** An older summary with only its card-list fingerprint brought up to date (card data not loaded). */
export function withListHash(deck: Deck): Deck {
  if (!deck.summary) return deck
  const listHash = deckListHash(deck)
  return deck.summary.listHash === listHash ? deck : { ...deck, summary: { ...deck.summary, listHash } }
}
