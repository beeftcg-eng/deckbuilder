import type { Card } from './types'

/** Cards with no price in `fresh` take the one they had in `previous` (matched by id), so a flaky price source can't wipe known prices. */
export function carryOverPrices(fresh: Card[], previous: readonly Card[]): Card[] {
  const known = new Map<string, number>()
  for (const card of previous) if (card.price != null) known.set(card.id, card.price)
  if (known.size === 0) return fresh
  return fresh.map((card) => (card.price == null && known.has(card.id) ? { ...card, price: known.get(card.id)! } : card))
}
