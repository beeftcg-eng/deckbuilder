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

/** n choose k, as a float (fine for deck sizes: at most a few hundred cards). */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  k = Math.min(k, n - k)
  let result = 1
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i
  return result
}

/**
 * The chance of seeing at least `atLeast` of `copies` cards when looking at `seen` cards of a
 * `deckSize`-card deck (hypergeometric): e.g. a 2-drop by turn 2.
 */
export function chanceAtLeast(deckSize: number, copies: number, seen: number, atLeast: number): number {
  if (atLeast <= 0) return 1
  seen = Math.min(seen, deckSize)
  const total = choose(deckSize, seen)
  if (!total) return 0
  let p = 0
  for (let k = atLeast; k <= Math.min(copies, seen); k++) p += (choose(copies, k) * choose(deckSize - copies, seen - k)) / total
  return Math.min(1, Math.max(0, p))
}

/** Cards seen by the start of turn `turn` (0 = the opening hand): one draw a turn, none on turn 1 when on the play. */
export function cardsSeenBy(handSize: number, turn: number, onThePlay: boolean): number {
  if (turn <= 0) return handSize
  return handSize + turn - (onThePlay ? 1 : 0)
}
