import type { Card } from '../types'
import type { GameState } from './riftbound'

/**
 * A practice game as compact JSON, for saving it to resume later and for sending it to the other
 * player in an online game: each card is just its id (both ends have the card data), except the
 * tokens the game made up, which travel whole.
 */
const isToken = (id: string) => id.startsWith('riftbound:token-')

export function packState(state: GameState): string {
  return JSON.stringify(state, (_key, value: unknown) => {
    if (value && typeof value === 'object' && 'gameId' in value && 'sourceId' in value && 'name' in value) {
      const card = value as Card
      if (!isToken(card.id)) return { $card: card.id }
    }
    return value
  })
}

/** The game back, its cards from `cardsById`; null when it can't be read or a card is missing. */
export function unpackState(packed: string, cardsById: Map<string, Card>): GameState | null {
  let missing = false
  try {
    const state = JSON.parse(packed, (_key, value: unknown) => {
      if (value && typeof value === 'object' && '$card' in value) {
        const card = cardsById.get(String((value as { $card: unknown }).$card))
        if (!card) missing = true
        return card ?? null
      }
      return value
    }) as GameState
    if (missing || !state || !Array.isArray(state.players) || !Array.isArray(state.battlefields)) return null
    // Saved before hidden cards existed.
    for (const bf of state.battlefields) bf.hidden ??= []
    state.manual ??= []
    return state
  } catch {
    return null
  }
}
