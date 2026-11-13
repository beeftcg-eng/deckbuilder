import type { Card, GameId } from './types'

/**
 * What a turn gives you to play cards with, for goldfishing in Practice (SampleHandModal.tsx):
 *
 * - One Piece: DON!! from the DON!! deck, 1 on the first player's first turn (2 going second), then
 *   2 more each turn, up to 10.
 * - Riftbound: runes channelled from the Rune Deck, 2 a turn (3 on the second player's first turn),
 *   up to 12; each gives one energy.
 * - Magic: the lands you've played (one a turn), each a mana.
 * - Pokémon: the Energy you've attached (one a turn). Cards have no cost to pay, so it's a count.
 * - Yu-Gi-Oh!: nothing to count.
 */
export type ResourceRule =
  | { kind: 'perTurn'; first: (onThePlay: boolean) => number; perTurn: number; max: number }
  | { kind: 'cards'; isResource: (card: Card) => boolean; paysCosts: boolean }

export function resourceRule(gameId: GameId): ResourceRule | null {
  switch (gameId) {
    case 'onepiece':
      return { kind: 'perTurn', first: (onThePlay) => (onThePlay ? 1 : 2), perTurn: 2, max: 10 }
    case 'riftbound':
      return { kind: 'perTurn', first: (onThePlay) => (onThePlay ? 2 : 3), perTurn: 2, max: 12 }
    case 'mtg':
      return { kind: 'cards', isResource: (c) => c.category === 'Land', paysCosts: true }
    case 'pokemon':
      return { kind: 'cards', isResource: (c) => c.category === 'Energy', paysCosts: false }
    default:
      return null
  }
}

/** The resources you have on `turn` (0 = before the first turn), with `inPlay` the cards played so far. */
export function resourcesAt(rule: ResourceRule, turn: number, onThePlay: boolean, inPlay: readonly Card[]): number {
  if (rule.kind === 'cards') return inPlay.filter(rule.isResource).length
  if (turn <= 0) return 0
  return Math.min(rule.max, rule.first(onThePlay) + rule.perTurn * (turn - 1))
}

/** A card's cost to play (Magic's mana value, One Piece's and Riftbound's cost), or null when it has none. */
export function playCost(rule: ResourceRule | null, card: Card): number | null {
  if (!rule || (rule.kind === 'cards' && (!rule.paysCosts || rule.isResource(card)))) return null
  const n = card.cost == null ? NaN : Number.parseFloat(card.cost)
  return Number.isFinite(n) && n >= 0 ? n : null
}
