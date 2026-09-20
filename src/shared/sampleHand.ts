import type { Card, Deck } from './types'

/** Fisher–Yates; returns a new array. `random` is injectable so tests are deterministic. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** One array slot per physical copy of each card in the zone, so a 4-of appears four times. */
export function expandZone(deck: Deck, zoneId: string, cardsById: Map<string, Card>): Card[] {
  const cards: Card[] = []
  for (const { cardId, quantity } of deck.zones[zoneId] ?? []) {
    const card = cardsById.get(cardId)
    if (!card) continue
    for (let i = 0; i < quantity; i++) cards.push(card)
  }
  return cards
}
