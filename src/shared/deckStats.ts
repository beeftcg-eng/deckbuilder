import type { Card, Deck } from './types'
import { totalPrice, type PriceTotal } from './collection'

export interface DeckStats {
  /** Real cards across every zone (free-text zones like runes aren't counted). */
  totalCards: number
  byCategory: [string, number][]
  byColor: [string, number][]
  /** Counts per `card.subtypes` entry — for Yu-Gi-Oh this is Normal/Effect/Fusion/Synchro/XYZ/
   * Link/Pendulum/Ritual plus monster race, since that's what its `subtypes` carries (yugioh.ts).
   * Empty for games whose subtypes are sparse or absent, so the panel just shows nothing extra. */
  bySubtype: [string, number][]
  /** Copies at each cost from 0 up to the highest cost in the main zone. */
  curve: { cost: number; count: number }[]
  /** Average cost of main-zone cards that have a numeric cost, or null if none do. */
  averageCost: number | null
  price: PriceTotal
}

function sortedByCount(counts: Map<string, number>): [string, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/**
 * Summary numbers for the deck panel. The cost curve and average only look at
 * `mainZoneId` — the playable deck — so a Leader/Legend or a Battlefield's
 * cost doesn't skew them.
 */
export function computeDeckStats(deck: Deck, cardsById: Map<string, Card>, mainZoneId = 'main'): DeckStats {
  const categories = new Map<string, number>()
  const colors = new Map<string, number>()
  const subtypes = new Map<string, number>()
  const priced: { card: Card; quantity: number }[] = []
  let totalCards = 0

  for (const entries of Object.values(deck.zones)) {
    for (const { cardId, quantity } of entries) {
      const card = cardsById.get(cardId)
      if (!card) continue
      totalCards += quantity
      priced.push({ card, quantity })
      categories.set(card.category, (categories.get(card.category) ?? 0) + quantity)
      for (const color of card.colors) colors.set(color, (colors.get(color) ?? 0) + quantity)
      for (const subtype of card.subtypes) subtypes.set(subtype, (subtypes.get(subtype) ?? 0) + quantity)
    }
  }

  const costCounts = new Map<number, number>()
  let costSum = 0
  let costCards = 0
  for (const { cardId, quantity } of deck.zones[mainZoneId] ?? []) {
    const card = cardsById.get(cardId)
    if (!card || card.cost == null) continue
    const cost = Number(card.cost)
    if (!Number.isFinite(cost)) continue
    costCounts.set(cost, (costCounts.get(cost) ?? 0) + quantity)
    costSum += cost * quantity
    costCards += quantity
  }

  const maxCost = costCounts.size > 0 ? Math.max(...costCounts.keys()) : -1
  const curve: DeckStats['curve'] = []
  for (let cost = 0; cost <= maxCost; cost++) curve.push({ cost, count: costCounts.get(cost) ?? 0 })

  return {
    totalCards,
    byCategory: sortedByCount(categories),
    byColor: sortedByCount(colors),
    bySubtype: sortedByCount(subtypes),
    curve,
    averageCost: costCards > 0 ? costSum / costCards : null,
    price: totalPrice(priced),
  }
}
