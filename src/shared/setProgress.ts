import type { Card, Collection } from './types'

/** One expansion in a game's card data, and how much of it you own. */
export interface SetSummary {
  setId: string
  setName: string
  setCode: string
  /** Cards in the set (each printing counts once). */
  total: number
  /** How many of those you own at least one copy of. */
  owned: number
  /** Copies owned across the set. */
  copies: number
}

export function cardsInSet(cards: readonly Card[], setId: string): Card[] {
  return cards.filter((c) => c.setId === setId)
}

/** Every set in `cards`, A–Z by name, with your collection progress in each. */
export function summarizeSets(cards: readonly Card[], collection: Collection): SetSummary[] {
  const sets = new Map<string, SetSummary>()
  for (const card of cards) {
    let summary = sets.get(card.setId)
    if (!summary) {
      summary = { setId: card.setId, setName: card.setName, setCode: card.setCode, total: 0, owned: 0, copies: 0 }
      sets.set(card.setId, summary)
    }
    summary.total += 1
    const copies = collection[card.id] ?? 0
    if (copies > 0) {
      summary.owned += 1
      summary.copies += copies
    }
  }
  return [...sets.values()].sort((a, b) => a.setName.localeCompare(b.setName))
}

/**
 * The copies to add so you own at least `copiesEach` of every card in `cards`. It tops up rather than adds,
 * so running it twice (or over a set you half-own) never overshoots.
 */
export function topUpItems(cards: readonly Card[], collection: Collection, copiesEach: number): { cardId: string; quantity: number }[] {
  const items: { cardId: string; quantity: number }[] = []
  for (const card of cards) {
    const missing = copiesEach - (collection[card.id] ?? 0)
    if (missing > 0) items.push({ cardId: card.id, quantity: missing })
  }
  return items
}

/** Cards you don't own any copy of and haven't wishlisted yet. */
export function unownedUnwishlisted(cards: readonly Card[], collection: Collection, wishlistedCardIds: ReadonlySet<string>): Card[] {
  return cards.filter((c) => (collection[c.id] ?? 0) <= 0 && !wishlistedCardIds.has(c.id))
}
